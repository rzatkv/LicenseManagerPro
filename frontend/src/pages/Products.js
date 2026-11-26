import React, {useState, useEffect, useCallback} from "react";
import {Link} from "react-router-dom";
import {get, getList, post, put, del} from "../utils/api";
import {formatDateTime} from "../utils/format";
import {useLanguage} from "../i18n";
import {useToast} from "../components/Toast";
import ConfirmModal from "../components/ConfirmModal";
import CopyButton from "../components/CopyButton";
import EmptyState from "../components/EmptyState";
import Pagination from "../components/Pagination";
import {useResponsivePageSize} from "../utils/responsive";
import {TableSkeleton} from "../components/Skeleton";
import Wizard from "../components/Wizard";
import Modal from "../components/Modal";
import ChipSelect from "../components/ChipSelect";
import "../styles/Products.css";

// Compact action icons (defect 3): five text buttons made the actions cell
// wider than a phone viewport; 32px icon buttons keep the cell narrow.
const ICONS = {
  view: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  edit: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.8 2.8 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>,
  test: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  licenses: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  delete: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>,
};

const ALL_CYCLES = ["monthly", "quarterly", "semiannual", "annual", "biennial", "lifetime"];
const ALL_EVENTS = ["license.created", "license.renewed", "license.revoked", "license.expiring", "license.expired", "license.validated_failed"];

const emptyForm = {
  name: "", slug: "", description: "", status: "active",
  billing_cycles: ["monthly", "annual"], webhook_url: "", webhook_events: [], webhook_secret: "",
  group_id: "", key_prefix: "", key_segments: 4, key_segment_length: 4, max_reissues: 0,
  notes: "",
};

