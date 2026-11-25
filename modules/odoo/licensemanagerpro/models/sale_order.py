# -*- coding: utf-8 -*-
"""Mint LicenseManagerPro licenses when a sale order is confirmed.

FAIL-CLOSED DECISION (deliberate, documented here and in the README):
when the backend rejects the request (HTTP 401/403 — bad, expired,
revoked or out-of-scope API key, or a failed request signature) or is
unreachable, NO license is minted, a clear note is posted on the
order's chatter and a to-do activity is created for the salesperson.
The order itself STILL confirms: blocking a sale (and its invoice,
delivery and payment flow) because a licensing API is down or a key
expired would do more damage than a missing license, which can be
minted afterwards from the Licenses menu. The failure is therefore
loud (chatter + activity + server log) but non-blocking. Nothing
about the failure is ever hidden or retried silently.
"""

from odoo import models

from .lmp_api_client import LmpApiError, LmpAuthError, map_billing_cycle


class SaleOrder(models.Model):
    _inherit = "sale.order"

    def action_confirm(self):
        result = super().action_confirm()
        self._lmp_mint_licenses()
        return result

    def _lmp_mint_licenses(self):
        """Mint one license per mapped, not-yet-minted order line."""
        mapping_model = self.env["lmp.product.mapping"]
        license_model = self.env["lmp.license"]
        for order in self:
            owner_email = (order.partner_id.email or "").strip()
            if not owner_email:
                order.message_post(
                    body="LicenseManagerPro: no license minted — the "
                    "customer has no e-mail address on file."
                )
                continue
            try:
                client = license_model._get_client()
            except LmpApiError as exc:
                self._lmp_note_failure(order, str(exc))
                continue
            for line in order.order_line:
                if not line.product_id:
                    continue
                mapping = mapping_model.get_mapping_for_product(
                    line.product_id.id
                )
                if not mapping:
                    continue
                if license_model.search(
                    [("order_line_id", "=", line.id)], limit=1
                ):
                    continue  # Already minted for this line.
                self._lmp_mint_one_line(
                    order, line, mapping, client, owner_email
                )

    def _lmp_mint_one_line(self, order, line, mapping, client, owner_email):
        license_model = self.env["lmp.license"]
        cycle = map_billing_cycle(mapping.billing_cycle)
        try:
            product = client.get_product_by_slug(mapping.lmp_slug)
            if not product:
                raise LmpApiError(
                    "LicenseManagerPro product with slug '%s' was "
                    "not found." % mapping.lmp_slug
                )
            payload = client.create_license(
                product["id"],
                owner_email,
                billing_cycle=cycle,
            )
        except LmpAuthError as exc:
            # Fail closed: no license minted; loud note + activity.
            self._lmp_note_failure(order, str(exc), line=line)
            return
        except LmpApiError as exc:
            self._lmp_note_failure(order, str(exc), line=line)
            return
        record = license_model._sync_from_payload(
            payload, order=order, order_line=line
        )
        order.message_post(
            body="LicenseManagerPro: license <b>%s</b> minted for "
            "product <b>%s</b> (%s)."
            % (record.key, mapping.lmp_slug, cycle or "no cycle sent")
        )

    def _lmp_note_failure(self, order, message, line=None):
        """Post a clear chatter note, create a to-do activity for the
        salesperson, and write the failure to the server log. The
        order stays confirmed by design (see the module docstring)."""
        product_label = (
            " for product <b>%s</b>" % line.product_id.display_name
            if line
            else ""
        )
        order.message_post(
            body="LicenseManagerPro: <b>no license was minted</b>%s. "
            "%s Please fix the connection/key and mint the license "
            "manually from Sales &gt; LicenseManagerPro &gt; Licenses."
            % (product_label, message)
        )
        activity_type = self.env.ref(
            "mail.mail_activity_data_todo", raise_if_not_found=False
        )
        if activity_type and order.user_id:
            order.activity_schedule(
                activity_type.id,
                user_id=order.user_id.id,
                summary="LicenseManagerPro: license not minted",
                note=message,
            )
        self.env["ir.logging"].sudo().create(
            {
                "name": "licensemanagerpro",
                "type": "server",
                "level": "WARNING",
                "message": "License minting failed for order %s: %s"
                % (order.name, message),
                "path": "sale.order",
                "func": "_lmp_mint_licenses",
                "line": "0",
            }
        )
