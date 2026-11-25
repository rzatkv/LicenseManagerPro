<?php
/**
 * License Manager Pro — Test Connection button for system config.
 *
 * Renders the button shown in Stores > Configuration > License Manager
 * Pro > Connection. The markup lives in
 * view/adminhtml/templates/system/config/test.phtml; clicking the
 * button calls the TestConnection admin action via AJAX and shows the
 * result inline. No page reload, no credentials in the page.
 */

declare(strict_types=1);

namespace Lmp\LicenseManager\Block\Adminhtml\System\Config;

use Magento\Backend\Block\Template\Context;
use Magento\Config\Block\System\Config\Form\Field;
use Magento\Framework\Data\Form\Element\AbstractElement;

class Test extends Field
{
    public function __construct(Context $context, array $data = [])
    {
        parent::__construct($context, $data);
    }

    protected function _getElementHtml(AbstractElement $element): string
    {
        $block = $this->getLayout()->createBlock(
            \Magento\Backend\Block\Template::class,
            'lmp_test_connection_block'
        );
        $block->setTemplate('Lmp_LicenseManager::system/config/test.phtml');
        $block->setData('test_url', $this->getUrl('lmpadmin/index/testconnection'));

        return $block->toHtml();
    }
}
