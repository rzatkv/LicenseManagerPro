<?php
// Heading
$_['heading_title'] = 'License Manager Pro';

// Text
$_['text_extension'] = 'Extensions';
$_['text_success'] = 'Success: You have modified License Manager Pro!';
$_['text_edit'] = 'Edit License Manager Pro';
$_['text_home'] = 'Home';
$_['text_no_lmp_products'] = 'No License Manager Pro products could be loaded. Check the API URL and API key, then save and reload this page — you can still type a product slug manually below.';
$_['text_testing'] = 'Testing…';
$_['text_connection_ok'] = 'Connected to License Manager Pro';
$_['text_connection_failed'] = 'Connection failed';

// Entry
$_['entry_api_url'] = 'License Manager Pro API URL';
$_['entry_api_key'] = 'Module API Key';
$_['entry_signed'] = 'Sign requests (HMAC)';
$_['entry_complete_status'] = 'Order status that creates licenses';
$_['entry_mapping'] = 'Product Mapping';

// Help
$_['help_api_url'] = 'Base URL of your License Manager Pro API, e.g. https://license.example.com/api — no trailing slash.';
$_['help_api_key'] = 'Create a module-scoped API key in the License Manager Pro panel (API Keys), copy it once, and paste it here. It is stored in the OpenCart settings table.';
$_['help_signed'] = 'Adds X-LMP-Timestamp and X-LMP-Signature headers to every request. Enable it only if the same key is configured for signed requests in License Manager Pro.';
$_['help_complete_status'] = 'Licenses are created when an order reaches this status. Only mapped products get a license, and each order line is minted once.';
$_['help_mapping'] = 'For each OpenCart product, pick the License Manager Pro product and the billing cycle to use. OpenCart has no subscription cycle of its own, so the cycle comes from this mapping. Leave the product blank to sell it without a license.';

// Button
$_['button_test_connection'] = 'Test Connection';

// Error
$_['error_permission'] = 'Warning: You do not have permission to modify License Manager Pro!';
$_['error_api_url'] = 'A valid API URL starting with http:// or https:// is required.';
$_['error_api_key'] = 'A module API key is required.';
$_['error_warning'] = 'Warning: Please check the form carefully for errors!';
$_['error_not_configured'] = 'API URL and API key are not configured yet. Save the settings first.';