function Products() {
  const {t, lang} = useLanguage();
  const {toast} = useToast();
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
    const pageSize = useResponsivePageSize();
    // Breakpoint change resets to page 1 (the fetch refetches via its
    // pageSize dep below).
    useEffect(() => { setPage(1); }, [pageSize]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);
  const [groupFilter, setGroupFilter] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [detailsId, setDetailsId] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [testResult, setTestResult] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [showProductWizard, setShowProductWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardForm, setWizardForm] = useState(emptyForm);
  const [wizardBusy, setWizardBusy] = useState(false);
  // Notes feature (v3.0): the notes field is shown only while the
  // product_notes_enabled setting is "on" (default on); the backend
  // rejects notes with 400 while it is off.
  const [notesEnabled, setNotesEnabled] = useState(true);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const base = groupFilter ? `/products?group_id=${groupFilter}` : "/products";
      const {items, total: t} = await getList(base, {skip: (page - 1) * pageSize, limit: pageSize});
      setProducts(items);
      setTotal(t);
    } catch (err) {
      toast.error(err.message || t("common.failedFetch"));
      setProducts([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, groupFilter, toast, t]);

  const fetchGroups = useCallback(async () => {
    try {
      const data = await get("/product-groups");
      setGroups(Array.isArray(data) ? data : []);
    } catch (err) {
      setGroups([]);
    }
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);
  useEffect(() => { fetchGroups(); }, [fetchGroups]);
  useEffect(() => {
    (async () => {
      try {
        const data = await get("/settings");
        setNotesEnabled(data.product_notes_enabled !== "off");
      } catch (err) { /* default (on) stays */ }
    })();
  }, []);

  const fetchDeliveries = useCallback(async (productId) => {
    try {
      const data = await get(`/webhooks/deliveries?product_id=${productId}&limit=50`);
      setDeliveries(Array.isArray(data) ? data : []);
    } catch (err) {
      setDeliveries([]);
    }
  }, []);

  useEffect(() => {
    if (detailsId) fetchDeliveries(detailsId);
  }, [detailsId, fetchDeliveries]);

  const detailsProduct = products.find((p) => p.id === detailsId) || null;

  const groupName = (id) => {
    if (!id) return t("products.noGroup");
    const g = groups.find((x) => x.id === id);
    return g ? g.name : `#${id}`;
  };

  const toggleIn = (field, value, state, setState) => {
    setState((prev) => ({
      ...prev,
      [field]: prev[field].includes(value) ? prev[field].filter((v) => v !== value) : [...prev[field], value],
    }));
  };

  const handleEdit = (p) => {
    setEditingId(p.id);
    setForm({
      name: p.name, slug: p.slug || "", description: p.description || "",
      status: p.status || "active",
      billing_cycles: p.billing_cycles || [], webhook_url: p.webhook_url || "",
      webhook_events: p.webhook_events || [], webhook_secret: p.webhook_secret || "",
      group_id: p.group_id ? String(p.group_id) : "",
      key_prefix: p.key_prefix || "", key_segments: p.key_segments ?? 4,
      key_segment_length: p.key_segment_length ?? 4, max_reissues: p.max_reissues ?? 0,
      notes: p.notes || "",
    });
    setTestResult(null);
  };

  const resetForm = () => { setForm(emptyForm); setEditingId(null); setTestResult(null); };

  const productPayload = (f) => ({
    name: f.name,
    slug: f.slug || undefined,
    description: f.description || undefined,
    status: f.status,
    billing_cycles: f.billing_cycles,
    webhook_url: f.webhook_url || undefined,
    webhook_events: f.webhook_events,
    webhook_secret: f.webhook_secret || undefined,
    group_id: f.group_id ? Number(f.group_id) : null,
    key_prefix: f.key_prefix || null,
    key_segments: Number(f.key_segments) || 4,
    key_segment_length: Number(f.key_segment_length) || 4,
    max_reissues: Number(f.max_reissues) || 0,
    // Notes are sent only while the feature is on: with it off the
    // field is hidden, and a stale prefilled value would 400 the save.
    ...(notesEnabled ? {notes: f.notes || undefined} : {}),
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const updated = await put(`/products/${editingId}`, productPayload(form));
      setProducts(products.map((p) => (p.id === editingId ? updated : p)));
      toast.success(t("products.updated"));
      resetForm();
    } catch (err) {
      toast.error(err.message || t("common.error"));
    }
  };

  const handleWizardCreate = async () => {
    if (!wizardForm.name.trim()) { toast.error(t("wizard.nameRequired")); return; }
    if (wizardForm.billing_cycles.length === 0) { toast.error(t("wizard.noCycles")); return; }
    setWizardBusy(true);
    try {
      const created = await post("/products", productPayload(wizardForm));
      if (page === 1) setProducts([...products, created].slice(0, pageSize));
      setTotal((prev) => prev + 1);
      toast.success(t("products.created"));
      setWizardForm(emptyForm);
      setWizardStep(0);
      setShowProductWizard(false);
    } catch (err) {
      toast.error(err.message || t("common.error"));
    } finally {
      setWizardBusy(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await del(`/products/${id}`);
      setProducts(products.filter((p) => p.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
      if (detailsId === id) { setDetailsId(null); setDeliveries([]); }
      toast.success(t("products.deleted"));
    } catch (err) {
      toast.error(err.message || t("common.error"));
    }
  };

  const handleTestWebhook = async (id) => {
    try {
      const result = await post(`/products/${id}/test-webhook`, {});
      setTestResult({id, ...result});
      fetchDeliveries(id);
      toast.success(t("common.success"));
    } catch (err) {
      setTestResult({id, success: false, status_code: null, error: err.message});
      toast.error(err.message || t("common.error"));
    }
  };

  // Client-side search over the loaded page (name / slug).
  const visible = products.filter((p) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (p.name || "").toLowerCase().includes(q) || (p.slug || "").toLowerCase().includes(q);
  });

  const wizardCanNext =
    wizardStep === 0 ? wizardForm.name.trim().length > 0
    : wizardStep === 1 ? wizardForm.billing_cycles.length > 0
    : true;

  const reviewRows = [
    [t("products.name"), wizardForm.name],
    [t("products.slug"), wizardForm.slug || "-"],
    [t("products.description"), wizardForm.description || "-"],
    [t("products.group"), groupName(wizardForm.group_id ? Number(wizardForm.group_id) : null)],
    [t("products.cycles"), wizardForm.billing_cycles.map((c) => t(`cycle.${c}`)).join(", ")],
    [t("products.keyFormat"), wizardForm.key_prefix ? `${wizardForm.key_prefix}-XXXX × ${wizardForm.key_segments}` : t("products.notConfigured")],
    [t("products.maxReissues"), String(wizardForm.max_reissues || 0)],
    [t("products.webhookUrl"), wizardForm.webhook_url || t("products.notConfigured")],
    [t("products.webhookEvents"), wizardForm.webhook_events.length ? wizardForm.webhook_events.join(", ") : "-"],
    ...(notesEnabled ? [[t("products.notes"), wizardForm.notes || "-"]] : []),
  ];

  return (
    <div className="products-container page-enter">
      <h1 className="gradient-text">{t("products.title")}</h1>

      <div className="toolbar">
        <button onClick={() => { setShowProductWizard(true); setWizardStep(0); }}>{t("products.create")}</button>
        <Link className="btn-ghost" to="/product-groups">{t("groups.manage")}</Link>
      </div>

      {showProductWizard && (
        <Wizard
          title={t("products.create")}
          steps={[t("wizard.basics"), t("wizard.cycles"), t("wizard.webhook"), t("wizard.review")]}
          step={wizardStep}
          onStepChange={setWizardStep}
          canNext={wizardCanNext}
          onSubmit={handleWizardCreate}
          submitting={wizardBusy}
          onCancel={() => { setShowProductWizard(false); setWizardStep(0); setWizardForm(emptyForm); }}
        >
          {wizardStep === 0 && (
            <>
              <div className="form-row">
                <input type="text" placeholder={t("products.name")} value={wizardForm.name} onChange={(e) => setWizardForm({...wizardForm, name: e.target.value})} required />
                <input type="text" placeholder={t("products.slug")} value={wizardForm.slug} onChange={(e) => setWizardForm({...wizardForm, slug: e.target.value})} />
              </div>
              <input type="text" placeholder={t("products.description")} value={wizardForm.description} onChange={(e) => setWizardForm({...wizardForm, description: e.target.value})} />
              {notesEnabled && (
                <textarea placeholder={t("products.notes")} value={wizardForm.notes} onChange={(e) => setWizardForm({...wizardForm, notes: e.target.value})} rows={3} />
              )}
              <div className="form-row">
                <select value={wizardForm.status} onChange={(e) => setWizardForm({...wizardForm, status: e.target.value})}>
                  <option value="active">{t("common.active")}</option>
                  <option value="inactive">{t("common.inactive")}</option>
                </select>
                <select value={wizardForm.group_id} onChange={(e) => setWizardForm({...wizardForm, group_id: e.target.value})} aria-label={t("products.group")}>
                  <option value="">{t("products.noGroup")}</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <p className="hint">{t("products.slugHint")}</p>
              <h4>{t("products.keyFormat")}</h4>
              <div className="form-row">
                <input type="text" placeholder={t("products.keyPrefix")} value={wizardForm.key_prefix} onChange={(e) => setWizardForm({...wizardForm, key_prefix: e.target.value})} />
                <input type="number" min="1" max="8" placeholder={t("products.keySegments")} value={wizardForm.key_segments} onChange={(e) => setWizardForm({...wizardForm, key_segments: e.target.value})} />
                <input type="number" min="2" max="8" placeholder={t("products.keySegmentLength")} value={wizardForm.key_segment_length} onChange={(e) => setWizardForm({...wizardForm, key_segment_length: e.target.value})} />
                <input type="number" min="0" placeholder={t("products.maxReissues")} value={wizardForm.max_reissues} onChange={(e) => setWizardForm({...wizardForm, max_reissues: e.target.value})} />
              </div>
            </>
          )}
          {wizardStep === 1 && (
            <div className="check-field">
              <div className="check-field-title">{t("products.cycles")}</div>
              <ChipSelect
                ariaLabel={t("products.cycles")}
                options={ALL_CYCLES.map((c) => ({value: c, label: t(`cycle.${c}`)}))}
                selected={wizardForm.billing_cycles}
                onToggle={(c) => toggleIn("billing_cycles", c, wizardForm, setWizardForm)}
              />
            </div>
          )}
          {wizardStep === 2 && (
            <>
              <input type="url" placeholder={t("products.webhookUrl")} value={wizardForm.webhook_url} onChange={(e) => setWizardForm({...wizardForm, webhook_url: e.target.value})} />
              <div className="check-field">
                <div className="check-field-title">{t("products.webhookEvents")}</div>
                <ChipSelect
                  ariaLabel={t("products.webhookEvents")}
                  options={ALL_EVENTS}
                  selected={wizardForm.webhook_events}
                  onToggle={(ev) => toggleIn("webhook_events", ev, wizardForm, setWizardForm)}
                />
              </div>
              <input type="text" placeholder={t("products.webhookSecret")} value={wizardForm.webhook_secret} onChange={(e) => setWizardForm({...wizardForm, webhook_secret: e.target.value})} />
            </>
          )}
          {wizardStep === 3 && (
            <div className="wizard-review">
              {reviewRows.map(([label, value]) => (
                <div key={label} className="wizard-review-row"><strong>{label}</strong><span>{value}</span></div>
              ))}
            </div>
          )}
        </Wizard>
      )}

      <Modal open={editingId !== null} title={editingId !== null ? `${t("products.edit")} #${editingId}` : ""} onClose={resetForm}>
        <form className="product-form" onSubmit={handleSubmit}>
          <div className="form-row">
            <input type="text" placeholder={t("products.name")} value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} required />
            <input type="text" placeholder={t("products.slug")} value={form.slug} onChange={(e) => setForm({...form, slug: e.target.value})} />
          </div>
          <input type="text" placeholder={t("products.description")} value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} />
          {notesEnabled && (
            <textarea placeholder={t("products.notes")} value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})} rows={3} />
          )}
          <div className="form-row">
            <select value={form.status} onChange={(e) => setForm({...form, status: e.target.value})}>
              <option value="active">{t("common.active")}</option>
              <option value="inactive">{t("common.inactive")}</option>
            </select>
            <select value={form.group_id} onChange={(e) => setForm({...form, group_id: e.target.value})} aria-label={t("products.group")}>
              <option value="">{t("products.noGroup")}</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className="form-row">
            <input type="text" placeholder={t("products.keyPrefix")} value={form.key_prefix} onChange={(e) => setForm({...form, key_prefix: e.target.value})} />
            <input type="number" min="1" max="8" placeholder={t("products.keySegments")} value={form.key_segments} onChange={(e) => setForm({...form, key_segments: e.target.value})} />
            <input type="number" min="2" max="8" placeholder={t("products.keySegmentLength")} value={form.key_segment_length} onChange={(e) => setForm({...form, key_segment_length: e.target.value})} />
            <input type="number" min="0" placeholder={t("products.maxReissues")} value={form.max_reissues} onChange={(e) => setForm({...form, max_reissues: e.target.value})} />
          </div>
          <div className="check-field">
            <div className="check-field-title">{t("products.cycles")}</div>
            <ChipSelect
              ariaLabel={t("products.cycles")}
              options={ALL_CYCLES.map((c) => ({value: c, label: t(`cycle.${c}`)}))}
              selected={form.billing_cycles}
              onToggle={(c) => toggleIn("billing_cycles", c, form, setForm)}
            />
          </div>
          <input type="url" placeholder={t("products.webhookUrl")} value={form.webhook_url} onChange={(e) => setForm({...form, webhook_url: e.target.value})} />
          <div className="check-field">
            <div className="check-field-title">{t("products.webhookEvents")}</div>
            <ChipSelect
              ariaLabel={t("products.webhookEvents")}
              options={ALL_EVENTS}
              selected={form.webhook_events}
              onToggle={(ev) => toggleIn("webhook_events", ev, form, setForm)}
            />
          </div>
          <input type="text" placeholder={t("products.webhookSecret")} value={form.webhook_secret} onChange={(e) => setForm({...form, webhook_secret: e.target.value})} />
          <div className="form-row">
            <button type="submit">{t("common.save")}</button>
            <button type="button" className="btn-ghost" onClick={resetForm}>{t("common.cancel")}</button>
          </div>
          <p className="hint">{t("products.slugHint")}</p>
        </form>
      </Modal>

      <div className="toolbar">
        <div className="filter-container">
          <label htmlFor="group-filter">{t("products.group")}:</label>
          <select id="group-filter" value={groupFilter} onChange={(e) => { setGroupFilter(e.target.value); setPage(1); }}>
            <option value="">{t("groups.selectGroup")}</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div className="search-wrap">
          <span className="search-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          </span>
          <input type="text" className="search-input" placeholder={t("products.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {loading ? (
        <TableSkeleton rows={4} />
      ) : visible.length === 0 ? (
        <EmptyState title={t("products.noProducts")} text={search ? t("common.noResults") : undefined} />
      ) : (
        <>
        <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t("products.name")}</th>
              <th className="col-slug">{t("products.slug")}</th>
              <th className="col-group">{t("products.group")}</th>
              <th className="col-cycles">{t("products.cycles")}</th>
              <th>{t("products.status")}</th>
              <th className="col-webhook">{t("products.webhook")}</th>
              <th className="col-count">{t("products.licenseCount")}</th>
              <th>{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p, i) => (
              <tr key={p.id} className="stagger-item" style={{animationDelay: `${i * 40}ms`}}>
                <td className="cell-ellipsis cell-name">{p.name}</td>
                <td className="cell-ellipsis cell-slug col-slug">{p.slug}</td>
                <td className="col-group">{groupName(p.group_id)}</td>
                <td className="col-cycles"><span className="cycle-chips">{(p.billing_cycles || []).map((c) => <span key={c} className="badge badge-sm">{t(`cycle.${c}`)}</span>)}</span></td>
                <td>{p.status === "active" ? t("common.active") : t("common.inactive")}</td>
                <td className="col-webhook">
                  {p.webhook_url ? (<>{t("products.webhookConfigured")} <CopyButton text={p.webhook_url} /></>) : t("products.notConfigured")}
                </td>
                <td className="col-count">{p.license_count ?? "-"}</td>
                <td>
                  <div className="row-actions">
                    <button className="view-btn icon-btn" title={t("common.view")} aria-label={t("common.view")} onClick={() => setDetailsId(p.id)}>{ICONS.view}</button>
                    <button className="edit-btn icon-btn row-action-extra" title={t("common.edit")} aria-label={t("common.edit")} onClick={() => handleEdit(p)}>{ICONS.edit}</button>
                    {p.webhook_url && <button className="icon-btn row-action-extra" title={t("products.testWebhook")} aria-label={t("products.testWebhook")} onClick={() => handleTestWebhook(p.id)}>{ICONS.test}</button>}
                    <Link className="icon-btn row-action-extra" title={t("products.viewLicenses")} aria-label={t("products.viewLicenses")} to={`/licenses?product=${p.id}`}>{ICONS.licenses}</Link>
                    <button className="delete-btn icon-btn row-action-extra" title={t("common.delete")} aria-label={t("common.delete")} onClick={() => setPendingDelete(p.id)}>{ICONS.delete}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />
        </>
      )}

      {testResult && (
        <p className="validate-result">
          {t("products.testResult")}: {testResult.success ? `${t("common.success")} (HTTP ${testResult.status_code})` : (testResult.error || t("common.error"))}
        </p>
      )}

      <Modal open={!!detailsProduct} title={detailsProduct ? detailsProduct.name : ""} onClose={() => setDetailsId(null)}>
        {detailsProduct && (<>
          <div className="detail-row"><strong>{t("products.slug")}</strong><span>{detailsProduct.slug || "-"}</span></div>
          <div className="detail-row"><strong>{t("products.group")}</strong><span>{groupName(detailsProduct.group_id)}</span></div>
          <div className="detail-row"><strong>{t("products.description")}</strong><span>{detailsProduct.description || "-"}</span></div>
          {notesEnabled && detailsProduct.notes && <div className="detail-row"><strong>{t("products.notes")}</strong><span>{detailsProduct.notes}</span></div>}
          <div className="detail-row"><strong>{t("products.cycles")}</strong><span className="detail-chips">{(detailsProduct.billing_cycles || []).map((c) => <span key={c} className="badge badge-sm">{t(`cycle.${c}`)}</span>)}</span></div>
          <div className="detail-row"><strong>{t("products.status")}</strong><span>{detailsProduct.status === "active" ? t("common.active") : t("common.inactive")}</span></div>
          <div className="detail-row"><strong>{t("products.webhookUrl")}</strong><span>{detailsProduct.webhook_url || t("products.notConfigured")}</span></div>
          <div className="detail-row"><strong>{t("products.webhookEvents")}</strong><span>{(detailsProduct.webhook_events || []).join(", ") || "-"}</span></div>
          <div className="detail-row"><strong>{t("products.licenseCount")}</strong><span>{detailsProduct.license_count ?? "-"}</span></div>
          <div className="detail-row"><strong>{t("products.keyFormat")}</strong><span>{detailsProduct.key_prefix ? `${detailsProduct.key_prefix}-XXXX × ${detailsProduct.key_segments}` : t("products.notConfigured")}</span></div>
          {/* Row actions live here on phones (the table row shows only the
              eye button below 640px — split, don't squeeze): edit, test,
              view-licenses and delete are one tap away in this popup. */}
          <div className="row-actions modal-actions">
            <button onClick={() => { setDetailsId(null); handleEdit(detailsProduct); }}>{t("common.edit")}</button>
            {detailsProduct.webhook_url && <button onClick={() => handleTestWebhook(detailsProduct.id)}>{t("products.testWebhook")}</button>}
            <Link className="btn-ghost" to={`/licenses?product=${detailsProduct.id}`}>{t("products.viewLicenses")}</Link>
            <button className="btn-danger" onClick={() => { setDetailsId(null); setPendingDelete(detailsProduct.id); }}>{t("common.delete")}</button>
          </div>
          {testResult && testResult.id === detailsProduct.id && (
            <p className="validate-result">
              {t("products.testResult")}: {testResult.success ? `${t("common.success")} (HTTP ${testResult.status_code})` : (testResult.error || t("common.error"))}
            </p>
          )}
          <h4>{t("products.deliveries")}</h4>
          {deliveries.length === 0 ? (
            <p className="dashboard-empty">{t("products.noDeliveries")}</p>
          ) : (
            <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("products.event")}</th>
                  <th>{t("products.url")}</th>
                  <th>{t("products.response")}</th>
                  <th>{t("products.deliveredAt")}</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id}>
                    <td>{d.event}</td>
                    <td>{d.url}</td>
                    <td>{d.success ? `HTTP ${d.status_code}` : `HTTP ${d.status_code ?? "-"}`}</td>
                    <td className="nowrap">{formatDateTime(d.created_at, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
          </>)}
        </Modal>
      <ConfirmModal
        open={pendingDelete !== null}
        message={t("common.confirmDelete")}
        onConfirm={() => { const id = pendingDelete; setPendingDelete(null); handleDelete(id); }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

export default Products;
