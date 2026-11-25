<?php
/**
 * License Manager Pro — OpenCart catalog controller.
 *
 * Two jobs:
 *  - index(): the customer's "My Licenses" page (Account -> Licenses),
 *    showing every license owned by the logged-in customer's email.
 *  - onOrderHistory(): event handler fired after an order history entry
 *    is added. When the order reaches the configured complete status,
 *    one license is minted per mapped order line (never twice: the
 *    lmp_license table records each minted line).
 */
class ControllerExtensionModuleLicensemanagerpro extends Controller
{
    public function index()
    {
        if (!$this->customer->isLogged()) {
            $this->session->data['redirect'] = $this->url->link('extension/module/licensemanagerpro', '', true);
            $this->response->redirect($this->url->link('account/login', '', true));
        }
        $this->load->language('extension/module/licensemanagerpro');
        $this->document->setTitle($this->language->get('heading_title'));
        $this->load->model('extension/module/licensemanagerpro');

        $data['breadcrumbs'] = [];
        $data['breadcrumbs'][] = [
            'text' => $this->language->get('text_home'),
            'href' => $this->url->link('common/home'),
        ];
        $data['breadcrumbs'][] = [
            'text' => $this->language->get('text_account'),
            'href' => $this->url->link('account/account', '', true),
        ];
        $data['breadcrumbs'][] = [
            'text' => $this->language->get('heading_title'),
            'href' => $this->url->link('extension/module/licensemanagerpro', '', true),
        ];

        $data['heading_title'] = $this->language->get('heading_title');
        $data['text_no_licenses'] = $this->language->get('text_no_licenses');
        $data['text_expires'] = $this->language->get('text_expires');
        $data['text_never_expires'] = $this->language->get('text_never_expires');
        $data['text_billing_cycle'] = $this->language->get('text_billing_cycle');
        $data['text_created'] = $this->language->get('text_created');
        $data['text_copy'] = $this->language->get('text_copy');
        $data['text_copied'] = $this->language->get('text_copied');

        $rawLicenses = $this->model_extension_module_licensemanagerpro->getLicensesByEmail($this->customer->getEmail());
        $data['licenses'] = [];
        foreach ($rawLicenses as $license) {
            if (!is_array($license) || !isset($license['key'])) {
                continue;
            }
            $data['licenses'][] = [
                'id' => (int) ($license['id'] ?? 0),
                'key' => (string) $license['key'],
                'product' => (string) ($license['product'] ?? ''),
                'status' => (string) ($license['status'] ?? 'unknown'),
                'billing_cycle' => (string) ($license['billing_cycle'] ?? ''),
                'expires_at' => $license['expires_at'] ?? null,
                'created_at' => $license['created_at'] ?? null,
            ];
        }
        $data['licenses_error'] = $this->model_extension_module_licensemanagerpro->lastError;

        $data['column_left'] = $this->load->controller('common/column_left');
        $data['column_right'] = $this->load->controller('common/column_right');
        $data['content_top'] = $this->load->controller('common/content_top');
        $data['content_bottom'] = $this->load->controller('common/content_bottom');
        $data['footer'] = $this->load->controller('common/footer');
        $data['header'] = $this->load->controller('common/header');

        $this->response->setOutput($this->load->view('extension/module/licensemanagerpro', $data));
    }

    /**
     * Event handler: catalog/model/checkout/order/addOrderHistory/after.
     * $args[0] is the order id, $args[1] is the new order status id.
     */
    public function onOrderHistory($route, $args, $output)
    {
        $orderId = (int) ($args[0] ?? 0);
        $statusId = (int) ($args[1] ?? 0);
        if ($orderId <= 0) {
            return;
        }
        $this->load->model('extension/module/licensemanagerpro');
        if ($statusId !== $this->model_extension_module_licensemanagerpro->getCompleteStatusId()) {
            return;
        }
        $mapping = $this->model_extension_module_licensemanagerpro->getMapping();
        if ($mapping === []) {
            return;
        }
        $this->load->model('checkout/order');
        $order = $this->model_checkout_order->getOrder($orderId);
        if (empty($order) || empty($order['email'])) {
            return;
        }
        $orderProducts = $this->model_checkout_order->getOrderProducts($orderId);
        foreach ($orderProducts as $orderProduct) {
            $productId = (int) $orderProduct['product_id'];
            if (!isset($mapping[$productId])) {
                continue;
            }
            $orderProductId = (int) $orderProduct['order_product_id'];
            if ($this->model_extension_module_licensemanagerpro->hasLicenseForOrderProduct($orderProductId)) {
                continue;
            }
            $map = $mapping[$productId];
            $license = $this->model_extension_module_licensemanagerpro->createLicenseForSlug(
                $map['slug'],
                (string) $order['email'],
                $map['cycle'] !== '' ? $map['cycle'] : null
            );
            if ($license === null) {
                $this->log->write('LicenseManagerPro: could not mint a license for order ' . $orderId
                    . ', product ' . $productId . ': ' . $this->model_extension_module_licensemanagerpro->lastError);
                continue;
            }
            $this->model_extension_module_licensemanagerpro->recordLicense(
                $orderId,
                $orderProductId,
                (int) ($license['id'] ?? 0),
                (string) ($license['key'] ?? '')
            );
        }
    }
}
