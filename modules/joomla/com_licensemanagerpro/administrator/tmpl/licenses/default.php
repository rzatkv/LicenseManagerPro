<?php
/**
 * License Manager Pro — administrator licenses list template.
 *
 * @var \Licensemanagerpro\Component\Licensemanagerpro\Administrator\View\Licenses\HtmlView $this
 */

defined('_JEXEC') or die;

use Joomla\CMS\HTML\HTMLHelper;
use Joomla\CMS\Language\Text;
use Joomla\CMS\Router\Route;
use Licensemanagerpro\Component\Licensemanagerpro\Administrator\Helper\Branding;

echo Branding::style();
echo Branding::header(Text::_('COM_LICENSMANAGERPRO_LICENSES'), Text::_('COM_LICENSMANAGERPRO_LICENSES_SUBTITLE'));
?>
<div class="lmp-wrap">
    <div class="lmp-card">
        <form action="<?php echo Route::_('index.php?option=com_licensemanagerpro&view=licenses'); ?>" method="get">
            <input type="hidden" name="option" value="com_licensemanagerpro">
            <input type="hidden" name="view" value="licenses">
            <label class="lmp-label" for="lmp-search"><?php echo Text::_('COM_LICENSMANAGERPRO_SEARCH'); ?></label>
            <input class="lmp-input" type="search" id="lmp-search" name="search" value="<?php echo $this->escape($this->search); ?>" placeholder="<?php echo Text::_('COM_LICENSMANAGERPRO_SEARCH_HINT'); ?>">
            <label class="lmp-label" for="lmp-status"><?php echo Text::_('COM_LICENSMANAGERPRO_STATUS'); ?></label>
            <select class="lmp-select" id="lmp-status" name="status">
                <option value=""><?php echo Text::_('COM_LICENSMANAGERPRO_STATUS_ALL'); ?></option>
                <?php foreach (['active', 'inactive', 'revoked', 'expired'] as $status) : ?>
                    <option value="<?php echo $status; ?>"<?php echo $this->status === $status ? ' selected' : ''; ?>><?php echo ucfirst($status); ?></option>
                <?php endforeach; ?>
            </select>
            <div class="lmp-actions">
                <button type="submit" class="lmp-btn"><?php echo Text::_('COM_LICENSMANAGERPRO_FILTER'); ?></button>
                <a class="lmp-btn lmp-btn--ghost" href="<?php echo Route::_('index.php?option=com_licensemanagerpro&view=licenses'); ?>"><?php echo Text::_('COM_LICENSMANAGERPRO_CLEAR'); ?></a>
            </div>
        </form>
    </div>

    <div class="lmp-card">
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
                        <th><?php echo Text::_('COM_LICENSMANAGERPRO_BILLING_CYCLE'); ?></th>
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
                            <td><?php echo $this->escape((string) ($license['billing_cycle'] ?? '')); ?></td>
                            <td><?php echo Branding::statusPill((string) ($license['status'] ?? '')); ?></td>
                            <td><?php echo $this->escape((string) ($license['expires_at'] ?? '')); ?></td>
                            <td>
                                <form action="<?php echo Route::_('index.php?option=com_licensemanagerpro&task=license.renew'); ?>" method="post" class="lmp-inline-form">
                                    <input type="hidden" name="id" value="<?php echo (int) ($license['id'] ?? 0); ?>">
                                    <button type="submit" class="lmp-btn lmp-btn--small"><?php echo Text::_('COM_LICENSMANAGERPRO_RENEW'); ?></button>
                                    <?php echo HTMLHelper::_('form.token'); ?>
                                </form>
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
    </div>
</div>
