<?php
/**
 * License Manager Pro — customer licenses block.
 *
 * Loads the logged-in customer's licenses from the License Manager Pro
 * API (GET /licenses?search=<email>) for the "My Licenses" page. API
 * errors fail closed: the page shows a friendly error instead of any
 * license data.
 */

declare(strict_types=1);

namespace Lmp\LicenseManager\Block\Customer;

use Lmp\LicenseManager\Model\ApiException;
use Lmp\LicenseManager\Model\LicenseService;
use Magento\Customer\Model\Session;
use Magento\Framework\View\Element\Template;
use Magento\Framework\View\Element\Template\Context;

class Licenses extends Template
{
    private LicenseService $licenseService;
    private Session $customerSession;
    private ?string $errorMessage = null;

    /** @var array<int, array<string, mixed>>|null */
    private ?array $licenses = null;

    public function __construct(
        Context $context,
        LicenseService $licenseService,
        Session $customerSession,
        array $data = []
    ) {
        parent::__construct($context, $data);
        $this->licenseService = $licenseService;
        $this->customerSession = $customerSession;
    }

    public function getCustomerEmail(): string
    {
        $customer = $this->customerSession->getCustomer();

        return (string) $customer->getEmail();
    }

    public function isLoggedIn(): bool
    {
        return $this->customerSession->isLoggedIn();
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function getLicenses(): array
    {
        if ($this->licenses !== null) {
            return $this->licenses;
        }
        if (!$this->isLoggedIn()) {
            $this->licenses = [];

            return $this->licenses;
        }
        try {
            $this->licenses = $this->licenseService->getLicensesForEmail($this->getCustomerEmail());
        } catch (ApiException $e) {
            $this->errorMessage = $e->getMessage();
            $this->licenses = [];
        }

        return $this->licenses;
    }

    public function getErrorMessage(): ?string
    {
        $this->getLicenses();

        return $this->errorMessage;
    }

    public function getLicenseUrl(): string
    {
        return $this->getUrl('lmp/customer/licenses');
    }
}
