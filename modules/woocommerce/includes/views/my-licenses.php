<?php
/**
 * License Manager Pro — My Account → Licenses tab.
 *
 * View layer: renders the customer's licenses as branded cards
 * (inline CSS only, magenta #C1165E -> violet #6D5DF6 accents, no
 * external assets). It receives plain data from
 * LMP_Account::render_endpoint() and contains no business logic and
 * no HTTP calls.
 *
 * Variables in scope: $view_licenses (each: key, license_id,
 * product_name, order_id, status, status_class, expires, activations,
 * instances[] with id/label/fingerprint), $deactivate_nonce,
 * $ajax_url, $copied_label, $confirm_label.
 */

if (!defined('ABSPATH')) {
    exit;
}
?>
<h2><?php esc_html_e('Your licenses', 'licensemanagerpro'); ?></h2>
<style>
.lmp-cards{display:flex;flex-direction:column;gap:16px;margin-top:16px;}
.lmp-card{background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:18px 20px;box-shadow:0 1px 3px rgba(0,0,0,.05);overflow:hidden;}
.lmp-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;}
.lmp-product{font-size:16px;font-weight:700;color:#111827;}
.lmp-pill{display:inline-block;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;line-height:1.6;white-space:nowrap;}
.lmp-pill.lmp-ok{background:#dcfce7;color:#166534;}
.lmp-pill.lmp-warn{background:#fef3c7;color:#92400e;}
.lmp-pill.lmp-err{background:#fee2e2;color:#991b1b;}
.lmp-pill.lmp-muted{background:#e5e7eb;color:#374151;}
.lmp-key-row{display:flex;gap:8px;margin-top:14px;}
.lmp-key{flex:1;min-width:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;color:#9d174d;background:#fdf2f8;border:1px solid #f9a8d4;border-radius:8px;padding:8px 10px;word-break:break-all;}
.lmp-meta{display:flex;flex-wrap:wrap;gap:8px 24px;margin:14px 0 0;padding:0;}
.lmp-meta div{display:flex;gap:6px;font-size:13px;}
.lmp-meta dt{color:#6b7280;font-weight:400;}
.lmp-meta dd{margin:0;color:#111827;font-weight:500;}
.lmp-instances{margin:14px 0 0;padding:12px 0 0;border-top:1px solid #f3f4f6;display:flex;flex-direction:column;gap:8px;}
.lmp-instance{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px;}
.lmp-instance small{color:#6b7280;}
</style>
<?php if (empty($view_licenses)) : ?>
    <div class="lmp-card"><p style="margin:0;"><?php esc_html_e('You do not own any licenses yet.', 'licensemanagerpro'); ?></p></div>
<?php else : ?>
    <div class="lmp-cards">
    <?php foreach ($view_licenses as $license) : ?>
        <article class="lmp-card">
            <div class="lmp-card-head"><span class="lmp-product"><?php echo esc_html($license['product_name']); ?></span>
                <span class="lmp-pill <?php echo esc_attr($license['status_class']); ?>"><?php echo esc_html(ucfirst($license['status'])); ?></span></div>
            <div class="lmp-key-row"><code class="lmp-key"><?php echo esc_html($license['key']); ?></code>
                <button type="button" class="button lmp-copy" data-key="<?php echo esc_attr($license['key']); ?>"><?php esc_html_e('Copy', 'licensemanagerpro'); ?></button></div>
            <dl class="lmp-meta">
                <div><dt><?php esc_html_e('Expires', 'licensemanagerpro'); ?></dt><dd><?php echo esc_html($license['expires']); ?></dd></div>
                <div><dt><?php esc_html_e('Activations', 'licensemanagerpro'); ?></dt><dd><?php echo esc_html($license['activations']); ?></dd></div>
                <div><dt><?php esc_html_e('Order', 'licensemanagerpro'); ?></dt><dd>#<?php echo esc_html($license['order_id']); ?></dd></div>
            </dl>
            <?php if (!empty($license['instances'])) : ?>
                <div class="lmp-instances">
                <?php foreach ($license['instances'] as $instance) : ?>
                    <div class="lmp-instance"><span><?php echo esc_html($instance['label']); ?>
                        <small>(<?php echo esc_html($instance['fingerprint']); ?>)</small></span>
                        <button type="button" class="button lmp-deactivate" data-license-id="<?php echo esc_attr($license['license_id']); ?>" data-activation-id="<?php echo esc_attr($instance['id']); ?>"><?php esc_html_e('Deactivate', 'licensemanagerpro'); ?></button></div>
                <?php endforeach; ?>
                </div>
            <?php endif; ?>
        </article>
    <?php endforeach; ?>
    </div>
<?php endif; ?>
<script>document.querySelectorAll(".lmp-copy").forEach(function (btn) {
btn.addEventListener("click", function () {
var key = btn.dataset.key || "";
var done = function () { btn.textContent = "<?php echo esc_js($copied_label); ?>"; };
var fallback = function () { var t = document.createElement("textarea"); t.value = key; document.body.appendChild(t); t.select(); try { document.execCommand("copy"); } catch (e) {} document.body.removeChild(t); };
if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(key).then(done, function () { fallback(); done(); }); }
else { fallback(); done(); }
}); });
document.querySelectorAll(".lmp-deactivate").forEach(function (btn) {
btn.addEventListener("click", function () {
if (!confirm("<?php echo esc_js($confirm_label); ?>")) return;
fetch("<?php echo esc_url($ajax_url); ?>", {method: "POST", headers: {"Content-Type": "application/x-www-form-urlencoded"},
body: "action=lmp_deactivate&license_id=" + btn.dataset.licenseId + "&activation_id=" + btn.dataset.activationId
 + "&_wpnonce=<?php echo esc_js($deactivate_nonce); ?>"})
.then(function (r) { return r.json(); }).then(function (d) {
if (d.success) { location.reload(); } else { alert(d.data || "Deactivation failed."); }
}); }); });</script>
