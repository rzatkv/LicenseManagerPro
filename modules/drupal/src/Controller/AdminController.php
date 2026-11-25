<?php

namespace Drupal\licensemanagerpro\Controller;

use Drupal\Core\Controller\ControllerBase;
use Drupal\Core\Url;
use Drupal\licensemanagerpro\Service\ApiClient;
use Drupal\licensemanagerpro\Service\LicenseService;
use Symfony\Component\DependencyInjection\ContainerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;

/**
 * Admin license list, mint shortcut and connection test.
 */
final class AdminController extends ControllerBase {

  public function __construct(
    private LicenseService $licenseService,
    private ApiClient $apiClient,
  ) {}

  public static function create(ContainerInterface $container): static {
    return new static(
      $container->get('licensemanagerpro.license_service'),
      $container->get('licensemanagerpro.api_client'),
    );
  }

  /**
   * @return array<string, mixed>
   */
  public function list(): array {
    $licenses = $this->licenseService->listAll();
    $error = $this->licenseService->getLastError();
    $build = [
      '#theme' => 'licensemanagerpro_admin_licenses',
      '#licenses' => $licenses,
      '#error' => $error !== NULL && $error !== '' ? $error : NULL,
      '#attached' => [
        'library' => ['licensemanagerpro/base'],
      ],
      '#cache' => ['max-age' => 0],
    ];
    $build['mint_link'] = [
      '#type' => 'link',
      '#title' => $this->t('Mint license'),
      '#url' => Url::fromRoute('licensemanagerpro.mint'),
      '#attributes' => ['class' => ['button', 'button--primary']],
    ];
    return $build;
  }

  /**
   * JSON connection test for the saved configuration.
   */
  public function testConnection(): JsonResponse {
    $result = $this->apiClient->testConnection();
    $status = $result['ok'] ? JsonResponse::HTTP_OK : JsonResponse::HTTP_SERVICE_UNAVAILABLE;
    return new JsonResponse([
      'ok' => $result['ok'],
      'version' => $result['version'],
      'error' => $result['error'],
    ], $status);
  }

}
