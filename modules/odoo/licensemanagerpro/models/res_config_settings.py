# -*- coding: utf-8 -*-
"""LicenseManagerPro connection settings.

Stored in ``ir.config_parameter`` (the standard Odoo settings store)
under the ``licensemanagerpro.*`` keys. The API key is shown with a
password widget in the settings form and is never printed in logs.

There is exactly one credential: the module-scoped API key. No admin
email/password is stored or used anywhere in this module.
"""

from odoo import api, fields, models

from .lmp_api_client import LmpApiError, LmpAuthError, build_client_from_params

#: ir.config_parameter keys used by this module.
PARAM_API_URL = "licensemanagerpro.api_url"
PARAM_API_KEY = "licensemanagerpro.api_key"
PARAM_SIGN_REQUESTS = "licensemanagerpro.sign_requests"


class LmpResConfigSettings(models.TransientModel):
    _inherit = "res.config.settings"

    lmp_api_url = fields.Char(
        string="LicenseManagerPro URL",
        config_parameter=PARAM_API_URL,
        help="Root URL of the LicenseManagerPro panel, e.g. "
        "https://licenses.example.com (no trailing /api — it is "
        "added automatically).",
    )
    lmp_api_key = fields.Char(
        string="Module API Key",
        config_parameter=PARAM_API_KEY,
        help="A module-scoped API key created in the "
        "LicenseManagerPro panel (API Keys -> New Key, scopes "
        "licenses + products read). The secret is shown once in the "
        "panel; paste it here.",
    )
    lmp_sign_requests = fields.Boolean(
        string="Sign requests (HMAC)",
        config_parameter=PARAM_SIGN_REQUESTS,
        help="When enabled, every request also carries "
        "X-LMP-Timestamp and X-LMP-Signature (HMAC-SHA256). "
        "The server rejects timestamps older than five minutes.",
    )

    @api.model
    def _get_client(self):
        params = self.env["ir.config_parameter"].sudo()
        return build_client_from_params(
            params.get_param(PARAM_API_URL),
            params.get_param(PARAM_API_KEY),
            sign_requests=params.get_param(PARAM_SIGN_REQUESTS, "False")
            == "True",
        )

    def action_test_connection(self):
        """Test Connection button: GET /system/info. Success proves
        the URL, the key and the network path; any failure is shown
        as an error notification and nothing is changed."""
        self.ensure_one()
        try:
            client = self._get_client()
            info = client.test_connection()
        except LmpAuthError as exc:
            return self._notify(str(exc), "danger")
        except LmpApiError as exc:
            return self._notify(str(exc), "danger")
        version = info.get("version", "unknown") if isinstance(info, dict) else "unknown"
        return self._notify(
            "Connected to LicenseManagerPro (backend version %s)."
            % version,
            "success",
        )

    @staticmethod
    def _notify(message, notification_type):
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
