<?php
/**
 * License Manager Pro — site "My licenses" template.
 * Branded license cards with status pills and a copy button.
 *
 * @var \Licensemanagerpro\Component\Licensemanagerpro\Site\View\Licenses\HtmlView $this
 */

defined('_JEXEC') or die;

use Joomla\CMS\Language\Text;
use Licensemanagerpro\Component\Licensemanagerpro\Administrator\Helper\Branding;

require_once JPATH_ADMINISTRATOR . '/components/com_licensemanagerpro/src/Helper/Branding.php';

echo Branding::style();
echo Branding::header(Text::_('COM_LICENSMANAGERPRO_MY_LICENSES'), Text::_('COM_LICENSMANAGERPRO_MY_LICENSES_SUBTITLE'));
?>
<div class="lmp-wrap">
    <?php if ($this->licenseError !== null) : ?>
        <div class="lmp-card">
            <p><span class="lmp-status-bad"><?php echo $this->escape($this->licenseError); ?></span></p>
        </div>
    <?php elseif (empty($this->licenses)) : ?>
        <div class="lmp-card">
            <p><?php echo Text::_('COM_LICENSMANAGERPRO_NO_LICENSES_YET'); ?></p>
        </div>
    <?php else : ?>
        <?php foreach ($this->licenses as $license) : ?>
            <div class="lmp-card lmp-license-card">
                <div class="lmp-license-card__head">
                    <span class="lmp-license-card__product"><?php echo $this->escape((string) ($license['product'] ?? '')); ?></span>
                    <?php echo Branding::statusPill((string) ($license['status'] ?? '')); ?>
                </div>
                <div class="lmp-license-card__meta">
                    <div><b><?php echo Text::_('COM_LICENSMANAGERPRO_BILLING_CYCLE'); ?></b><?php echo $this->escape((string) ($license['billing_cycle'] ?? '')); ?></div>
                    <div><b><?php echo Text::_('COM_LICENSMANAGERPRO_EXPIRES'); ?></b><?php echo $this->escape((string) ($license['expires_at'] ?? '')); ?></div>
                    <div><b><?php echo Text::_('COM_LICENSMANAGERPRO_ACTIVATIONS'); ?></b><?php echo (int) ($license['activations'] ?? 0); ?> / <?php echo (int) ($license['max_activations'] ?? 1); ?></div>
                    <div><b><?php echo Text::_('COM_LICENSMANAGERPRO_CREATED'); ?></b><?php echo $this->escape((string) ($license['created_at'] ?? '')); ?></div>
                </div>
                <div class="lmp-key-row">
                    <span class="lmp-key"><?php echo $this->escape((string) ($license['key'] ?? '')); ?></span>
                    <button type="button" class="lmp-btn lmp-btn--small lmp-copy-btn" data-key="<?php echo $this->escape((string) ($license['key'] ?? '')); ?>" data-copied="<?php echo Text::_('COM_LICENSMANAGERPRO_COPIED'); ?>"><?php echo Text::_('COM_LICENSMANAGERPRO_COPY_KEY'); ?></button>
                </div>
            </div>
        <?php endforeach; ?>
    <?php endif; ?>
</div>
<script>
document.querySelectorAll('.lmp-copy-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-key') || '';
        var done = function () {
            var label = btn.textContent;
            btn.textContent = btn.getAttribute('data-copied') || 'Copied';
            setTimeout(function () { btn.textContent = label; }, 1500);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(key).then(done, function () { fallbackCopy(key, done); });
        } else {
            fallbackCopy(key, done);
        }
    });
});
function fallbackCopy(text, done) {
    var area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try { document.execCommand('copy'); } catch (e) { /* clipboard unavailable */ }
    document.body.removeChild(area);
    done();
}
</script>
