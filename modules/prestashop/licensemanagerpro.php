<?php
/**
 * License Manager Pro — PrestaShop 1.7/8 module.
 *
 * Connects the shop to a License Manager Pro backend with a single
 * scoped module API key. When an order reaches a paid or shipped
 * status, a license is minted for every mapped product in the order.
 * Customers can view their licenses from their account.
 */

declare(strict_types=1);

if (!defined('_PS_VERSION_')) {
    exit;
}

require_once __DIR__ . '/classes/LmpApiClient.php';
require_once __DIR__ . '/classes/LmpLicense.php';

class LicenseManagerPro extends Module
{
    public const CONFIG_API_URL = 'LMP_API_URL';
    public const CONFIG_API_KEY = 'LMP_API_KEY';
    public const CONFIG_SIGNED_REQUESTS = 'LMP_SIGNED_REQUESTS';
    public const CONFIG_MAPPING = 'LMP_MAPPING';

    public const HOOK_ORDER_STATUS = 'actionOrderStatusPostUpdate';
    public const HOOK_CUSTOMER_ACCOUNT = 'displayCustomerAccount';

    public function __construct()
    {
        $this->name = 'licensemanagerpro';
        $this->tab = 'administration';
        $this->version = '3.0.0';
        $this->author = 'LicenseManagerPro';
        $this->need_instance = 0;
        $this->bootstrap = true;
        $this->ps_versions_compliancy = ['min' => '1.7.0.0', 'max' => '8.99.99'];

        parent::__construct();

        $this->displayName = $this->l('License Manager Pro');
        $this->description = $this->l(
            'Issues License Manager Pro licenses for your products when orders are paid, '
            . 'and lets customers view their licenses from their account.'
        );
        $this->confirmUninstall = $this->l('Are you sure you want to uninstall License Manager Pro?');
    }

    public function install(): bool
    {
        return parent::install()
            && $this->registerHook(self::HOOK_ORDER_STATUS)
            && $this->registerHook(self::HOOK_CUSTOMER_ACCOUNT)
            && Configuration::updateValue(self::CONFIG_API_URL, '')
            && Configuration::updateValue(self::CONFIG_API_KEY, '')
            && Configuration::updateValue(self::CONFIG_SIGNED_REQUESTS, 0)
            && Configuration::updateValue(self::CONFIG_MAPPING, '[]');
    }

    public function uninstall(): bool
    {
        return parent::uninstall()
            && Configuration::deleteByName(self::CONFIG_API_URL)
            && Configuration::deleteByName(self::CONFIG_API_KEY)
            && Configuration::deleteByName(self::CONFIG_SIGNED_REQUESTS)
            && Configuration::deleteByName(self::CONFIG_MAPPING);
    }

    public function getContent(): void
    {
        Tools::redirectAdmin(
            Context::getContext()->link->getAdminLink('AdminLicensemanagerproSettings')
        );
    }

    /**
     * Mint licenses when an order moves to a paid or shipped status.
     * PrestaShop has no native subscription cycle, so the billing cycle
     * comes from the product mapping configured in the module settings.
     */
    public function hookActionOrderStatusPostUpdate(array $params): void
    {
        if (empty($params['id_order']) || empty($params['newOrderStatus'])) {
            return;
        }
        $newStatusId = (int) $params['newOrderStatus']->id;
        if (!in_array($newStatusId, $this->getPaidOrShippedStatusIds(), true)) {
            return;
        }

        $order = new Order((int) $params['id_order']);
        if (!Validate::isLoadedObject($order)) {
            return;
        }
        $customer = new Customer((int) $order->id_customer);
        if (!Validate::isLoadedObject($customer) || $customer->email === '') {
            return;
        }

        $mapping = $this->getMapping();
        if ($mapping === []) {
            return;
        }

        $client = LmpApiClient::fromConfiguration();
        if (!$client->isConfigured()) {
            PrestaShopLogger::addLog(
                'License Manager Pro: order ' . $order->id . ' reached a paid status but the module is not configured.',
                2,
                null,
                'Order',
                (int) $order->id
            );

            return;
        }

        foreach ($order->getProducts() as $orderProduct) {
            $productId = (int) $orderProduct['product_id'];
            if (!isset($mapping[$productId])) {
                continue;
            }
            $map = $mapping[$productId];
            $quantity = (int) $orderProduct['product_quantity'];
            for ($i = 0; $i < $quantity; $i++) {
                $result = $client->createLicense(
                    null,
                    (string) $map['slug'],
                    (string) $customer->email,
                    $this->normaliseCycle($map['cycle'] ?? null)
                );
                if (!$result['ok']) {
                    PrestaShopLogger::addLog(
                        'License Manager Pro: could not mint a license for order ' . $order->id
                        . ', product ' . $productId . ': ' . $result['error'],
                        3,
                        null,
                        'Order',
                        (int) $order->id
                    );
                }
            }
        }
    }

    /**
     * "My licenses" link on the customer account page.
     *
     * @return array{url: string, title: string, icon: string}|string
     */
    public function hookDisplayCustomerAccount(array $params): array|string
    {
        return [
            'url' => Context::getContext()->link->getModuleLink(
                $this->name,
                'licenses'
            ),
            'title' => $this->l('My licenses'),
            'icon' => 'icon-key',
        ];
    }

    /**
     * @return int[]
     */
    private function getPaidOrShippedStatusIds(): array
    {
        $ids = [];
        foreach (['PS_OS_PAYMENT', 'PS_OS_WS_PAYMENT', 'PS_OS_SHIPPING', 'PS_OS_DELIVERED'] as $key) {
            $id = (int) Configuration::get($key);
            if ($id > 0) {
                $ids[] = $id;
            }
        }

        return $ids;
    }

    /**
     * Product mapping: PrestaShop product id => ['slug' => LMP slug, 'cycle' => LMP cycle].
     *
     * @return array<int, array{slug: string, cycle: string|null}>
     */
    public function getMapping(): array
    {
        $raw = (string) Configuration::get(self::CONFIG_MAPPING);
        $decoded = json_decode($raw, true);
        if (!is_array($decoded)) {
            return [];
        }

        $mapping = [];
        foreach ($decoded as $productId => $entry) {
            if (!is_array($entry) || empty($entry['slug'])) {
                continue;
            }
            $mapping[(int) $productId] = [
                'slug' => (string) $entry['slug'],
                'cycle' => $this->normaliseCycle($entry['cycle'] ?? null),
            ];
        }

        return $mapping;
    }

    public function saveMapping(array $mapping): bool
    {
        return Configuration::updateValue(self::CONFIG_MAPPING, (string) json_encode($mapping));
    }

    /**
     * Only a known LMP cycle is ever sent; anything else is omitted so
     * the backend applies its own default.
     */
    public function normaliseCycle(mixed $cycle): ?string
    {
        if (is_string($cycle) && in_array($cycle, LmpApiClient::VALID_BILLING_CYCLES, true)) {
            return $cycle;
        }

        return null;
    }
}
