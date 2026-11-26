# -*- coding: utf-8 -*-
{
    "name": "LicenseManagerPro",
    "version": "3.0.0",
    "category": "Sales/Licensing",
    "summary": "Mint and manage LicenseManagerPro licenses from Odoo sales.",
    "description": """
LicenseManagerPro for Odoo
===========================

Connects Odoo to a LicenseManagerPro backend and mints a license
automatically when a sale order containing a mapped product is
confirmed.

* API-key authentication only (no admin email/password anywhere).
* Optional HMAC-signed requests (X-LMP-Timestamp / X-LMP-Signature).
* TLS verification is always on and can never be disabled.
* Billing-cycle sync: the mapped product's cycle is sent with every
  license create/renew; the backend adds a missing cycle to the
  product automatically.
* A customer portal page (My Licenses) lists the logged-in partner's
  licenses.
    """,
    "author": "LicenseManagerPro",
    "website": "https://github.com/rzatkv/LicenseManagerPro",
    "license": "LGPL-3",
    "depends": ["base", "sale", "portal"],
    "data": [
        "security/ir.model.access.csv",
        "security/lmp_security.xml",
        "views/lmp_views.xml",
        "views/res_config_settings_views.xml",
        "views/portal_templates.xml",
    ],
    "installable": True,
    "application": True,
    "auto_install": False,
}
