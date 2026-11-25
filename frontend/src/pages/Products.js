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
import {TableSkeleton} from "../components/Skeleton";
import Wizard from "../components/Wizard";
import "../styles/Products.css";

const ALL_CYCLES = ["monthly", "quarterly", "semiannual", "annual", "biennial", "lifetime"];
const ALL_EVENTS = ["license.created", "license.renewed", "license.revoked", "license.expiring", "license.expired", "license.validated_failed"];
const PAGE_SIZE = 10;

const emptyForm = {
  name: "", slug: "", description: "", price: "", currency: "USD", status: "active",
  billing_cycles: ["monthly", "annual"], webhook_url: "", webhook_events: [], webhook_secret: "",
  group_id: "", key_prefix: "", key_segments: 4, key_segment_length: 4, max_reissues: 0,
};

const emptyGroupForm = {name: "", slug: "", description: "", color: "#7B6CFF", sort_order: 0};

function Products() {
  const {t, lang} = useLanguage();
  const {toast} = useToast();
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState([]);
  const [groupFilter, setGroupFilter] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [testResult, setTestResult] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [showProductWizard, setShowProductWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [wizardForm, setWizardForm] = useState(emptyForm);
  const [wizardBusy, setWizardBusy] = useState(false);
  const [showGroups, setShowGroups] = useState(false);
  const [showGroupWizard, setShowGroupWizard] = useState(false);
  const [groupStep, setGroupStep] = useState(0);
  const [groupForm, setGroupForm] = useState(emptyGroupForm);
  const [groupBusy, setGroupBusy] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [pendingGroupDelete, setPendingGroupDelete] = useState(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const base = groupFilter ? `/products?group_id=${groupFilter}` : "/products";
      const {items, total: t} = await getList(base, {skip: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE});
      setProducts(items);
      setTotal(t);
    } catch (err) {
      toast.error(err.message || t("common.failedFetch"));
      setProducts([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, groupFilter, toast, t]);

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

  const fetchDeliveries = useCallback(async (productId) => {
    try {
      const data = await get(`/webhooks/deliveries?product_id=${productId}&limit=50`);
      setDeliveries(Array.isArray(data) ? data : []);
    } catch (err) {
      setDeliveries([]);
    }
  }, []);

  useEffect(() => {
    if (selectedId) fetchDeliveries(selectedId);
  }, [selectedId, fetchDeliveries]);

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
      price: String(p.price ?? ""), currency: p.currency || "USD", status: p.status || "active",
      billing_cycles: p.billing_cycles || [], webhook_url: p.webhook_url || "",
      webhook_events: p.webhook_events || [], webhook_secret: p.webhook_secret || "",
      group_id: p.group_id ? String(p.group_id) : "",
      key_prefix: p.key_prefix || "", key_segments: p.key_segments ?? 4,
      key_segment_length: p.key_segment_length ?? 4, max_reissues: p.max_reissues ?? 0,
    });
    setTestResult(null);
  };

  const resetForm = () => { setForm(emptyForm); setEditingId(null); setTestResult(null); };

  const productPayload = (f) => ({
    name: f.name,
    slug: f.slug || undefined,
    description: f.description || undefined,
    price: Number(f.price) || 0,
    currency: f.currency || "USD",
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
      if (page === 1) setProducts([...products, created].slice(0, PAGE_SIZE));
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

  const handleGroupWizardCreate = async () => {
    if (!groupForm.name.trim()) { toast.error(t("wizard.nameRequired")); return; }
    setGroupBusy(true);
    try {
      const payload = {
        name: groupForm.name.trim(),
        slug: groupForm.slug.trim() || undefined,
        description: groupForm.description || undefined,
        color: groupForm.color,
        sort_order: Number(groupForm.sort_order) || 0,
      };
      let saved;
      if (editingGroupId !== null) {
        saved = await put(`/product-groups/${editingGroupId}`, payload);
        setGroups(groups.map((g) => (g.id === editingGroupId ? saved : g)));
        toast.success(t("groups.updated"));
      } else {
        saved = await post("/product-groups", payload);
        setGroups([...groups, saved]);
        toast.success(t("groups.created"));
      }
      setGroupForm(emptyGroupForm);
      setGroupStep(0);
      setEditingGroupId(null);
      setShowGroupWizard(false);
    } catch (err) {
      toast.error(err.message || t("common.error"));
    } finally {
      setGroupBusy(false);
    }
  };

  const handleGroupDelete = async (id) => {
    try {
      await del(`/product-groups/${id}`);
      setGroups(groups.filter((g) => g.id !== id));
      toast.success(t("groups.deleted"));
    } catch (err) {
      toast.error(err.message || t("common.error"));
    }
  };

  const handleDelete = async (id) => {
    try {
      await del(`/products/${id}`);
      setProducts(products.filter((p) => p.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
      if (selectedId === id) { setSelectedId(null); setDeliveries([]); }
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
    [t("products.price"), `${wizardForm.price || 0} ${wizardForm.currency}`],
    [t("products.group"), groupName(wizardForm.group_id ? Number(wizardForm.group_id) : null)],
    [t("products.cycles"), wizardForm.billing_cycles.map((c) => t(`cycle.${c}`)).join(", ")],
    [t("products.keyFormat"), wizardForm.key_prefix ? `${wizardForm.key_prefix}-XXXX × ${wizardForm.key_segments}` : t("products.notConfigured")],
    [t("products.maxReissues"), String(wizardForm.max_reissues || 0)],
    [t("products.webhookUrl"), wizardForm.webhook_url || t("products.notConfigured")],
    [t("products.webhookEvents"), wizardForm.webhook_events.length ? wizardForm.webhook_events.join(", ") : "-"],
  ];

  return (
    <div className="products-container page-enter">
      <h1 className="gradient-text">{t("products.title")}</h1>

      <div className="toolbar">
        <button onClick={() => { setShowProductWizard(true); setWizardStep(0); }}>{t("products.create")}</button>
        <button className="btn-ghost" onClick={() => setShowGroups((v) => !v)}>{t("groups.manage")}</button>
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
              <div className="form-row">
                <input type="number" min="0" step="0.01" placeholder={t("products.price")} value={wizardForm.price} onChange={(e) => setWizardForm({...wizardForm, price: e.target.value})} />
                <input type="text" placeholder={t("common.currency")} value={wizardForm.currency} onChange={(e) => setWizardForm({...wizardForm, currency: e.target.value})} />
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
            <fieldset>
              <legend>{t("products.cycles")}</legend>
              <div className="check-group">
                {ALL_CYCLES.map((c) => (
                  <label key={c} className="check-label">
                    <input type="checkbox" checked={wizardForm.billing_cycles.includes(c)} onChange={() => toggleIn("billing_cycles", c, wizardForm, setWizardForm)} /> {t(`cycle.${c}`)}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {wizardStep === 2 && (
            <>
              <input type="url" placeholder={t("products.webhookUrl")} value={wizardForm.webhook_url} onChange={(e) => setWizardForm({...wizardForm, webhook_url: e.target.value})} />
              <fieldset>
                <legend>{t("products.webhookEvents")}</legend>
                <div className="check-group">
                  {ALL_EVENTS.map((ev) => (
                    <label key={ev} className="check-label">
                      <input type="checkbox" checked={wizardForm.webhook_events.includes(ev)} onChange={() => toggleIn("webhook_events", ev, wizardForm, setWizardForm)} /> {ev}
                    </label>
                  ))}
                </div>
              </fieldset>
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

      {showGroups && (
        <div className="groups-card glass-card">
          <h3>{t("groups.title")}</h3>
          {groups.length === 0 ? (
            <p className="dashboard-empty">{t("groups.noGroups")}</p>
          ) : (
            <ul className="groups-list">
              {groups.map((g) => (
                <li key={g.id}>
                  <span className="group-color-dot" style={{background: g.color || "#7B6CFF"}} />
                  <span className="group-name">{g.name}</span>
                  <span className="group-slug">{g.slug}</span>
                  <span className="group-count">{products.filter((p) => p.group_id === g.id).length} {t("groups.products")}</span>
                  <span className="row-actions">
                    <button className="edit-btn" onClick={() => { setEditingGroupId(g.id); setGroupForm({name: g.name, slug: g.slug || "", description: g.description || "", color: g.color || "#7B6CFF", sort_order: g.sort_order ?? 0}); setGroupStep(0); setShowGroupWizard(true); }}>{t("common.edit")}</button>
                    <button className="delete-btn" onClick={() => setPendingGroupDelete(g.id)}>{t("common.delete")}</button>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <button onClick={() => { setEditingGroupId(null); setGroupForm(emptyGroupForm); setGroupStep(0); setShowGroupWizard(true); }}>{t("groups.create")}</button>
          {showGroupWizard && (
            <Wizard
              title={editingGroupId !== null ? t("groups.edit") : t("groups.create")}
              steps={[t("wizard.basics"), t("wizard.colorPreview")]}
              step={groupStep}
              onStepChange={setGroupStep}
              canNext={groupForm.name.trim().length > 0}
              onSubmit={handleGroupWizardCreate}
              submitting={groupBusy}
              onCancel={() => { setShowGroupWizard(false); setGroupStep(0); setEditingGroupId(null); setGroupForm(emptyGroupForm); }}
            >
              {groupStep === 0 && (
                <>
                  <div className="form-row">
                    <input type="text" placeholder={t("groups.group")} value={groupForm.name} onChange={(e) => setGroupForm({...groupForm, name: e.target.value})} required />
                    <input type="text" placeholder={t("products.slug")} value={groupForm.slug} onChange={(e) => setGroupForm({...groupForm, slug: e.target.value})} />
                  </div>
                  <input type="text" placeholder={t("common.description")} value={groupForm.description} onChange={(e) => setGroupForm({...groupForm, description: e.target.value})} />
                  <input type="number" min="0" placeholder={t("groups.sortOrder")} value={groupForm.sort_order} onChange={(e) => setGroupForm({...groupForm, sort_order: e.target.value})} />
                </>
              )}
              {groupStep === 1 && (
                <>
                  <label>{t("groups.color")}
                    <input type="color" value={groupForm.color} onChange={(e) => setGroupForm({...groupForm, color: e.target.value})} />
                  </label>
                  <p>
                    <span className="badge" style={{background: groupForm.color, color: "#fff", borderColor: groupForm.color}}>{groupForm.name || t("groups.group")}</span>
                  </p>
                </>
              )}
            </Wizard>
          )}
        </div>
      )}

      {editingId !== null && (
        <form className="product-form glass-card" onSubmit={handleSubmit}>
          <h3>{`${t("products.edit")} #${editingId}`}</h3>
          <div className="form-row">
            <input type="text" placeholder={t("products.name")} value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} required />
            <input type="text" placeholder={t("products.slug")} value={form.slug} onChange={(e) => setForm({...form, slug: e.target.value})} />
          </div>
          <input type="text" placeholder={t("products.description")} value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} />
          <div className="form-row">
            <input type="number" min="0" step="0.01" placeholder={t("products.price")} value={form.price} onChange={(e) => setForm({...form, price: e.target.value})} />
            <input type="text" placeholder={t("common.currency")} value={form.currency} onChange={(e) => setForm({...form, currency: e.target.value})} />
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
          <fieldset>
            <legend>{t("products.cycles")}</legend>
            <div className="check-group">
              {ALL_CYCLES.map((c) => (
                <label key={c} className="check-label">
                  <input type="checkbox" checked={form.billing_cycles.includes(c)} onChange={() => toggleIn("billing_cycles", c, form, setForm)} /> {t(`cycle.${c}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <input type="url" placeholder={t("products.webhookUrl")} value={form.webhook_url} onChange={(e) => setForm({...form, webhook_url: e.target.value})} />
          <fieldset>
            <legend>{t("products.webhookEvents")}</legend>
            <div className="check-group">
              {ALL_EVENTS.map((ev) => (
                <label key={ev} className="check-label">
                  <input type="checkbox" checked={form.webhook_events.includes(ev)} onChange={() => toggleIn("webhook_events", ev, form, setForm)} /> {ev}
                </label>
              ))}
            </div>
          </fieldset>
          <input type="text" placeholder={t("products.webhookSecret")} value={form.webhook_secret} onChange={(e) => setForm({...form, webhook_secret: e.target.value})} />
          <div className="form-row">
            <button type="submit">{t("common.save")}</button>
            <button type="button" className="btn-ghost" onClick={resetForm}>{t("common.cancel")}</button>
          </div>
          <p className="hint">{t("products.slugHint")}</p>
        </form>
      )}

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
              <th>{t("products.slug")}</th>
              <th>{t("products.group")}</th>
              <th>{t("products.price")}</th>
              <th>{t("products.cycles")}</th>
              <th>{t("products.status")}</th>
              <th>{t("products.webhook")}</th>
              <th>{t("products.licenseCount")}</th>
              <th>{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p, i) => (
              <tr key={p.id} className={`${selectedId === p.id ? "selected-row " : ""}stagger-item`} style={{animationDelay: `${i * 40}ms`}}>
                <td>{p.name}</td>
                <td>{p.slug}</td>
                <td>{groupName(p.group_id)}</td>
                <td className="nowrap">{p.price} {p.currency}</td>
                <td>{(p.billing_cycles || []).map((c) => <span key={c} className="badge">{t(`cycle.${c}`)}</span>)}</td>
                <td>{p.status === "active" ? t("common.active") : t("common.inactive")}</td>
                <td>
                  {p.webhook_url ? (<>{t("products.webhookConfigured")} <CopyButton text={p.webhook_url} /></>) : t("products.notConfigured")}
                </td>
                <td>{p.license_count ?? "-"}</td>
                <td>
                  <div className="row-actions">
                    <button className="view-btn" onClick={() => setSelectedId(p.id)}>{t("common.view")}</button>
                    <button className="edit-btn" onClick={() => handleEdit(p)}>{t("common.edit")}</button>
                    {p.webhook_url && <button onClick={() => handleTestWebhook(p.id)}>{t("products.testWebhook")}</button>}
                    <Link to={`/licenses?product=${p.id}`}>{t("products.viewLicenses")}</Link>
                    <button className="delete-btn" onClick={() => setPendingDelete(p.id)}>{t("common.delete")}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </>
      )}

      {testResult && (
        <p className="validate-result">
          {t("products.testResult")}: {testResult.success ? `${t("common.success")} (HTTP ${testResult.status_code})` : (testResult.error || t("common.error"))}
        </p>
      )}

      {selectedId && (
        <div className="dashboard-section">
          <h2>{t("products.deliveries")}</h2>
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
        </div>
      )}
      <ConfirmModal
        open={pendingDelete !== null}
        message={t("common.confirmDelete")}
        onConfirm={() => { const id = pendingDelete; setPendingDelete(null); handleDelete(id); }}
        onCancel={() => setPendingDelete(null)}
      />
      <ConfirmModal
        open={pendingGroupDelete !== null}
        message={t("common.confirmDelete")}
        confirmLabel={t("common.delete")}
        onConfirm={() => { const id = pendingGroupDelete; setPendingGroupDelete(null); handleGroupDelete(id); }}
        onCancel={() => setPendingGroupDelete(null)}
      />
    </div>
  );
}

export default Products;
