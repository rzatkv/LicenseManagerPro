<?php
/**
 * License Manager Pro — admin settings controller.
 *
 * HelperForm for the connection settings (API URL, scoped module API
 * key, signed-requests toggle, Test connection) plus a product mapping
 * form: PrestaShop product -> License Manager Pro product slug, with
 * the billing cycle that is sent when a license is minted. The LMP
 * product list is loaded live from GET /products; if the API cannot
 * be reached, the slug can be typed in manually.
 */

declare(strict_types=1);

if (!defined('_PS_VERSION_')) {
    exit;
}

class AdminLicensemanagerproSettingsController extends ModuleAdminController
{
    public function __construct()
    {
        $this->bootstrap = true;
        parent::__construct();
        $this->module = Module::getInstanceByName('licensemanagerpro');
    }

    /**
     * This controller renders a settings form, not a list.
     */
    public function renderList(): string
    {
        return '';
    }

    public function initContent(): void
    {
        parent::initContent();
        $this->context->smarty->assign($this->getTemplateVariables());
        $template = $this->context->smarty->fetch(
            _PS_MODULE_DIR_ . 'licensemanagerpro/views/templates/admin/configure.tpl'
        );
        $this->content = $template . $this->renderForm();
        $this->context->smarty->assign('content', $this->content);
    }

    public function postProcess(): void
    {
        if (Tools::isSubmit('submitLmpSaveSettings')) {
            $this->processSaveSettings();
        } elseif (Tools::isSubmit('submitLmpTestConnection')) {
            $this->processTestConnection();
        } elseif (Tools::isSubmit('submitLmpMappingAdd')) {
            $this->processMappingAdd();
        } elseif (Tools::isSubmit('submitLmpMappingDelete')) {
            $this->processMappingDelete();
        }
    }

    public function renderForm(): string
    {
        $helper = new HelperForm();
        $helper->show_toolbar = false;
        $helper->table = $this->table;
        $helper->module = $this->module;
        $helper->default_form_language = (int) $this->context->language->id;
        $helper->allow_employee_form_lang = (int) Configuration::get('PS_BO_ALLOW_EMPLOYEE_FORM_LANG', 0);
        $helper->identifier = $this->identifier;
        $helper->submit_action = 'submitLmpSaveSettings';
        $helper->currentIndex = $this->context->link->getAdminLink('AdminLicensemanagerproSettings');
        $helper->token = Tools::getAdminTokenLite('AdminLicensemanagerproSettings');
        $helper->tpl_vars = [
            'fields_value' => $this->getConfigFieldsValues(),
            'languages' => Language::getLanguages(false),
            'id_language' => $this->context->language->id,
        ];

        return $helper->generateForm([$this->getSettingsForm()]);
    }

