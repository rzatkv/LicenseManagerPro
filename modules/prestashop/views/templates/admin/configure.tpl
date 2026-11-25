{* License Manager Pro — admin configuration header + product mapping. *}
<style>
  .lmp-wrap { font-family: inherit; }
  .lmp-hero {
    background: linear-gradient(120deg, #C1165E 0%, #8B3FD9 55%, #6D5DF6 100%);
    border-radius: 12px; color: #fff; padding: 22px 26px; margin-bottom: 18px;
    display: flex; align-items: center; gap: 18px;
  }
  .lmp-hero svg { flex: 0 0 auto; }
  .lmp-hero h1 { color: #fff; font-size: 22px; margin: 0 0 4px; font-weight: 700; }
  .lmp-hero p { color: rgba(255,255,255,.85); margin: 0; font-size: 13px; }
  .lmp-hero .lmp-version {
    margin-left: auto; background: rgba(255,255,255,.18); border: 1px solid rgba(255,255,255,.35);
    border-radius: 999px; padding: 4px 12px; font-size: 12px; white-space: nowrap;
  }
  .lmp-card {
    background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
    padding: 18px 20px; margin-bottom: 18px;
  }
  .lmp-card h2 { font-size: 16px; margin: 0 0 6px; }
  .lmp-card p.lmp-hint { color: #6b7280; font-size: 13px; margin: 0 0 14px; }
  .lmp-status { display: inline-flex; align-items: center; gap: 8px; font-weight: 600; font-size: 13px; }
  .lmp-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
  .lmp-dot.ok { background: #16a34a; }
  .lmp-dot.bad { background: #dc2626; }
  .lmp-form-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; }
  .lmp-field { display: flex; flex-direction: column; gap: 4px; min-width: 180px; flex: 1; }
  .lmp-field label { font-weight: 600; font-size: 13px; }
  .lmp-field select, .lmp-field input[type="text"] {
    border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 10px; font-size: 13px; width: 100%;
  }
  .lmp-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .lmp-table th, .lmp-table td { text-align: left; padding: 9px 10px; border-bottom: 1px solid #e5e7eb; }
  .lmp-table th { color: #6b7280; font-weight: 600; }
  .lmp-pill {
    display: inline-block; background: #f3e8ff; color: #6d28d9;
    border-radius: 999px; padding: 2px 10px; font-size: 12px; font-weight: 600;
  }
  .lmp-empty { color: #6b7280; font-size: 13px; }
</style>

<div class="lmp-wrap">
  <div class="lmp-hero">
    <svg width="44" height="44" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <circle cx="24" cy="24" r="22" fill="rgba(255,255,255,0.16)" stroke="rgba(255,255,255,0.55)" stroke-width="2"/>
      <circle cx="19" cy="19" r="7" fill="none" stroke="#fff" stroke-width="3"/>
      <path d="M24 24 L33 33" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
      <path d="M30 30 L36 30 M33 33 L33 39" stroke="#fff" stroke-width="3" stroke-linecap="round"/>
    </svg>
    <div>
      <h1>License Manager Pro</h1>
      <p>{l s='Issue and manage software licenses from your PrestaShop store.' mod='licensemanagerpro'}</p>
    </div>
    <span class="lmp-version">v{$lmp_module_version|escape:'html':'UTF-8'}</span>
  </div>

  <div class="lmp-card">
    <h2>{l s='Connection' mod='licensemanagerpro'}</h2>
    <p class="lmp-hint">
      {if $lmp_configured}
        {l s='Connected to' mod='licensemanagerpro'} {$lmp_api_url|escape:'html':'UTF-8'}
        {if $lmp_signed_enabled} — {l s='signed (HMAC) requests enabled' mod='licensemanagerpro'}{/if}
      {else}
        {l s='Not configured yet. Save the API URL and module API key below.' mod='licensemanagerpro'}
      {/if}
    </p>
    <form method="post" action="{$lmp_admin_link|escape:'html':'UTF-8'}">
      <input type="hidden" name="token" value="{$lmp_token|escape:'html':'UTF-8'}">
      <button type="submit" name="submitLmpTestConnection" class="btn btn-default">
        {l s='Test connection' mod='licensemanagerpro'}
      </button>
    </form>
  </div>

  <div class="lmp-card">
    <h2>{l s='Product mapping' mod='licensemanagerpro'}</h2>
    <p class="lmp-hint">
      {l s='Map each PrestaShop product to a License Manager Pro product. When an order with a mapped product reaches a paid or shipped status, a license is minted for the customer. PrestaShop has no native subscription cycle, so the billing cycle below is the one sent to the backend — choose the cycle that matches how the product is sold.' mod='licensemanagerpro'}
    </p>

    <form method="post" action="{$lmp_admin_link|escape:'html':'UTF-8'}">
      <input type="hidden" name="token" value="{$lmp_token|escape:'html':'UTF-8'}">
      <div class="lmp-form-row">
        <div class="lmp-field">
          <label for="lmp_ps_product_id">{l s='PrestaShop product' mod='licensemanagerpro'}</label>
          <select name="lmp_ps_product_id" id="lmp_ps_product_id">
            {foreach from=$lmp_shop_products item=sp}
              <option value="{$sp.id_product|escape:'html':'UTF-8'}">{$sp.name|escape:'html':'UTF-8'}</option>
            {/foreach}
          </select>
        </div>
        <div class="lmp-field">
          <label for="lmp_slug">{l s='License Manager Pro product' mod='licensemanagerpro'}</label>
          {if $lmp_products}
            <select name="lmp_slug" id="lmp_slug">
              {foreach from=$lmp_products item=lp}
                <option value="{$lp.slug|escape:'html':'UTF-8'}">{$lp.name|escape:'html':'UTF-8'} ({$lp.slug|escape:'html':'UTF-8'})</option>
              {/foreach}
            </select>
          {else}
            <input type="text" name="lmp_slug" id="lmp_slug" placeholder="product-slug">
            {if $lmp_products_error}
              <span class="lmp-empty">{l s='Could not load the product list from the backend:' mod='licensemanagerpro'} {$lmp_products_error|escape:'html':'UTF-8'}</span>
            {/if}
          {/if}
        </div>
        <div class="lmp-field">
          <label for="lmp_cycle">{l s='Billing cycle' mod='licensemanagerpro'}</label>
          <select name="lmp_cycle" id="lmp_cycle">
            <option value="">{l s='Backend default' mod='licensemanagerpro'}</option>
            {foreach from=$lmp_cycles item=cycle}
              <option value="{$cycle|escape:'html':'UTF-8'}">{$cycle|escape:'html':'UTF-8'}</option>
            {/foreach}
          </select>
        </div>
        <button type="submit" name="submitLmpMappingAdd" class="btn btn-primary">
          {l s='Add mapping' mod='licensemanagerpro'}
        </button>
      </div>
    </form>

    {if $lmp_mapping_rows}
      <table class="lmp-table" style="margin-top:16px">
        <thead>
          <tr>
            <th>{l s='PrestaShop product' mod='licensemanagerpro'}</th>
            <th>{l s='LMP product slug' mod='licensemanagerpro'}</th>
            <th>{l s='Billing cycle' mod='licensemanagerpro'}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {foreach from=$lmp_mapping_rows item=row}
            <tr>
              <td>{$row.product_name|escape:'html':'UTF-8'}</td>
              <td><span class="lmp-pill">{$row.slug|escape:'html':'UTF-8'}</span></td>
              <td>{if $row.cycle}{$row.cycle|escape:'html':'UTF-8'}{else}{l s='Backend default' mod='licensemanagerpro'}{/if}</td>
              <td>
                <form method="post" action="{$lmp_admin_link|escape:'html':'UTF-8'}" style="display:inline">
                  <input type="hidden" name="token" value="{$lmp_token|escape:'html':'UTF-8'}">
                  <input type="hidden" name="lmp_delete_product_id" value="{$row.product_id|escape:'html':'UTF-8'}">
                  <button type="submit" name="submitLmpMappingDelete" class="btn btn-default btn-sm">
                    {l s='Remove' mod='licensemanagerpro'}
                  </button>
                </form>
              </td>
            </tr>
          {/foreach}
        </tbody>
      </table>
    {else}
      <p class="lmp-empty" style="margin-top:16px">{l s='No products mapped yet.' mod='licensemanagerpro'}</p>
    {/if}
  </div>
</div>
