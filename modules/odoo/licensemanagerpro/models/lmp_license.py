# -*- coding: utf-8 -*-
"""Cached mirror of a LicenseManagerPro license record.

``lmp.license`` is a local copy of the backend record: it is created
when a sale order mints a license and refreshed on demand from the
API (Sync button). The backend is always the source of truth — this
model never invents license data, and every write goes through the
API first (revoke/renew) and only then updates the local copy.
"""

from odoo import api, fields, models

from .lmp_api_client import (
    LMP_BILLING_CYCLES,
    LMP_BILLING_CYCLE_LABELS,
    LMP_LICENSE_STATUSES,
    LmpApiError,
    LmpAuthError,
    build_client_from_params,
)

#: Selection shown for the license status.
STATUS_SELECTION = [
    ("active", "Active"),
    ("inactive", "Inactive"),
    ("revoked", "Revoked"),
    ("expired", "Expired"),
]


class LmpLicense(models.Model):
    _name = "lmp.license"
    _description = "LicenseManagerPro License"
    _rec_name = "key"
    _order = "create_date desc"

    key = fields.Char(
        string="License Key", required=True, index=True, readonly=True
    )
    lmp_id = fields.Integer(
        string="Backend ID", readonly=True, index=True,
        help="The license id on the LicenseManagerPro backend.",
    )
    product_name = fields.Char(string="Product", readonly=True)
    product_id_lmp = fields.Integer(string="Backend Product ID", readonly=True)
    billing_cycle = fields.Selection(
        selection=[
            (cycle, LMP_BILLING_CYCLE_LABELS[cycle])
            for cycle in LMP_BILLING_CYCLES
        ],
        string="Billing Cycle",
        readonly=True,
    )
    owner_email = fields.Char(string="Owner E-mail", index=True, readonly=True)
    status = fields.Selection(
        selection=STATUS_SELECTION, string="Status", default="active",
        readonly=True,
    )
    expires_at = fields.Datetime(string="Expires At", readonly=True)
    max_activations = fields.Integer(string="Max Activations", readonly=True)
    activations = fields.Integer(string="Activations", readonly=True)
    partner_id = fields.Many2one(
        "res.partner", string="Customer", readonly=True,
        help="Matched from the owner e-mail when a partner exists.",
    )
    order_id = fields.Many2one(
        "sale.order", string="Sale Order", readonly=True, ondelete="set null",
        help="The order that minted this license, if any.",
    )
    order_line_id = fields.Many2one(
        "sale.order.line", string="Order Line", readonly=True,
        ondelete="set null",
        help="The order line that minted this license, if any.",
    )

    # -- API helpers ------------------------------------------------------

    @api.model
    def _get_client(self):
        """Build the configured API client, or raise LmpApiError with a
        clear message when the settings are incomplete."""
        params = self.env["ir.config_parameter"].sudo()
        return build_client_from_params(
            params.get_param("licensemanagerpro.api_url"),
            params.get_param("licensemanagerpro.api_key"),
            sign_requests=params.get_param(
                "licensemanagerpro.sign_requests", "False"
            ) == "True",
        )

    @api.model
    def _sync_from_payload(self, payload, order=None, order_line=None):
        """Create or update the local mirror for one backend license
        dict. Returns the ``lmp.license`` record."""
        values = self._values_from_payload(payload)
        if order is not None:
            values["order_id"] = order.id
        if order_line is not None:
            values["order_line_id"] = order_line.id
        partner = self._find_partner(payload.get("owner_email"))
        if partner:
            values["partner_id"] = partner.id
        existing = self.search(
            [("lmp_id", "=", payload.get("id"))], limit=1
        ) if payload.get("id") else self.browse()
        if existing:
            existing.write(values)
            return existing
        return self.create(values)

    @api.model
    def _values_from_payload(self, payload):
        """Map a backend license dict onto local field values. Unknown
        status/cycle values are dropped rather than stored, so the
        local mirror can never hold a value the backend does not know."""
        status = payload.get("status")
        if status not in LMP_LICENSE_STATUSES:
            status = "inactive"
        cycle = payload.get("billing_cycle")
        if cycle not in LMP_BILLING_CYCLES:
            cycle = False
        return {
            "key": payload.get("key") or "",
            "lmp_id": payload.get("id") or 0,
            "product_name": payload.get("product") or "",
            "product_id_lmp": payload.get("product_id") or 0,
            "billing_cycle": cycle,
            "owner_email": payload.get("owner_email") or "",
            "status": status,
            "expires_at": payload.get("expires_at") or False,
            "max_activations": payload.get("max_activations") or 0,
            "activations": payload.get("activations") or 0,
        }

    @api.model
    def _find_partner(self, email):
        if not email:
            return self.env["res.partner"].browse()
        return self.env["res.partner"].search(
            [("email", "=ilike", email.strip())], limit=1
        )

    # -- user actions -----------------------------------------------------

    def action_sync(self):
        """Refresh this record from the backend (Sync button)."""
        self.ensure_one()
        client = self._get_client()
        try:
            payload = client.get_license(self.lmp_id)
        except LmpAuthError as exc:
            self._notify_auth_failure(str(exc))
            return self._action_notify(
                "LicenseManagerPro rejected the request. %s" % exc,
                "danger",
            )
        except LmpApiError as exc:
            return self._action_notify(str(exc), "danger")
        self.write(self._values_from_payload(payload))
        return self._action_notify(
            "License %s refreshed from LicenseManagerPro." % self.key,
            "success",
        )

    def action_revoke(self):
        """Revoke on the backend first, then mark the local copy
        revoked. If the API call fails, nothing changes locally."""
        self.ensure_one()
        client = self._get_client()
        try:
            client.revoke_license(self.lmp_id)
        except LmpAuthError as exc:
            self._notify_auth_failure(str(exc))
            return self._action_notify(
                "LicenseManagerPro rejected the request. %s" % exc,
                "danger",
            )
        except LmpApiError as exc:
            return self._action_notify(str(exc), "danger")
        self.write({"status": "revoked"})
        return self._action_notify(
            "License %s revoked." % self.key, "warning"
        )

    def action_renew(self):
        """Renew on the backend (by the license's billing cycle), then
        refresh the local copy from the response."""
        self.ensure_one()
        client = self._get_client()
        try:
            payload = client.renew_license(self.lmp_id)
        except LmpAuthError as exc:
            self._notify_auth_failure(str(exc))
            return self._action_notify(
                "LicenseManagerPro rejected the request. %s" % exc,
                "danger",
            )
        except LmpApiError as exc:
            return self._action_notify(str(exc), "danger")
        self.write(self._values_from_payload(payload))
        return self._action_notify(
            "License %s renewed." % self.key, "success"
        )

    # -- helpers ----------------------------------------------------------

    @api.model
    def _notify_auth_failure(self, message):
        """Log an auth failure so an admin can see the key/scope
        problem without opening the server log."""
        self.env["ir.logging"].sudo().create(
            {
                "name": "licensemanagerpro",
                "type": "server",
                "level": "WARNING",
                "message": message,
                "path": "lmp.license",
                "func": "_notify_auth_failure",
                "line": "0",
            }
        )

    @staticmethod
    def _action_notify(message, notification_type):
        return {
            "type": "ir.actions.client",
            "tag": "display_notification",
            "params": {
                "title": "LicenseManagerPro",
                "message": message,
                "type": notification_type,
                "sticky": notification_type == "danger",
            },
        }
