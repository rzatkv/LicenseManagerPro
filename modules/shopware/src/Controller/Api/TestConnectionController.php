<?php

declare(strict_types=1);

namespace Lmp\LicenseManager\Controller\Api;

use Lmp\LicenseManager\Service\ApiClient;
use Lmp\LicenseManager\Service\ConfigService;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Annotation\Route;

/**
 * Administration API endpoint used to test the plugin configuration.
 *
 * GET /api/lmp-license-manager/test-connection
 * Returns {"success": true, ...} when GET /system/info answers 2xx,
 * otherwise {"success": false, "error": "..."}.
 *
 * The route is scoped to the Shopware admin API, so only an authenticated
 * admin can call it. No custom administration JavaScript is shipped:
 * the call is made from the plugin settings page documentation, or from
 * any HTTP client with an admin token (see README.md).
 */
class TestConnectionController extends AbstractController
{
    private ApiClient $apiClient;
    private ConfigService $config;

    public function __construct(ApiClient $apiClient, ConfigService $config)
    {
        $this->apiClient = $apiClient;
        $this->config = $config;
    }

    #[Route(
        path: '/api/lmp-license-manager/test-connection',
        name: 'api.lmp.test_connection',
        methods: ['GET'],
        defaults: ['_routeScope' => ['api']]
    )]
    public function testConnection(): JsonResponse
    {
        if (!$this->config->isConfigured()) {
            return new JsonResponse([
                'success' => false,
                'error' => 'Plugin is not configured: set the API URL and API key in the plugin settings.',
            ]);
        }

        $info = $this->apiClient->systemInfo();
        if ($info === null) {
            return new JsonResponse([
                'success' => false,
                'error' => $this->apiClient->getLastError(),
            ]);
        }

        return new JsonResponse([
            'success' => true,
            'info' => $info,
            'signedRequests' => $this->config->isSignedRequestsEnabled(),
        ]);
    }
}
