<?php
/**
 * License Manager Pro — "My licenses" front controller.
 *
 * Logged-in customers see every license the backend holds for their
 * email address, as branded cards.
 */

declare(strict_types=1);

if (!defined('_PS_VERSION_')) {
    exit;
}

class LicenseManagerProLicensesModuleFrontController extends ModuleFrontController
{
    public $auth = true;
    public $ssl = true;

    public function initContent(): void
    {
        parent::initContent();

        $customer = $this->context->customer;
        $licenses = [];
        $error = '';
        if (Validate::isLoadedObject($customer) && $customer->email !== '') {
            $client = LmpApiClient::fromConfiguration();
            $result = $client->listLicensesByEmail((string) $customer->email);
            if ($result['ok'] && is_array($result['data'])) {
                foreach ($result['data'] as $row) {
                    if (is_array($row)) {
                        $licenses[] = LmpLicense::fromArray($row);
                    }
                }
            } else {
                $error = (string) $result['error'];
            }
        }

        $this->context->smarty->assign([
            'lmp_licenses' => $licenses,
            'lmp_error' => $error,
            'lmp_customer_email' => Validate::isLoadedObject($customer) ? (string) $customer->email : '',
        ]);
        $this->setTemplate('module:licensemanagerpro/views/templates/front/licenses.tpl');
    }
}
