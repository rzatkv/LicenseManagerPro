<?php
/**
 * License Manager Pro — admin manual license mint.
 *
 * POST params: product_slug, owner_email, billing_cycle (optional).
 * Used when automatic minting failed (e.g. the API was unreachable
 * when the invoice was paid) or for a manual sale. Fails closed: on
 * any API error nothing is minted and the admin sees the error.
 */

declare(strict_types=1);

namespace Lmp\LicenseManager\Controller\Adminhtml\License;

use Lmp\LicenseManager\Model\ApiException;
use Lmp\LicenseManager\Model\BillingCycle;
use Lmp\LicenseManager\Model\LicenseService;
use Magento\Backend\App\Action;
use Magento\Backend\App\Action\Context;
use Magento\Framework\Controller\Result\RedirectFactory;

class Mint extends Action
{
    public const ADMIN_RESOURCE = 'Lmp_LicenseManager::mint';

    private LicenseService $licenseService;
    private RedirectFactory $redirectFactory;

    public function __construct(
        Context $context,
        LicenseService $licenseService,
        RedirectFactory $redirectFactory
    ) {
        parent::__construct($context);
        $this->licenseService = $licenseService;
        $this->redirectFactory = $redirectFactory;
    }

    public function execute()
    {
        $result = $this->redirectFactory->create();
        $result->setPath('adminhtml/system_config/edit/section/lmp_licensemanager');

        $request = $this->getRequest();
        $slug = trim((string) $request->getParam('product_slug', ''));
        $email = trim((string) $request->getParam('owner_email', ''));
        $cycle = BillingCycle::normalize($request->getParam('billing_cycle'));

        if ($slug === '' || $email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $this->messageManager->addErrorMessage(
                __('A License Manager Pro product slug and a valid owner email are required.')
            );

            return $result;
        }

        try {
            $license = $this->licenseService->mint($slug, $email, $cycle);
            $this->messageManager->addSuccessMessage(
                __('License %1 minted for %2.', (string) ($license['license_key'] ?? $license['id'] ?? ''), $email)
            );
        } catch (ApiException $e) {
            $this->messageManager->addErrorMessage($e->getMessage());
        }

        return $result;
    }
}
