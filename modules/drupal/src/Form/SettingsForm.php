<?php

namespace Drupal\licensemanagerpro\Form;

use Drupal\Core\Config\ConfigFactoryInterface;
use Drupal\Core\Entity\EntityTypeManagerInterface;
use Drupal\Core\Extension\ModuleHandlerInterface;
use Drupal\Core\Form\ConfigFormBase;
use Drupal\Core\Form\FormStateInterface;
use Drupal\licensemanagerpro\Service\ApiClient;
use Drupal\licensemanagerpro\Service\BillingCycle;
use Drupal\licensemanagerpro\Service\ConfigService;
use Symfony\Component\DependencyInjection\ContainerInterface;

/**
 * License Manager Pro settings: connection, signing, product mapping.
 */
final class SettingsForm extends ConfigFormBase {

  public function __construct(
    ConfigFactoryInterface $config_factory,
    private ApiClient $apiClient,
    private EntityTypeManagerInterface $entityTypeManager,
    private ModuleHandlerInterface $moduleHandler,
  ) {
    parent::__construct($config_factory);
  }

  public static function create(ContainerInterface $container): static {
    return new static(
      $container->get('config.factory'),
      $container->get('licensemanagerpro.api_client'),
      $container->get('entity_type.manager'),
      $container->get('module_handler'),
    );
  }

  protected function getEditableConfigNames(): array {
    return [ConfigService::CONFIG_NAME];
  }

  public function getFormId(): string {
    return 'licensemanagerpro_settings';
  }

  public function buildForm(array $form, FormStateInterface $form_state): array {
    $config = $this->config(ConfigService::CONFIG_NAME);
    $products = $this->apiClient->listProducts();
    $product_options = [];
    if (is_array($products)) {
      foreach ($products as $product) {
        if (isset($product['slug'], $product['name'])) {
          $product_options[(string) $product['slug']] = (string) $product['name'] . ' (' . (string) $product['slug'] . ')';
        }
      }
    }

    $form['connection'] = [
      '#type' => 'details',
      '#title' => $this->t('Connection'),
      '#open' => TRUE,
    ];
    $form['connection']['api_url'] = [
      '#type' => 'url',
      '#title' => $this->t('API base URL'),
      '#description' => $this->t('Base URL of the License Manager Pro API, including /api — for example https://license.example.com/api. No trailing slash.'),
      '#default_value' => $config->get(ConfigService::KEY_API_URL),
      '#required' => TRUE,
    ];
    $form['connection']['api_key'] = [
      '#type' => 'password',
      '#title' => $this->t('Module API key'),
      '#description' => $this->t('Paste the module-scoped API key created in the License Manager Pro panel (API Keys → module scope, shown once at creation). Leave blank to keep the saved key. The module never asks for an admin email or password.'),
      '#attributes' => ['autocomplete' => 'off'],
    ];
    $form['connection']['signed_requests'] = [
      '#type' => 'checkbox',
      '#title' => $this->t('Sign requests with HMAC (X-LMP-Timestamp + X-LMP-Signature)'),
      '#description' => $this->t('Enable this only when the API key was created with "Require signed requests". Signed requests carry a timestamp the server rejects after 5 minutes.'),
      '#default_value' => (bool) $config->get(ConfigService::KEY_SIGNED_REQUESTS),
    ];
    $form['connection']['test_connection'] = [
      '#type' => 'submit',
      '#value' => $this->t('Test connection'),
      '#submit' => ['::testConnection'],
      '#limit_validation_errors' => [],
      '#button_type' => 'primary',
    ];

    $form['billing'] = [
      '#type' => 'details',
      '#title' => $this->t('Billing cycles'),
      '#open' => TRUE,
    ];
    $form['billing']['default_billing_cycle'] = [
      '#type' => 'select',
      '#title' => $this->t('Default billing cycle'),
      '#description' => $this->t('Cycle sent when minting a license without an explicit cycle. The backend adds a missing cycle to the product automatically (cycle sync).'),
      '#options' => BillingCycle::labels(),
      '#default_value' => $config->get(ConfigService::KEY_DEFAULT_BILLING_CYCLE) ?: BillingCycle::DEFAULT_CYCLE,
      '#required' => TRUE,
    ];

    $form['mapping'] = [
      '#type' => 'details',
      '#title' => $this->t('Product mapping'),
      '#open' => TRUE,
    ];
    $mapping = $config->get(ConfigService::KEY_PRODUCT_MAPPING);
    if (!is_array($mapping)) {
      $mapping = [];
    }
    $node_types = $this->loadNodeTypes();
    if ($node_types === []) {
      $form['mapping']['empty'] = [
        '#markup' => '<p>' . $this->t('No node types exist yet. Create a content type first, then map it to a License Manager Pro product here.') . '</p>',
      ];
    }
    foreach ($node_types as $node_type => $label) {
      if ($product_options !== []) {
        $form['mapping']['product_mapping'][$node_type] = [
          '#type' => 'select',
          '#title' => $label,
          '#description' => $this->t('License Manager Pro product used when minting a license for this content type.'),
          '#options' => ['' => $this->t('- None -')] + $product_options,
          '#default_value' => $mapping[$node_type] ?? '',
        ];
      }
      else {
        $form['mapping']['product_mapping'][$node_type] = [
          '#type' => 'textfield',
          '#title' => $label,
          '#description' => $this->t('License Manager Pro product slug (for example cloudpanel-pro). The product list could not be loaded from the backend, so enter the slug manually.'),
          '#default_value' => $mapping[$node_type] ?? '',
        ];
      }
    }
    if ($product_options === [] && $node_types !== []) {
      $form['mapping']['notice'] = [
        '#markup' => '<p>' . $this->t('The product list could not be loaded — check the API URL and key above, then save and reopen this form to pick products from a dropdown.') . '</p>',
      ];
    }

    return parent::buildForm($form, $form_state);
  }

