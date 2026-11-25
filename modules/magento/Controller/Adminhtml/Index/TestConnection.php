<?php
/**
 * License Manager Pro — admin AJAX test connection.
 *
 * Calls GET /system/info with the configured API key and returns a
 * JSON success/failure payload for the Test Connection button in
 * Stores > Configuration > License Manager Pro.
 */

declare(strict_types=1);

namespace Lmp\LicenseManager\Controller\Adminhtml\Index;

use Lmp\LicenseManager\Model\ApiClient;
use Lmp\LicenseManager\Model\ApiException;
use Magento\Backend\App\Action;
use Magento\Backend\App\Action\Context;
use Magento\Framework\Controller\Result\JsonFactory;

class TestConnection extends Action
{
    public const ADMIN_RESOURCE = 'Lmp_LicenseManager::config';

    private ApiClient $apiClient;
    private JsonFactory $jsonFactory;

    public function __construct(
        Context $context,
        ApiClient $apiClient,
        JsonFactory $jsonFactory
    ) {
        parent::__construct($context);
        $this->apiClient = $apiClient;
        $this->jsonFactory = $jsonFactory;
    }

    public function execute()
    {
        $result = $this->jsonFactory->create();
        try {
            $info = $this->apiClient->getSystemInfo();
            $version = (string) ($info['version'] ?? $info['app_version'] ?? '');
            $result->setData([
                'success' => true,
                'message' => $version !== ''
                    ? __('Connected to License Manager Pro (version %1).', $version)
                    : __('Connected to License Manager Pro.'),
                'info' => $info,
            ]);
        } catch (ApiException $e) {
            $result->setData([
                'success' => false,
                'message' => $e->getMessage(),
            ]);
        }

        return $result;
    }
}
