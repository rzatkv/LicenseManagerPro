<?php

namespace Drupal\licensemanagerpro\Form;

use Drupal\Core\Form\FormBase;
use Drupal\Core\Form\FormStateInterface;
use Drupal\Core\Url;
use Drupal\licensemanagerpro\Service\ApiClient;
use Drupal\licensemanagerpro\Service\BillingCycle;
use Drupal\licensemanagerpro\Service\ConfigService;
use Drupal\licensemanagerpro\Service\LicenseService;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * Admin form to mint a license for any user.
 */
final class MintLicenseForm extends FormBase {

  public function __construct(
    private LicenseService $licenseService,
    private ApiClient $apiClient,
    private ConfigService $config,
  ) {}

  public static function create(ContainerInterface $container): static {
    return new static(
      $container->get('licensemanagerpro.license_service'),
      $container->get('licensemanagerpro.api_client'),
      $container->get('licensemanagerpro.config'),
    );
  }

  public function getFormId(): string {
    return 'licensemanagerpro_mint_license';
  }

  public function buildForm(array $form, FormStateInterface $form_state): array {
    $products = $this->apiClient->listProducts();
    $product_options = [];
    if (is_array($products)) {
      foreach ($products as $product) {
        if (isset($product['slug'], $product['name'])) {
          $product_options[(string) $product['slug']] = (string) $product['name'] . ' (' . (string) $product['slug'] . ')';
        }
      }
    }

    $form['owner_email'] = [
      '#type' => 'email',
      '#title' => $this->t('Owner email'),
      '#description' => $this->t('The license is owned by this email address.'),
      '#required' => TRUE,
    ];
    if ($product_options !== []) {
      $form['product_slug'] = [
        '#type' => 'select',
        '#title' => $this->t('Product'),
        '#options' => $product_options,
        '#required' => TRUE,
      ];
    }
    else {
      $form['product_slug'] = [
        '#type' => 'textfield',
        '#title' => $this->t('Product slug'),
        '#description' => $this->t('The product list could not be loaded from the backend — enter the License Manager Pro product slug manually.'),
        '#required' => TRUE,
      ];
    }
    $form['billing_cycle'] = [
      '#type' => 'select',
      '#title' => $this->t('Billing cycle'),
      '#description' => $this->t('The backend adds a missing cycle to the product automatically (cycle sync).'),
      '#options' => BillingCycle::labels(),
      '#default_value' => $this->config->getDefaultBillingCycle(),
      '#required' => TRUE,
    ];
    $form['license_key'] = [
      '#type' => 'textfield',
      '#title' => $this->t('License key (optional)'),
      '#description' => $this->t('Leave blank to let the backend generate the key.'),
      '#attributes' => ['autocomplete' => 'off'],
    ];
    $form['actions']['submit'] = [
      '#type' => 'submit',
      '#value' => $this->t('Mint license'),
      '#button_type' => 'primary',
    ];
    return $form;
  }

  public function submitForm(array &$form, FormStateInterface $form_state): void {
    $license = $this->licenseService->mint(
      (string) $form_state->getValue('owner_email'),
      (string) $form_state->getValue('product_slug'),
      (string) $form_state->getValue('billing_cycle'),
      (string) $form_state->getValue('license_key'),
    );
    if ($license === NULL) {
      $this->messenger()->addError($this->t('License was not created: @error', ['@error' => (string) $this->licenseService->getLastError()]));
      return;
    }
    $this->messenger()->addStatus($this->t('License created for @email. Key: @key', [
      '@email' => (string) $form_state->getValue('owner_email'),
      '@key' => (string) ($license['key'] ?? ''),
    ]));
    $form_state->setRedirectUrl(Url::fromRoute('licensemanagerpro.admin_licenses'));
  }

}
