<?php
/**
 * License Manager Pro — administrator dashboard template.
 *
 * @var \Licensemanagerpro\Component\Licensemanagerpro\Administrator\View\Dashboard\HtmlView $this
 */

defined('_JEXEC') or die;

use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Router\Route;
use Licensemanagerpro\Component\Licensemanagerpro\Administrator\Helper\Branding;

echo Branding::style();
echo Branding::header(Text::_('COM_LICENSMANAGERPRO'), Text::_('COM_LICENSMANAGERPRO_DASHBOARD_SUBTITLE'));
?>
<div class="lmp-wrap">
    <div class="lmp-grid">
        <div class="lmp-card">
            <h3><?php echo Text::_('COM_LICENSMANAGERPRO_CONNECTION'); ?></h3>
            <?php if ($this->connection !== null) : ?>
                <p><span class="lmp-status-ok"><?php echo Text::_('COM_LICENSMANAGERPRO_CONNECTED'); ?></span></p>
                <?php if (!empty($this->connection['version'])) : ?>
                    <p><?php echo Text::_('COM_LICENSMANAGERPRO_BACKEND_VERSION'); ?>: <?php echo $this->escape($this->connection['version']); ?></p>
                <?php endif; ?>
            <?php else : ?>
                <p><span class="lmp-status-bad"><?php echo Text::_('COM_LICENSMANAGERPRO_NOT_CONNECTED'); ?></span></p>
                <p><?php echo $this->escape($this->connectionError ?? ''); ?></p>
            <?php endif; ?>
            <form action="<?php echo Route::_('index.php?option=com_licensemanagerpro&task=config.test'); ?>" method="post" class="lmp-actions">
                <button type="submit" class="lmp-btn"><?php echo Text::_('COM_LICENSMANAGERPRO_TEST_CONNECTION'); ?></button>
                <?php echo HTMLHelper::_('form.token'); ?>
            </form>
        </div>

        <div class="lmp-card">
            <h3><?php echo Text::_('COM_LICENSMANAGERPRO_SETTINGS'); ?></h3>
            <form action="<?php echo Route::_('index.php?option=com_licensemanagerpro&task=config.save'); ?>" method="post">
                <label class="lmp-label" for="lmp-api-url"><?php echo Text::_('COM_LICENSMANAGERPRO_API_URL'); ?></label>
                <input class="lmp-input" type="url" id="lmp-api-url" name="api_url" value="<?php echo $this->escape((string) $this->params->get('api_url', '')); ?>" placeholder="https://license.example.com/api" required>
                <label class="lmp-label" for="lmp-api-key"><?php echo Text::_('COM_LICENSMANAGERPRO_API_KEY'); ?></label>
                <input class="lmp-input" type="password" id="lmp-api-key" name="api_key" value="" placeholder="<?php echo $this->apiKeyConfigured ? Text::_('COM_LICENSMANAGERPRO_API_KEY_SET') : Text::_('COM_LICENSMANAGERPRO_API_KEY_EMPTY'); ?>" autocomplete="off">
                <label class="lmp-label" for="lmp-signed"><?php echo Text::_('COM_LICENSMANAGERPRO_SIGNED_REQUESTS'); ?></label>
                <select class="lmp-select" id="lmp-signed" name="signed_requests">
                    <option value="0"<?php echo (int) $this->params->get('signed_requests', 0) === 0 ? ' selected' : ''; ?>><?php echo Text::_('JNO'); ?></option>
                    <option value="1"<?php echo (int) $this->params->get('signed_requests', 0) === 1 ? ' selected' : ''; ?>><?php echo Text::_('JYES'); ?></option>
                </select>
                <label class="lmp-label" for="lmp-default-product"><?php echo Text::_('COM_LICENSMANAGERPRO_DEFAULT_PRODUCT_SLUG'); ?></label>
                <input class="lmp-input" type="text" id="lmp-default-product" name="default_product_slug" value="<?php echo $this->escape((string) $this->params->get('default_product_slug', '')); ?>">
                <label class="lmp-label" for="lmp-default-cycle"><?php echo Text::_('COM_LICENSMANAGERPRO_DEFAULT_BILLING_CYCLE'); ?></label>
                <select class="lmp-select" id="lmp-default-cycle" name="default_billing_cycle">
                    <option value=""><?php echo Text::_('COM_LICENSMANAGERPRO_CYCLE_NONE'); ?></option>
                    <?php foreach ($this->cycles as $cycle) : ?>
                        <option value="<?php echo $cycle; ?>"<?php echo (string) $this->params->get('default_billing_cycle', '') === $cycle ? ' selected' : ''; ?>><?php echo $cycle; ?></option>
                    <?php endforeach; ?>
                </select>
                <div class="lmp-actions">
                    <button type="submit" class="lmp-btn"><?php echo Text::_('JSAVE'); ?></button>
                </div>
                <?php echo HTMLHelper::_('form.token'); ?>
            </form>
        </div>
    </div>

    <div class="lmp-grid">
        <div class="lmp-card">
            <h3><?php echo Text::_('COM_LICENSMANAGERPRO_MINT_LICENSE'); ?></h3>
            <form action="<?php echo Route::_('index.php?option=com_licensemanagerpro&task=license.mint'); ?>" method="post">
                <label class="lmp-label" for="lmp-owner-email"><?php echo Text::_('COM_LICENSMANAGERPRO_OWNER_EMAIL'); ?></label>
                <input class="lmp-input" type="email" id="lmp-owner-email" name="owner_email" required>
                <label class="lmp-label" for="lmp-product-slug"><?php echo Text::_('COM_LICENSMANAGERPRO_PRODUCT'); ?></label>
                <?php if (!empty($this->products)) : ?>
                    <select class="lmp-select" id="lmp-product-slug" name="product_slug">
                        <?php foreach ($this->products as $product) : ?>
                            <option value="<?php echo $this->escape((string) ($product['slug'] ?? '')); ?>"<?php echo (string) $this->params->get('default_product_slug', '') === (string) ($product['slug'] ?? '') ? ' selected' : ''; ?>><?php echo $this->escape((string) ($product['name'] ?? $product['slug'] ?? '')); ?> (<?php echo $this->escape((string) ($product['slug'] ?? '')); ?>)</option>
                        <?php endforeach; ?>
                    </select>
                <?php else : ?>
                    <input class="lmp-input" type="text" id="lmp-product-slug" name="product_slug" value="<?php echo $this->escape((string) $this->params->get('default_product_slug', '')); ?>" placeholder="product-slug" required>
                    <p class="lmp-muted"><?php echo Text::_('COM_LICENSMANAGERPRO_PRODUCTS_UNAVAILABLE'); ?></p>
                <?php endif; ?>
                <label class="lmp-label" for="lmp-cycle"><?php echo Text::_('COM_LICENSMANAGERPRO_BILLING_CYCLE'); ?></label>
                <select class="lmp-select" id="lmp-cycle" name="billing_cycle">
                    <?php foreach ($this->cycles as $cycle) : ?>
                        <option value="<?php echo $cycle; ?>"<?php echo (string) $this->params->get('default_billing_cycle', '') === $cycle ? ' selected' : ''; ?>><?php echo $cycle; ?></option>
                    <?php endforeach; ?>
                </select>
                <label class="lmp-label" for="lmp-custom-key"><?php echo Text::_('COM_LICENSMANAGERPRO_CUSTOM_KEY'); ?></label>
                <input class="lmp-input" type="text" id="lmp-custom-key" name="license_key" placeholder="<?php echo Text::_('COM_LICENSMANAGERPRO_CUSTOM_KEY_HINT'); ?>" autocomplete="off">
                <div class="lmp-actions">
                    <button type="submit" class="lmp-btn"><?php echo Text::_('COM_LICENSMANAGERPRO_MINT_BUTTON'); ?></button>
                </div>
                <?php echo HTMLHelper::_('form.token'); ?>
            </form>
        </div>

        <div class="lmp-card">
            <h3><?php echo Text::_('COM_LICENSMANAGERPRO_VALIDATE_TITLE'); ?></h3>
            <p><?php echo Text::_('COM_LICENSMANAGERPRO_VALIDATE_DESC'); ?></p>
            <form action="<?php echo Route::_('index.php?option=com_licensemanagerpro&task=license.validate'); ?>" method="post">
                <label class="lmp-label" for="lmp-validate-key"><?php echo Text::_('COM_LICENSMANAGERPRO_LICENSE_KEY'); ?></label>
                <input class="lmp-input" type="text" id="lmp-validate-key" name="license_key" required autocomplete="off">
                <label class="lmp-label" for="lmp-validate-domain"><?php echo Text::_('COM_LICENSMANAGERPRO_DOMAIN'); ?></label>
                <input class="lmp-input" type="text" id="lmp-validate-domain" name="domain" placeholder="example.com">
                <div class="lmp-actions">
                    <button type="submit" class="lmp-btn"><?php echo Text::_('COM_LICENSMANAGERPRO_VALIDATE_BUTTON'); ?></button>
                </div>
                <?php echo HTMLHelper::_('form.token'); ?>
            </form>
        </div>
    </div>

    <div class="lmp-card">
        <h3><?php echo Text::_('COM_LICENSMANAGERPRO_RECENT_LICENSES'); ?></h3>
        <?php if ($this->licenseError !== null) : ?>
            <p><span class="lmp-status-bad"><?php echo $this->escape($this->licenseError); ?></span></p>
        <?php elseif (empty($this->licenses)) : ?>
            <p class="lmp-muted"><?php echo Text::_('COM_LICENSMANAGERPRO_NO_LICENSES'); ?></p>
        <?php else : ?>
            <table class="lmp-table">
                <thead>
                    <tr>
                        <th><?php echo Text::_('COM_LICENSMANAGERPRO_LICENSE_KEY'); ?></th>
                        <th><?php echo Text::_('COM_LICENSMANAGERPRO_PRODUCT'); ?></th>
                        <th><?php echo Text::_('COM_LICENSMANAGERPRO_OWNER_EMAIL'); ?></th>
                        <th><?php echo Text::_('COM_LICENSMANAGERPRO_STATUS'); ?></th>
                        <th><?php echo Text::_('COM_LICENSMANAGERPRO_EXPIRES'); ?></th>
                        <th><?php echo Text::_('COM_LICENSMANAGERPRO_ACTIONS'); ?></th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($this->licenses as $license) : ?>
                        <tr>
                            <td><span class="lmp-key"><?php echo $this->escape((string) ($license['key'] ?? '')); ?></span></td>
                            <td><?php echo $this->escape((string) ($license['product'] ?? '')); ?></td>
                            <td><?php echo $this->escape((string) ($license['owner_email'] ?? '')); ?></td>
                            <td><?php echo Branding::statusPill((string) ($license['status'] ?? '')); ?></td>
                            <td><?php echo $this->escape((string) ($license['expires_at'] ?? '')); ?></td>
                            <td>
                                <form action="<?php echo Route::_('index.php?option=com_licensemanagerpro&task=license.renew'); ?>" method="post" class="lmp-inline-form">
                                    <input type="hidden" name="id" value="<?php echo (int) ($license['id'] ?? 0); ?>">
                                    <button type="submit" class="lmp-btn lmp-btn--small"><?php echo Text::_('COM_LICENSMANAGERPRO_RENEW'); ?></button>
                                    <?php echo HTMLHelper::_('form.token'); ?>
                                </form>
                                <?php if (($license['status'] ?? '') === 'active') : ?>
                                    <form action="<?php echo Route::_('index.php?option=com_licensemanagerpro&task=license.deactivate'); ?>" method="post" class="lmp-inline-form">
                                        <input type="hidden" name="id" value="<?php echo (int) ($license['id'] ?? 0); ?>">
                                        <button type="submit" class="lmp-btn lmp-btn--ghost lmp-btn--small"><?php echo Text::_('COM_LICENSMANAGERPRO_DEACTIVATE'); ?></button>
                                        <?php echo HTMLHelper::_('form.token'); ?>
                                    </form>
                                <?php elseif (($license['status'] ?? '') === 'inactive') : ?>
                                    <form action="<?php echo Route::_('index.php?option=com_licensemanagerpro&task=license.activate'); ?>" method="post" class="lmp-inline-form">
                                        <input type="hidden" name="id" value="<?php echo (int) ($license['id'] ?? 0); ?>">
                                        <button type="submit" class="lmp-btn lmp-btn--ghost lmp-btn--small"><?php echo Text::_('COM_LICENSMANAGERPRO_ACTIVATE'); ?></button>
                                        <?php echo HTMLHelper::_('form.token'); ?>
                                    </form>
                                <?php endif; ?>
                                <form action="<?php echo Route::_('index.php?option=com_licensemanagerpro&task=license.revoke'); ?>" method="post" class="lmp-inline-form" onsubmit="return confirm('<?php echo Text::_('COM_LICENSMANAGERPRO_REVOKE_CONFIRM', true); ?>');">
                                    <input type="hidden" name="id" value="<?php echo (int) ($license['id'] ?? 0); ?>">
                                    <button type="submit" class="lmp-btn lmp-btn--danger lmp-btn--small"><?php echo Text::_('COM_LICENSMANAGERPRO_REVOKE'); ?></button>
                                    <?php echo HTMLHelper::_('form.token'); ?>
                                </form>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        <?php endif; ?>
        <div class="lmp-actions">
            <a class="lmp-btn lmp-btn--ghost" href="<?php echo Route::_('index.php?option=com_licensemanagerpro&view=licenses'); ?>"><?php echo Text::_('COM_LICENSMANAGERPRO_VIEW_ALL_LICENSES'); ?></a>
        </div>
    </div>
</div>
