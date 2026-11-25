# -*- coding: utf-8 -*-
"""Customer portal: My Licenses.

The logged-in partner sees only their own licenses, looked up live
from the LicenseManagerPro backend by the partner's e-mail
(GET /licenses?search=<email>). The detail page re-checks ownership:
a license whose owner e-mail does not match the logged-in partner
returns 404, so guessing another license's id in the URL can never
leak it (fail closed).
"""

from odoo import http
from odoo.addons.portal.controllers.portal import CustomerPortal
from odoo.http import request

from ..models.lmp_api_client import LmpApiError, LmpAuthError

#: How many licenses are shown per portal page.
PORTAL_PAGE_SIZE = 20


class LmpPortal(CustomerPortal):
    def _lmp_client(self):
        return request.env["lmp.license"].sudo()._get_client()

    def _lmp_partner_email(self):
        partner = request.env.user.partner_id
        return (partner.email or "").strip()

    @http.route(
        ["/my/licenses", "/my/licenses/page/<int:page>"],
        type="http",
        auth="user",
        website=True,
    )
    def my_licenses(self, page=1, **kw):
        email = self._lmp_partner_email()
        licenses = []
        error = None
        if not email:
            error = (
                "Your account has no e-mail address, so no licenses "
                "can be looked up. Please update your contact details."
            )
        else:
            try:
                client = self._lmp_client()
                licenses = client.list_licenses(search=email)
            except LmpAuthError:
                error = (
                    "LicenseManagerPro rejected the request. The shop "
                    "administrator needs to check the API key."
                )
            except LmpApiError as exc:
                error = str(exc)
        # Keep only this partner's own licenses, even if the backend
        # search matched more broadly.
        own = [
            lic
            for lic in licenses
            if isinstance(lic, dict)
            and (lic.get("owner_email") or "").strip().lower()
            == email.lower()
        ]
        pager = request.website.pager(
            url="/my/licenses",
            total=len(own),
            page=page,
            step=PORTAL_PAGE_SIZE,
            scope=5,
        )
        values = {
            "licenses": own[
                pager["offset"] : pager["offset"] + PORTAL_PAGE_SIZE
            ],
            "pager": pager,
            "error": error,
            "page_name": "licenses",
            "default_url": "/my/licenses",
        }
        return request.render(
            "licensemanagerpro.portal_my_licenses", values
        )

    @http.route(
        ["/my/licenses/<int:license_id>"],
        type="http",
        auth="user",
        website=True,
    )
    def my_license_detail(self, license_id, **kw):
        email = self._lmp_partner_email()
        try:
            client = self._lmp_client()
            license_ = client.get_license(license_id)
        except (LmpAuthError, LmpApiError):
            return request.not_found()
        # Ownership check: never show another customer's license.
        if not email or (license_.get("owner_email") or "").strip().lower() != email.lower():
            return request.not_found()
        return request.render(
            "licensemanagerpro.portal_my_license_detail",
            {"license": license_, "page_name": "licenses"},
        )
