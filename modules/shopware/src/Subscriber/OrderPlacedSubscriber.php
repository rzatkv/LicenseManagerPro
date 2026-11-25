<?php

declare(strict_types=1);

namespace Lmp\LicenseManager\Subscriber;

use Lmp\LicenseManager\LicenseManagerPro;
use Lmp\LicenseManager\Service\BillingCycleMapper;
use Lmp\LicenseManager\Service\ConfigService;
use Lmp\LicenseManager\Service\LicenseService;
use Psr\Log\LoggerInterface;
use Shopware\Core\Checkout\Cart\LineItem\LineItem;
use Shopware\Core\Checkout\Cart\Event\CheckoutOrderPlacedEvent;
use Shopware\Core\Checkout\Order\Event\OrderStateMachineStateChangeEvent;
use Shopware\Core\Checkout\Order\OrderEntity;
use Shopware\Core\Framework\Context;
use Shopware\Core\Framework\DataAbstractionLayer\EntityRepository;
use Shopware\Core\Framework\DataAbstractionLayer\Search\Criteria;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;

/**
 * Mints License Manager Pro licenses for paid orders.
 *
 * Triggers:
 *  - Order transaction state change to "paid" (the canonical signal —
 *    a license is only minted once the customer has actually paid).
 *  - CheckoutOrderPlacedEvent, but only when the order is already paid
 *    at placement (instant-payment methods).
 *
 * Mint-once guarantee: minted line items are recorded in the order
 * custom field "lmp_licenses" (JSON: line item id to license id, created
 * by the plugin installer), and already-minted items are skipped.
 *
 * Product resolution per line item:
 *  1. The product must be mapped in the plugin settings (Shopware
 *     product id -> License Manager Pro product slug + cycle).
 *  2. Billing cycle: the mapped cycle wins; otherwise the product's
 *     custom field "lmp_billing_cycle" is used when it maps to a known
 *     LMP cycle; otherwise the cycle is omitted and the backend applies
 *     the product default.
 *
 * One license is minted per mapped line item (not per unit). Failures
 * are logged and never block the order flow.
 */
class OrderPlacedSubscriber implements EventSubscriberInterface
{
    public const STATE_MACHINE_ORDER_TRANSACTION = 'order_transaction.state';
    public const STATE_PAID = 'paid';
    public const CUSTOM_FIELD_PRODUCT_CYCLE = 'lmp_billing_cycle';

    private LicenseService $licenseService;
    private ConfigService $config;
    private EntityRepository $orderRepository;
    private EntityRepository $productRepository;
    private LoggerInterface $logger;

    public function __construct(
        LicenseService $licenseService,
        ConfigService $config,
        EntityRepository $orderRepository,
        EntityRepository $productRepository,
        LoggerInterface $logger
    ) {
        $this->licenseService = $licenseService;
        $this->config = $config;
        $this->orderRepository = $orderRepository;
        $this->productRepository = $productRepository;
        $this->logger = $logger;
    }

    public static function getSubscribedEvents(): array
    {
        return [
            CheckoutOrderPlacedEvent::class => 'onOrderPlaced',
            OrderStateMachineStateChangeEvent::class => 'onOrderStateChanged',
        ];
    }

    public function onOrderPlaced(CheckoutOrderPlacedEvent $event): void
    {
        $order = $this->loadOrder($event->getOrder()->getId(), $event->getContext());
        if ($order === null || !$this->isOrderPaid($order)) {
            return;
        }
        $this->mintLicensesForOrder($order, $event->getContext());
    }

    public function onOrderStateChanged(OrderStateMachineStateChangeEvent $event): void
    {
        $stateMachine = $event->getStateMachine();
        if ($stateMachine === null || $stateMachine->getTechnicalName() !== self::STATE_MACHINE_ORDER_TRANSACTION) {
            return;
        }
        $transition = $event->getTransition();
        if ($transition === null || $transition->getToPlace() === null
            || $transition->getToPlace()->getTechnicalName() !== self::STATE_PAID
        ) {
            return;
        }
        $order = $this->loadOrder($event->getOrder()->getId(), $event->getContext());
        if ($order === null) {
            return;
        }
        $this->mintLicensesForOrder($order, $event->getContext());
    }