    /**
     * @return array<string, mixed>
     */
    private function getConfigFieldsValues(): array
    {
        return [
            LicenseManagerPro::CONFIG_API_URL => Configuration::get(LicenseManagerPro::CONFIG_API_URL),
            LicenseManagerPro::CONFIG_API_KEY => Configuration::get(LicenseManagerPro::CONFIG_API_KEY),
            LicenseManagerPro::CONFIG_SIGNED_REQUESTS => Configuration::get(LicenseManagerPro::CONFIG_SIGNED_REQUESTS),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function getSettingsForm(): array
    {
        return [
            'form' => [
                'legend' => [
                    'title' => $this->l('License Manager Pro connection'),
                    'icon' => 'icon-key',
                ],
                'input' => [
                    [
                        'type' => 'text',
                        'label' => $this->l('License Manager Pro URL'),
                        'name' => LicenseManagerPro::CONFIG_API_URL,
                        'desc' => $this->l('Base URL of your License Manager Pro panel, without a trailing slash or /api. Example: https://licenses.example.com'),
                        'required' => true,
                    ],
                    [
                        'type' => 'password',
                        'label' => $this->l('Module API key'),
                        'name' => LicenseManagerPro::CONFIG_API_KEY,
                        'desc' => $this->l('A module-scoped API key created in the License Manager Pro panel. It is shown once when created — paste it here and keep it secret. No admin email or password is used.'),
                        'required' => true,
                    ],
                    [
                        'type' => 'switch',
                        'label' => $this->l('Sign requests (HMAC)'),
                        'name' => LicenseManagerPro::CONFIG_SIGNED_REQUESTS,
                        'is_bool' => true,
                        'desc' => $this->l('Send X-LMP-Timestamp and X-LMP-Signature headers (HMAC-SHA256) with every request. The server rejects timestamps older than 5 minutes.'),
                        'values' => [
                            ['id' => 'signed_on', 'value' => 1, 'label' => $this->l('Enabled')],
                            ['id' => 'signed_off', 'value' => 0, 'label' => $this->l('Disabled')],
                        ],
                    ],
                ],
                'submit' => [
                    'title' => $this->l('Save'),
                ],
            ],
        ];
    }

    private function processSaveSettings(): void
    {
        $apiUrl = rtrim((string) Tools::getValue(LicenseManagerPro::CONFIG_API_URL), '/');
        $apiKey = (string) Tools::getValue(LicenseManagerPro::CONFIG_API_KEY);
        $signed = (int) Tools::getValue(LicenseManagerPro::CONFIG_SIGNED_REQUESTS) === 1;

        if ($apiUrl === '' || !Validate::isUrl($apiUrl)) {
            $this->errors[] = $this->l('Enter a valid License Manager Pro URL.');

            return;
        }
        if (str_starts_with($apiUrl, 'http://') && !str_starts_with($apiUrl, 'http://localhost')) {
            $this->errors[] = $this->l('The License Manager Pro URL must use HTTPS (plain HTTP is only allowed for localhost testing).');

            return;
        }
        if ($apiKey === '') {
            $this->errors[] = $this->l('Enter the module API key.');

            return;
        }

        Configuration::updateValue(LicenseManagerPro::CONFIG_API_URL, $apiUrl);
        Configuration::updateValue(LicenseManagerPro::CONFIG_API_KEY, $apiKey);
        Configuration::updateValue(LicenseManagerPro::CONFIG_SIGNED_REQUESTS, $signed ? 1 : 0);
        $this->confirmations[] = $this->l('Settings saved.');
    }

    private function processTestConnection(): void
    {
        $client = LmpApiClient::fromConfiguration();
        $result = $client->testConnection();
        if ($result['ok']) {
            $this->confirmations[] = $this->l('Connection successful: License Manager Pro answered GET /system/info.');
        } else {
            $this->errors[] = $this->l('Connection failed: ') . $result['error'];
        }
    }

    private function processMappingAdd(): void
    {
        $productId = (int) Tools::getValue('lmp_ps_product_id');
        $slug = trim((string) Tools::getValue('lmp_slug'));
        $cycle = (string) Tools::getValue('lmp_cycle');

        $product = new Product($productId);
        if (!Validate::isLoadedObject($product)) {
            $this->errors[] = $this->l('Select a valid PrestaShop product.');

            return;
        }
        if ($slug === '') {
            $this->errors[] = $this->l('Enter or select a License Manager Pro product slug.');

            return;
        }
        if ($cycle !== '' && !in_array($cycle, LmpApiClient::VALID_BILLING_CYCLES, true)) {
            $this->errors[] = $this->l('Select a valid billing cycle.');

            return;
        }

        /** @var LicenseManagerPro $module */
        $module = $this->module;
        $mapping = $module->getMapping();
        $mapping[$productId] = ['slug' => $slug, 'cycle' => $cycle === '' ? null : $cycle];
        if ($module->saveMapping($mapping)) {
            $this->confirmations[] = $this->l('Product mapping saved.');
        } else {
            $this->errors[] = $this->l('Could not save the product mapping.');
        }
    }

    private function processMappingDelete(): void
    {
        $productId = (int) Tools::getValue('lmp_delete_product_id');

        /** @var LicenseManagerPro $module */
        $module = $this->module;
        $mapping = $module->getMapping();
        unset($mapping[$productId]);
        if ($module->saveMapping($mapping)) {
            $this->confirmations[] = $this->l('Product mapping removed.');
        } else {
            $this->errors[] = $this->l('Could not remove the product mapping.');
        }
    }

    /**
     * @return array<string, mixed>
     */
    private function getTemplateVariables(): array
    {
        /** @var LicenseManagerPro $module */
        $module = $this->module;
        $client = LmpApiClient::fromConfiguration();

        $lmpProducts = [];
        $lmpProductsError = '';
        if ($client->isConfigured()) {
            $result = $client->listProducts();
            if ($result['ok'] && is_array($result['data'])) {
                foreach ($result['data'] as $row) {
                    if (is_array($row) && isset($row['slug'])) {
                        $lmpProducts[] = [
                            'slug' => (string) $row['slug'],
                            'name' => (string) ($row['name'] ?? $row['slug']),
                        ];
                    }
                }
            } else {
                $lmpProductsError = (string) $result['error'];
            }
        }

        $mappingRows = [];
        foreach ($module->getMapping() as $productId => $entry) {
            $product = new Product($productId);
            $productName = '';
            if (Validate::isLoadedObject($product) && is_array($product->name)) {
                $productName = (string) ($product->name[(int) $this->context->language->id] ?? '');
            }
            $mappingRows[] = [
                'product_id' => $productId,
                'product_name' => $productName !== '' ? $productName : $this->l('Unknown product'),
                'slug' => $entry['slug'],
                'cycle' => $entry['cycle'],
            ];
        }

        $shopProducts = [];
        foreach (Product::getProducts((int) $this->context->language->id, 0, 0, 'name', 'ASC') as $row) {
            $shopProducts[] = [
                'id_product' => (int) $row['id_product'],
                'name' => (string) $row['name'],
            ];
        }

        return [
            'lmp_module_version' => $module->version,
            'lmp_configured' => $client->isConfigured(),
            'lmp_signed_enabled' => (bool) Configuration::get(LicenseManagerPro::CONFIG_SIGNED_REQUESTS),
            'lmp_api_url' => (string) Configuration::get(LicenseManagerPro::CONFIG_API_URL),
            'lmp_products' => $lmpProducts,
            'lmp_products_error' => $lmpProductsError,
            'lmp_mapping_rows' => $mappingRows,
            'lmp_shop_products' => $shopProducts,
            'lmp_cycles' => LmpApiClient::VALID_BILLING_CYCLES,
            'lmp_admin_link' => $this->context->link->getAdminLink('AdminLicensemanagerproSettings'),
            'lmp_token' => Tools::getAdminTokenLite('AdminLicensemanagerproSettings'),
        ];
    }
}
