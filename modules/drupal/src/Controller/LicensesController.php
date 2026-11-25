<?php

namespace Drupal\licensemanagerpro\Controller;

use Drupal\Core\Controller\ControllerBase;
use Drupal\licensemanagerpro\Service\LicenseService;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * The logged-in user's own licenses (/user/licenses).
 */
final class LicensesController extends ControllerBase {

  public function __construct(
    private LicenseService $licenseService,
  ) {}

  public static function create(ContainerInterface $container): static {
    return new static(
      $container->get('licensemanagerpro.license_service'),
    );
  }

  /**
   * @return array<string, mixed>
   */
  public function list(): array {
    $email = (string) $this->currentUser()->getEmail();
    $licenses = [];
    $error = NULL;
    if ($email === '') {
      $error = $this->t('Your account has no email address, so no licenses can be looked up.');
    }
    else {
      $licenses = $this->licenseService->findByEmail($email);
      $failure = $this->licenseService->getLastError();
      if ($failure !== NULL && $failure !== '') {
        $error = $failure;
      }
    }
    return [
      '#theme' => 'licensemanagerpro_licenses',
      '#licenses' => $licenses,
      '#error' => $error,
      '#attached' => [
        'library' => ['licensemanagerpro/base'],
      ],
      // License data comes from the live backend; never cache it.
      '#cache' => ['max-age' => 0],
    ];
  }

}
