<?php
/**
 * License Manager Pro — OpenCart admin controller.
 *
 * Settings page for the module: API URL, one scoped module API key,
 * signed-requests toggle, the order status that triggers license
 * creation, and the product mapping (OpenCart product -> License
 * Manager Pro product slug + billing cycle).
 *
 * No admin email/password is collected anywhere. The Test connection
 * button calls GET /system/info with the stored API key.
 */
class ControllerExtensionModuleLicensemanagerpro extends Controller
{
    /** @var array<string, string> Validation errors, keyed by field. */
    private $error = [];

    public function index()
    {
        $this->load->language('extension/module/licensemanagerpro');
        $this->document->setTitle($this->language->get('heading_title'));
        $this->load->model('extension/module/licensemanagerpro');
        $this->load->model('setting/setting');
        $this->load->model('catalog/product');
        $this->load->model('localisation/order_status');

        if ($this->request->server['REQUEST_METHOD'] === 'POST' && $this->validate()) {
            $this->model_setting_setting->editSetting('module_licensemanagerpro', $this->request->post);
            $this->session->data['success'] = $this->language->get('text_success');
            $this->response->redirect($this->url->link(
                'marketplace/extension',
                'user_token=' . $this->session->data['user_token'] . '&type=module',
                true
            ));
        }

        $data['heading_title'] = $this->language->get('heading_title');
        $data['text_edit'] = $this->language->get('text_edit');
        $data['text_enabled'] = $this->language->get('text_enabled');
        $data['text_disabled'] = $this->language->get('text_disabled');
        $data['text_no_lmp_products'] = $this->language->get('text_no_lmp_products');
        $data['entry_api_url'] = $this->language->get('entry_api_url');
        $data['entry_api_key'] = $this->language->get('entry_api_key');
        $data['entry_signed'] = $this->language->get('entry_signed');
        $data['entry_complete_status'] = $this->language->get('entry_complete_status');
        $data['entry_mapping'] = $this->language->get('entry_mapping');
        $data['help_api_url'] = $this->language->get('help_api_url');
        $data['help_api_key'] = $this->language->get('help_api_key');
        $data['help_signed'] = $this->language->get('help_signed');
        $data['help_complete_status'] = $this->language->get('help_complete_status');
        $data['help_mapping'] = $this->language->get('help_mapping');
        $data['button_save'] = $this->language->get('button_save');
        $data['button_cancel'] = $this->language->get('button_cancel');
        $data['button_test_connection'] = $this->language->get('button_test_connection');
        $data['text_testing'] = $this->language->get('text_testing');
        $data['text_connection_ok'] = $this->language->get('text_connection_ok');
        $data['text_connection_failed'] = $this->language->get('text_connection_failed');

        $data['breadcrumbs'] = [];
        $data['breadcrumbs'][] = [
            'text' => $this->language->get('text_home'),
            'href' => $this->url->link('common/dashboard', 'user_token=' . $this->session->data['user_token'], true),
        ];
        $data['breadcrumbs'][] = [
            'text' => $this->language->get('text_extension'),
            'href' => $this->url->link('marketplace/extension', 'user_token=' . $this->session->data['user_token'] . '&type=module', true),
        ];
        $data['breadcrumbs'][] = [
            'text' => $this->language->get('heading_title'),
            'href' => $this->url->link('extension/module/licensemanagerpro', 'user_token=' . $this->session->data['user_token'], true),
        ];

        $data['action'] = $this->url->link('extension/module/licensemanagerpro', 'user_token=' . $this->session->data['user_token'], true);
        $data['cancel'] = $this->url->link('marketplace/extension', 'user_token=' . $this->session->data['user_token'] . '&type=module', true);
        $data['test_connection_url'] = $this->url->link(
            'extension/module/licensemanagerpro/testConnection',
            'user_token=' . $this->session->data['user_token'],
            true
        );

        $data['error_warning'] = $this->error['warning'] ?? '';
        $data['error_api_url'] = $this->error['api_url'] ?? '';
        $data['error_api_key'] = $this->error['api_key'] ?? '';
        if (isset($this->session->data['success'])) {
            $data['success'] = $this->session->data['success'];
            unset($this->session->data['success']);
        } else {
            $data['success'] = '';
        }

        $data['module_licensemanagerpro_api_url'] = $this->request->post['module_licensemanagerpro_api_url']
            ?? $this->config->get('module_licensemanagerpro_api_url');
        $data['module_licensemanagerpro_api_key'] = $this->request->post['module_licensemanagerpro_api_key']
            ?? $this->config->get('module_licensemanagerpro_api_key');
        $data['module_licensemanagerpro_signed'] = $this->request->post['module_licensemanagerpro_signed']
            ?? $this->config->get('module_licensemanagerpro_signed');
        $data['module_licensemanagerpro_complete_status_id'] = $this->request->post['module_licensemanagerpro_complete_status_id']
            ?? $this->config->get('module_licensemanagerpro_complete_status_id');
        $mapping = $this->request->post['module_licensemanagerpro_mapping']
            ?? $this->model_extension_module_licensemanagerpro->getMapping();
        $mapping = is_array($mapping) ? $mapping : [];
        // One resolved row per catalog product, so the template needs no
        // null-coalescing (older Twig versions shipped with OpenCart 3).
        $data['mapping_rows'] = [];
        $data['oc_products'] = $this->model_catalog_product->getProducts([]);
        foreach ($data['oc_products'] as $ocProduct) {
            $row = $mapping[(int) $ocProduct['product_id']] ?? $mapping[(string) $ocProduct['product_id']] ?? [];
            $data['mapping_rows'][] = [
                'product_id' => (int) $ocProduct['product_id'],
                'name' => $ocProduct['name'],
                'model' => $ocProduct['model'],
                'slug' => (string) ($row['slug'] ?? ''),
                'cycle' => (string) ($row['cycle'] ?? 'annual'),
            ];
        }

        $data['billing_cycles'] = ModelExtensionModuleLicensemanagerpro::BILLING_CYCLES;
        $data['order_statuses'] = $this->model_localisation_order_status->getOrderStatuses();

        $data['lmp_products'] = [];
        $data['lmp_products_error'] = '';
        if ($this->model_extension_module_licensemanagerpro->isConfigured()) {
            $data['lmp_products'] = $this->model_extension_module_licensemanagerpro->listProducts();
            if ($data['lmp_products'] === []) {
                $data['lmp_products_error'] = $this->model_extension_module_licensemanagerpro->lastError;
            }
        }

        $data['header'] = $this->load->controller('common/header');
        $data['column_left'] = $this->load->controller('common/column_left');
        $data['footer'] = $this->load->controller('common/footer');

        $this->response->setOutput($this->load->view('extension/module/licensemanagerpro', $data));
    }

