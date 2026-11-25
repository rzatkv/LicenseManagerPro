{* License Manager Pro — customer "My licenses" page. *}
{extends file='page.tpl'}

{block name='page_content'}
<style>
  .lmp-hero {
    background: linear-gradient(120deg, #C1165E 0%, #8B3FD9 55%, #6D5DF6 100%);
    border-radius: 12px; color: #fff; padding: 22px 26px; margin-bottom: 18px;
    display: flex; align-items: center; gap: 16px;
  }
  .lmp-hero h1 { color: #fff; font-size: 20px; margin: 0 0 4px; }
  .lmp-hero p { color: rgba(255,255,255,.85); margin: 0; font-size: 13px; }
  .lmp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
  .lmp-card {
    background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px;
  }
  .lmp-card h3 { font-size: 16px; margin: 0 0 10px; }
  .lmp-pill {
    display: inline-block; border-radius: 999px; padding: 2px 10px;
    font-size: 12px; font-weight: 600; text-transform: capitalize;
  }
  .lmp-pill.active { background: #dcfce7; color: #166534; }
  .lmp-pill.suspended { background: #fef3c7; color: #92400e; }
  .lmp-pill.revoked, .lmp-pill.expired { background: #fee2e2; color: #991b1b; }
  .lmp-key {
    display: flex; align-items: center; gap: 8px; background: #f9fafb;
    border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 10px;
    font-family: ui-monospace, monospace; font-size: 13px; word-break: break-all; margin: 10px 0;
  }
  .lmp-key button {
    flex: 0 0 auto; border: 1px solid #d1d5db; background: #fff; border-radius: 6px;
    padding: 4px 10px; font-size: 12px; cursor: pointer;
  }
  .lmp-meta { color: #6b7280; font-size: 13px; margin: 4px 0; }
  .lmp-empty { color: #6b7280; }
</style>

<div class="lmp-hero">
  <svg width="40" height="40" viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <circle cx="24" cy="24" r="22" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.55)" stroke-width="2"/>
    <circle cx="19" cy="19" r="7" fill="none" stroke="#fff" stroke-width="3"/>
    <path d="M24 24 L33 33" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
    <path d="M30 30 L36 30 M33 33 L33 39" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
  </svg>
  <div>
    <h1>{l s='My licenses' mod='licensemanagerpro'}</h1>
    <p>{l s='Licenses issued for' mod='licensemanagerpro'} {$lmp_customer_email|escape:'html':'UTF-8'}</p>
  </div>
</div>

{if $lmp_error}
  <div class="alert alert-warning" role="alert">{$lmp_error|escape:'html':'UTF-8'}</div>
{/if}

{if $lmp_licenses}
  <div class="lmp-grid">
    {foreach from=$lmp_licenses item=license}
      <article class="lmp-card">
        <h3>{if $license->productName}{$license->productName|escape:'html':'UTF-8'}{else}{l s='License' mod='licensemanagerpro'}{/if}</h3>
        <span class="lmp-pill {$license->status|escape:'html':'UTF-8'}">{$license->status|escape:'html':'UTF-8'}</span>
        <div class="lmp-key">
          <span class="lmp-key-text">{$license->licenseKey|escape:'html':'UTF-8'}</span>
          <button type="button" class="lmp-copy" data-key="{$license->licenseKey|escape:'html':'UTF-8'}">{l s='Copy' mod='licensemanagerpro'}</button>
        </div>
        {if $license->billingCycle}
          <p class="lmp-meta">{l s='Billing cycle:' mod='licensemanagerpro'} {$license->billingCycle|escape:'html':'UTF-8'}</p>
        {/if}
        {if $license->expiresAt}
          <p class="lmp-meta">{l s='Expires:' mod='licensemanagerpro'} {$license->expiresAt|escape:'html':'UTF-8'|date_format:'%Y-%m-%d'}</p>
        {/if}
        {if $license->createdAt}
          <p class="lmp-meta">{l s='Issued:' mod='licensemanagerpro'} {$license->createdAt|escape:'html':'UTF-8'|date_format:'%Y-%m-%d'}</p>
        {/if}
      </article>
    {/foreach}
  </div>
{elseif !$lmp_error}
  <p class="lmp-empty">{l s='You do not have any licenses yet. Licenses are issued automatically when your order is paid.' mod='licensemanagerpro'}</p>
{/if}

<script>
  document.querySelectorAll('.lmp-copy').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.getAttribute('data-key') || '';
      var done = function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy'; }, 1500); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(key).then(done, done);
      } else {
        var ta = document.createElement('textarea');
        ta.value = key;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(ta);
        done();
      }
    });
  });
</script>
{/block}
