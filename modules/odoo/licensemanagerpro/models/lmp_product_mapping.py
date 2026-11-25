# -*- coding: utf-8 -*-
"""Mapping between an Odoo product and a LicenseManagerPro product.

Odoo sale order lines carry no billing cycle of their own, so each
mapping states the LicenseManagerPro cycle explicitly. Only a cycle
from the six known LicenseManagerPro cycles is ever sent: when the
mapping has no cycle, the license-create call omits ``billing_cycle``
entirely (and the backend then rejects a ``product_id``-based create,
so a cycle is effectively required for minting — see the README).
"""

from odoo import api, fields, models

from .lmp_api_client import LMP_BILLING_CYCLES, LMP_BILLING_CYCLE_LABELS


class LmpProductMapping(models.Model):
    _name = "lmp.product.mapping"
    _description = "LicenseManagerPro Product Mapping"
    _order = "product_id"

    product_id = fields.Many2one(
        "product.product",
        string="Odoo Product",
        required=True,
        ondelete="cascade",
        help="The Odoo product sold on the order line.",
    )
    lmp_slug = fields.Char(
        string="LicenseManagerPro Product Slug",
        required=True,
        help="Slug of the product in the LicenseManagerPro panel "
        "(Products page). Resolved to the backend product id at "
        "mint time via GET /products?slug=.",
    )
    billing_cycle = fields.Selection(
        selection=[
            (cycle, LMP_BILLING_CYCLE_LABELS[cycle])
            for cycle in LMP_BILLING_CYCLES
        ],
        string="Billing Cycle",
        help="The cycle sent with every license create/renew for "
        "this product. The backend adds it to the product "
        "automatically when the product does not list it yet. "
        "Leave empty to omit the cycle from the request.",
    )
    active = fields.Boolean(string="Active", default=True)

    _sql_constraints = [
        (
            "lmp_product_mapping_unique",
            "unique(product_id)",
            "Each Odoo product can have only one LicenseManagerPro mapping.",
        ),
    ]

    @api.model
    def get_mapping_for_product(self, product_id):
        """Return the active mapping for an Odoo product id, or an
        empty recordset when the product is not mapped."""
        return self.search(
            [("product_id", "=", product_id), ("active", "=", True)],
            limit=1,
        )