    private function mintLicensesForOrder(OrderEntity $order, Context $context): void
    {
        $orderCustomer = $order->getOrderCustomer();
        if ($orderCustomer === null || $orderCustomer->getEmail() === null) {
            $this->logger->error('[LMP] Cannot mint licenses for order {orderId}: no customer e-mail.', ['orderId' => $order->getId()]);

            return;
        }
        $email = $orderCustomer->getEmail();
        $minted = $this->readMintedLicenses($order);
        $newlyMinted = [];

        $lineItems = $order->getLineItems();
        if ($lineItems === null) {
            return;
        }
        foreach ($lineItems as $lineItem) {
            if ($lineItem->getType() !== LineItem::PRODUCT_LINE_ITEM_TYPE) {
                continue;
            }
            $lineItemId = $lineItem->getId();
            if (isset($minted[$lineItemId])) {
                continue;
            }
            $productId = $lineItem->getReferencedId();
            if ($productId === null) {
                continue;
            }
            $mapping = $this->config->getMappingForProduct($productId);
            if ($mapping === null) {
                continue;
            }
            $cycle = $mapping['cycle'] ?? $this->cycleFromProductCustomField($productId, $context);
            $license = $this->licenseService->createLicense($mapping['slug'], $email, $cycle);
            if ($license === null || !isset($license['id'])) {
                $this->logger->error('[LMP] License minting failed for order {orderId}, line item {lineItemId}.', [
                    'orderId' => $order->getId(),
                    'lineItemId' => $lineItemId,
                ]);
                continue;
            }
            $minted[$lineItemId] = (int) $license['id'];
            $newlyMinted[$lineItemId] = (int) $license['id'];
            $this->logger->info('[LMP] Minted license {licenseId} for order {orderId}, product {slug}.', [
                'licenseId' => $license['id'],
                'orderId' => $order->getId(),
                'slug' => $mapping['slug'],
            ]);
        }

        if ($newlyMinted !== []) {
            $this->writeMintedLicenses($order, $minted, $context);
        }
    }

    /**
     * The mapped cycle wins; otherwise read the product custom field
     * "lmp_billing_cycle" and map it to a known LMP cycle.
     */
    private function cycleFromProductCustomField(string $productId, Context $context): ?string
    {
        $product = $this->productRepository->search(new Criteria([$productId]), $context)->first();
        if ($product === null) {
            return null;
        }
        $customFields = $product->getCustomFields();
        if (!\is_array($customFields) || !isset($customFields[self::CUSTOM_FIELD_PRODUCT_CYCLE])) {
            return null;
        }
        $value = $customFields[self::CUSTOM_FIELD_PRODUCT_CYCLE];

        return \is_string($value) ? BillingCycleMapper::map($value) : null;
    }

    private function isOrderPaid(OrderEntity $order): bool
    {
        $transactions = $order->getTransactions();
        if ($transactions === null) {
            return false;
        }
        foreach ($transactions as $transaction) {
            $state = $transaction->getStateMachineState();
            if ($state !== null && $state->getTechnicalName() === self::STATE_PAID) {
                return true;
            }
        }

        return false;
    }

    private function loadOrder(string $orderId, Context $context): ?OrderEntity
    {
        $criteria = (new Criteria([$orderId]))
            ->addAssociation('lineItems')
            ->addAssociation('orderCustomer')
            ->addAssociation('transactions.stateMachineState');
        $order = $this->orderRepository->search($criteria, $context)->first();

        return $order instanceof OrderEntity ? $order : null;
    }

    /**
     * @return array<string, int> line item id to license id
     */
    private function readMintedLicenses(OrderEntity $order): array
    {
        $customFields = $order->getCustomFields();
        if (!\is_array($customFields) || !isset($customFields[LicenseManagerPro::CUSTOM_FIELD_LICENSES])) {
            return [];
        }
        $decoded = json_decode((string) $customFields[LicenseManagerPro::CUSTOM_FIELD_LICENSES], true);

        return \is_array($decoded) ? $decoded : [];
    }

    /**
     * @param array<string, int> $minted
     */
    private function writeMintedLicenses(OrderEntity $order, array $minted, Context $context): void
    {
        $customFields = $order->getCustomFields() ?? [];
        $customFields[LicenseManagerPro::CUSTOM_FIELD_LICENSES] = (string) json_encode($minted);
        $this->orderRepository->update([
            ['id' => $order->getId(), 'customFields' => $customFields],
        ], $context);
    }
}