  public function validateForm(array &$form, FormStateInterface $form_state): void {
    parent::validateForm($form, $form_state);
    $api_url = (string) $form_state->getValue('api_url');
    $scheme = (string) parse_url($api_url, PHP_URL_SCHEME);
    if ($scheme !== 'https' && $scheme !== 'http') {
      $form_state->setErrorByName('api_url', $this->t('Enter a valid API base URL starting with http:// or https://.'));
    }
    $cycle = (string) $form_state->getValue('default_billing_cycle');
    if (!BillingCycle::isValid($cycle)) {
      $form_state->setErrorByName('default_billing_cycle', $this->t('Choose a valid billing cycle.'));
    }
  }

  /**
   * Test-connection button handler: checks the typed values without
   * saving the form. A blank key field falls back to the saved key.
   */
  public function testConnection(array &$form, FormStateInterface $form_state): void {
    $config = $this->config(ConfigService::CONFIG_NAME);
    $overrides = [
      'api_url' => (string) $form_state->getValue('api_url'),
      'api_key' => (string) $form_state->getValue('api_key') !== '' ? (string) $form_state->getValue('api_key') : (string) $config->get(ConfigService::KEY_API_KEY),
      'signed_requests' => (bool) $form_state->getValue('signed_requests'),
    ];
    $result = $this->apiClient->testConnection($overrides);
    if ($result['ok']) {
      $version = $result['version'] !== NULL ? $this->t(' (version @version)', ['@version' => $result['version']]) : '';
      $this->messenger()->addStatus($this->t('Connection successful@version.', ['@version' => $version]));
    }
    else {
      $this->messenger()->addError($this->t('Connection failed: @error', ['@error' => (string) $result['error']]));
    }
    $form_state->setRebuild(TRUE);
  }

  public function submitForm(array &$form, FormStateInterface $form_state): void {
    parent::submitForm($form, $form_state);
    $config = $this->config(ConfigService::CONFIG_NAME);
    $api_url = rtrim((string) $form_state->getValue('api_url'), '/');
    if (parse_url($api_url, PHP_URL_SCHEME) === 'http') {
      $this->messenger()->addWarning($this->t('The API URL uses plain http://. Use https:// in production so the API key is never sent in clear text.'));
    }
    $editable = $this->configFactory->getEditable(ConfigService::CONFIG_NAME);
    $editable->set(ConfigService::KEY_API_URL, $api_url);
    $new_key = (string) $form_state->getValue('api_key');
    if ($new_key !== '') {
      $editable->set(ConfigService::KEY_API_KEY, $new_key);
    }
    $editable->set(ConfigService::KEY_SIGNED_REQUESTS, (bool) $form_state->getValue('signed_requests'));
    $editable->set(ConfigService::KEY_DEFAULT_BILLING_CYCLE, (string) $form_state->getValue('default_billing_cycle'));
    $mapping = $form_state->getValue('product_mapping');
    $clean = [];
    if (is_array($mapping)) {
      foreach ($mapping as $node_type => $slug) {
        $slug = trim((string) $slug);
        if ($slug !== '') {
          $clean[(string) $node_type] = $slug;
        }
      }
    }
    $editable->set(ConfigService::KEY_PRODUCT_MAPPING, $clean);
    $editable->save();
  }

  /**
   * @return array<string, string> Node type machine name => label.
   */
  private function loadNodeTypes(): array {
    if (!$this->moduleHandler->moduleExists('node')) {
      return [];
    }
    try {
      $types = $this->entityTypeManager->getStorage('node_type')->loadMultiple();
    }
    catch (\Exception) {
      return [];
    }
    $labels = [];
    foreach ($types as $machine_name => $type) {
      $labels[(string) $machine_name] = (string) $type->label();
    }
    return $labels;
  }

}
