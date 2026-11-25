<?php
/**
 * License Manager Pro — mint licenses when an invoice is paid.
 *
 * Listens to sales_order_invoice_pay (a paid invoice means the money
 * arrived; minting earlier would hand out licenses for unpaid orders).
 *
 * For every order item whose SKU is in the product mapping, one license
 * is minted for the customer's email. The billing cycle comes from the
 * product's optional lmp_billing_cycle attribute when present, falling
 * back to the cycle in the mapping; an unmapped cycle is omitted and
 * the backend uses the product default.
 *
 * Idempotency: before minting, the observer checks the order's status
 * history for a previous "License Manager Pro minted" comment for the
 * same SKU, so a second invoice payment (or a re-fired event) never
 * mints a duplicate. A failure fails closed: the error is logged and
 * recorded as an order comment, no license is granted, and the admin
 * can mint manually from the License Manager Pro admin action.
 */

declare(strict_types=1);

namespace Lmp\LicenseManager\Observer;

use Lmp\LicenseManager\Model\ApiException;
use Lmp\LicenseManager\Model\BillingCycle;
use Lmp\LicenseManager\Model\LicenseService;
use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;
use Magento\Sales\Model\Order\Invoice;
use Psr\Log\LoggerInterface;

class OrderPaidObserver implements ObserverInterface
{
    private const COMMENT_PREFIX = 'License Manager Pro minted license';

    private LicenseService $licenseService;
    private LoggerInterface $logger;

    public function __construct(
        LicenseService $licenseService,
        LoggerInterface $logger
    ) {
        $this->licenseService = $licenseService;
        $this->logger = $logger;
    }

    public function execute(Observer $observer): void
    {
        $invoice = $observer->getEvent()->getInvoice();
        if (!$invoice instanceof Invoice) {
            return;
        }
        $order = $invoice->getOrder();
        if ($order === null) {
            return;
        }
        $email = (string) $order->getCustomerEmail();
        if ($email === '') {
            return;
        }

        foreach ($order->getAllVisibleItems() as $item) {
            $sku = (string) $item->getSku();
            if ($sku === '' || $this->alreadyMinted($order, $sku)) {
                continue;
            }
            $attributeCycle = $this->readProductCycleAttribute($item);
            try {
                $license = $this->licenseService->mintForSku($sku, $email, $attributeCycle);
                if ($license === null) {
                    continue;
                }
                $key = (string) ($license['license_key'] ?? $license['id'] ?? '');
                $cycle = BillingCycle::normalize($attributeCycle)
                    ?? (string) ($license['billing_cycle'] ?? '');
                $order->addCommentToStatusHistory(
                    self::COMMENT_PREFIX . ' ' . $key . ' for SKU ' . $sku
                    . ($cycle !== '' ? ' (billing cycle ' . $cycle . ')' : '')
                    . '.'
                );
            } catch (ApiException $e) {
                $this->logger->error(
                    'License Manager Pro failed to mint a license for order '
                    . $order->getIncrementId() . ', SKU ' . $sku . ': ' . $e->getMessage()
                );
                $order->addCommentToStatusHistory(
                    'License Manager Pro could not mint a license for SKU ' . $sku
                    . ': ' . $e->getMessage()
                    . ' — mint it manually from the admin panel.'
                );
            }
        }
        $order->save();
    }

    private function alreadyMinted(\Magento\Sales\Model\Order $order, string $sku): bool
    {
        foreach ($order->getStatusHistoryCollection() as $history) {
            $comment = (string) $history->getComment();
            if (str_starts_with($comment, self::COMMENT_PREFIX)
                && str_contains($comment, 'SKU ' . $sku)
            ) {
                return true;
            }
        }

        return false;
    }

    /**
     * Read the optional lmp_billing_cycle product attribute, if the
     * store created it. Returns null when absent or empty.
     */
    private function readProductCycleAttribute(\Magento\Sales\Model\Order\Item $item): ?string
    {
        $product = $item->getProduct();
        if ($product === null) {
            return null;
        }
        $value = $product->getData('lmp_billing_cycle');
        if (!is_string($value) || trim($value) === '') {
            return null;
        }

        return $value;
    }
}
