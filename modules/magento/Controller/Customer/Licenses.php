<?php
/**
 * License Manager Pro — customer "My Licenses" page.
 *
 * Renders the frontend licenses page for a logged-in customer at
 * /lmp/customer/licenses. Guests are redirected to the login page by
 * the customer session check in the block.
 */

declare(strict_types=1);

namespace Lmp\LicenseManager\Controller\Customer;

use Magento\Framework\App\Action\Action;
use Magento\Framework\App\Action\Context;
use Magento\Framework\View\Result\PageFactory;

class Licenses extends Action
{
    private PageFactory $pageFactory;

    public function __construct(Context $context, PageFactory $pageFactory)
    {
        parent::__construct($context);
        $this->pageFactory = $pageFactory;
    }

    public function execute()
    {
        $page = $this->pageFactory->create();
        $page->getConfig()->getTitle()->set(__('My Licenses'));

        return $page;
    }
}