    /**
     * AJAX endpoint for the Test connection button.
     * Returns JSON: {success, version|error}.
     */
    public function testConnection()
    {
        $this->load->language('extension/module/licensemanagerpro');
        $this->load->model('extension/module/licensemanagerpro');
        $result = ['success' => false, 'error' => ''];
        if (!$this->model_extension_module_licensemanagerpro->isConfigured()) {
            $result['error'] = $this->language->get('error_not_configured');
        } else {
            $info = $this->model_extension_module_licensemanagerpro->getSystemInfo();
            if ($info === null) {
                $result['error'] = $this->model_extension_module_licensemanagerpro->lastError;
            } else {
                $result['success'] = true;
                $result['version'] = $info['version'] ?? '';
                $result['app'] = $info['app_name'] ?? $info['name'] ?? 'LicenseManagerPro';
            }
        }
        $this->response->addHeader('Content-Type: application/json');
        $this->response->setOutput(json_encode($result));
    }

    public function install()
    {
        $this->load->model('extension/module/licensemanagerpro');
        $this->model_extension_module_licensemanagerpro->installTable();
        $this->load->model('setting/event');
        $this->model_setting_event->deleteEventByCode('licensemanagerpro_order');
        $this->model_setting_event->addEvent(
            'licensemanagerpro_order',
            'catalog/model/checkout/order/addOrderHistory/after',
            'extension/module/licensemanagerpro/onOrderHistory'
        );
        $this->load->model('setting/setting');
        $this->model_setting_setting->editSetting('module_licensemanagerpro', [
            'module_licensemanagerpro_api_url' => '',
            'module_licensemanagerpro_api_key' => '',
            'module_licensemanagerpro_signed' => 0,
            'module_licensemanagerpro_complete_status_id' => ModelExtensionModuleLicensemanagerpro::DEFAULT_COMPLETE_STATUS_ID,
            'module_licensemanagerpro_mapping' => [],
            'module_licensemanagerpro_status' => 1,
        ]);
    }

    public function uninstall()
    {
        $this->load->model('extension/module/licensemanagerpro');
        $this->model_extension_module_licensemanagerpro->uninstallTable();
        $this->load->model('setting/event');
        $this->model_setting_event->deleteEventByCode('licensemanagerpro_order');
        $this->load->model('setting/setting');
        $this->model_setting_setting->deleteSetting('module_licensemanagerpro');
    }

    protected function validate(): bool
    {
        if (!$this->user->hasPermission('modify', 'extension/module/licensemanagerpro')) {
            $this->error['warning'] = $this->language->get('error_permission');
        }
        $apiUrl = trim((string) ($this->request->post['module_licensemanagerpro_api_url'] ?? ''));
        if ($apiUrl === '' || filter_var($apiUrl, FILTER_VALIDATE_URL) === false
            || (stripos($apiUrl, 'http://') !== 0 && stripos($apiUrl, 'https://') !== 0)
        ) {
            $this->error['api_url'] = $this->language->get('error_api_url');
        }
        if (trim((string) ($this->request->post['module_licensemanagerpro_api_key'] ?? '')) === '') {
            $this->error['api_key'] = $this->language->get('error_api_key');
        }
        if ($this->error !== [] && !isset($this->error['warning'])) {
            $this->error['warning'] = $this->language->get('error_warning');
        }
        return $this->error === [];
    }
}
