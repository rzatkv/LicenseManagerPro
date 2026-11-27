import React, {useState, useEffect, useCallback} from "react";
import {useSearchParams} from "react-router-dom";
import {get, getList, post, put, del} from "../utils/api";
import {formatDate} from "../utils/format";
import {useLanguage} from "../i18n";
import {useToast} from "../components/Toast";
import {useListFetch} from "../utils/useListFetch";
import ConfirmModal from "../components/ConfirmModal";
import CopyButton from "../components/CopyButton";
import EmptyState from "../components/EmptyState";
import Pagination from "../components/Pagination";
import {usePageSize} from "../utils/responsive";
import {TableSkeleton} from "../components/Skeleton";
import Wizard from "../components/Wizard";
import Modal from "../components/Modal";
import "../styles/LicenseList.css";
import {Plus} from "lucide-react";


// Compact action icons: four text buttons made the actions cell wider
// than a phone viewport and the rows ~250px tall; 32px icon buttons
// keep the cell narrow (same treatment as the Products table).
const ICONS = {
  view: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  edit: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.8 2.8 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>,
  renew: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0114.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0020.5 15"/></svg>,
  reissue: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="8" cy="15" r="4"/><path d="M10.9 12.1L21 2M15 6l3 3M18 3l3 3"/></svg>,
  delete: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>,
};

const ALL_CYCLES = ["monthly", "quarterly", "semiannual", "annual", "biennial", "lifetime"];
const LICENSE_STATUSES = ["active", "inactive", "revoked"];

function statusPill(status, t) {
    const label = t(`common.${status}`) !== `common.${status}` ? t(`common.${status}`) : status;
    return (
        <span className={`status-pill status-${status}`}>
            {status === "active" && <span className="pulse-dot" />}
            {label}
        </span>
    );
}

function LicenseList() {
    const {t, lang} = useLanguage();
    const {toast} = useToast();
    const [licenses, setLicenses] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = usePageSize("licenses");
    // Breakpoint change resets to page 1 (the fetch refetches via its
    // pageSize dep below).
    useEffect(() => { setPage(1); }, [pageSize]);
    const [products, setProducts] = useState([]);
    const [groups, setGroups] = useState([]);
    const [filter, setFilter] = useState("all");
    const [search, setSearch] = useState("");
    // `loading` comes from useListFetch below (it owns the fetch state).
    const [selected, setSelected] = useState(null);
    const [activations, setActivations] = useState([]);
    const [validateResult, setValidateResult] = useState(null);
    const [validateDomain, setValidateDomain] = useState("");
    const [validateIp, setValidateIp] = useState("");
    const [validatePath, setValidatePath] = useState("");
    const [pendingDelete, setPendingDelete] = useState(null);
    const [pendingReissue, setPendingReissue] = useState(null);
    // Notes feature (v3.0): the notes field is shown only while the
    // product_notes_enabled setting is "on" (default on); the backend
    // rejects notes with 400 while it is off.
    const [notesEnabled, setNotesEnabled] = useState(true);

    // Edit-license popup (v3.0, row 41): the Licenses page had NO edit
    // action at all — only details. Edit now opens in the same animated
    // Modal as every other list page, backed by PUT /api/licenses/{id}.
    const [editing, setEditing] = useState(null);
    const [editForm, setEditForm] = useState(null);
    const [editBusy, setEditBusy] = useState(false);
    const [searchParams] = useSearchParams();
    const productFilter = searchParams.get("product") || "";

    // Wizard state (create license, 4 steps).
    const [showWizard, setShowWizard] = useState(false);
    const [wizardStep, setWizardStep] = useState(0);
    const [wizardBusy, setWizardBusy] = useState(false);
    const [wGroupFilter, setWGroupFilter] = useState("");
    const [wProductId, setWProductId] = useState("");
    const [wProduct, setWProduct] = useState("");
    const [wCycle, setWCycle] = useState("");
    const [wOwnerEmail, setWOwnerEmail] = useState("");
    const [wExpiresInDays, setWExpiresInDays] = useState(365);
    const [wMaxActivations, setWMaxActivations] = useState(1);
    const [wDomains, setWDomains] = useState("");
    const [wIps, setWIps] = useState("");
    const [wInstallPath, setWInstallPath] = useState("");
    const [wNotes, setWNotes] = useState("");

    // v3.0.6: shared list fetch (loading + toast + empty fallback).
    const {loading, reload: fetchLicenses} = useListFetch(
        async () => {
            const q = productFilter ? `?filter=${filter}&product=${productFilter}` : `?filter=${filter}`;
            return getList(`/licenses${q}`, {skip: (page - 1) * pageSize, limit: pageSize});
        },
        [filter, productFilter, page, pageSize],
        {
            onData: ({items, total: t}) => { setLicenses(items); setTotal(t); },
            onError: () => { setLicenses([]); setTotal(0); },
        },
    );

    // v3.0.6: auxiliary picker data — silent on failure (a failed
    // product/group picker must never spam the user), same policy as before.
    const {reload: fetchProducts} = useListFetch(
        async () => get("/products"),
        [],
        {
            silent: true,
            onData: (data) => setProducts(Array.isArray(data) ? data : []),
            onError: () => setProducts([]),
        },
    );
    const {reload: fetchGroups} = useListFetch(
        async () => get("/product-groups"),
        [],
        {
            silent: true,
            onData: (data) => setGroups(Array.isArray(data) ? data : []),
            onError: () => setGroups([]),
        },
    );
    useEffect(() => {
        // The notes toggle lives in Settings → General; list pages read
        // it once so the notes field can hide everywhere when it is off.
        (async () => {
            try {
                const data = await get("/settings");
                setNotesEnabled(data.product_notes_enabled !== "off");
            } catch (err) { /* default (on) stays */ }
        })();
    }, []);

    const fetchActivations = useCallback(async (licenseId) => {
        try {
            const data = await get(`/licenses/${licenseId}/activations`);
            setActivations(Array.isArray(data) ? data : []);
        } catch (err) {
            setActivations([]);
        }
    }, []);

    useEffect(() => {
        if (selected) fetchActivations(selected.id);
        else setActivations([]);
    }, [selected, fetchActivations]);

    const selectedProduct = products.find((p) => String(p.id) === String(wProductId));
    const cycles = selectedProduct ? (selectedProduct.billing_cycles || []) : [];
    const wizardProducts = wGroupFilter
        ? products.filter((p) => String(p.group_id) === String(wGroupFilter))
        : products;

    // Edit form: the cycle options follow the (possibly newly picked)
    // linked product; a standalone license offers all known cycles.
    const editProduct = editForm && editForm.product_id
        ? products.find((p) => String(p.id) === String(editForm.product_id))
        : null;
    const editCycles = editProduct ? (editProduct.billing_cycles || []) : ALL_CYCLES;

    const handleRenew = async (id) => {
        try {
            // No body: the backend renews by the license's own billing cycle.
            const renewed = await post(`/licenses/${id}/renew`, {});
            setLicenses(licenses.map((license) => (license.id === id ? renewed : license)));
            if (selected && selected.id === id) setSelected(renewed);
            toast.success(t("licenses.renewed"));
        } catch (err) {
            toast.error(err.message || t("common.error"));
        }
    };

    const handleReissue = async (id) => {
        try {
            const reissued = await post(`/licenses/${id}/reissue`, {});
            setLicenses(licenses.map((license) => (license.id === id ? reissued : license)));
            if (selected && selected.id === id) setSelected(reissued);
            toast.success(t("licenses.reissued"));
        } catch (err) {
            toast.error(err.message || t("common.error"));
        }
    };

    const handleDeactivate = async (licenseId, activationId) => {
        try {
            await del(`/licenses/${licenseId}/activations/${activationId}`);
            setActivations(activations.filter((a) => a.id !== activationId));
            toast.success(t("licenses.deactivated"));
        } catch (err) {
            toast.error(err.message || t("common.error"));
        }
    };

    const handleValidate = async (license) => {
        try {
            const result = await post("/licenses/validate", {
                key: license.key,
                domain: validateDomain || undefined,
                ip: validateIp || undefined,
                install_path: validatePath || undefined,
            });
            setValidateResult(result);
        } catch (err) {
            toast.error(err.message || t("common.error"));
        }
    };

    const handleDelete = async (id) => {
        try {
            await del(`/licenses/${id}`);
            setLicenses(licenses.filter((license) => license.id !== id));
            setTotal((prev) => Math.max(0, prev - 1));
            if (selected && selected.id === id) setSelected(null);
            toast.success(t("licenses.deleted"));
        } catch (err) {
            toast.error(err.message || t("common.error"));
        }
    };

    // Edit-license popup: prefill from the row; the key is never editable
    // (it is the license identity). Payload mirrors LicenseUpdateRequest:
    // billing_cycle only when chosen ("" would 422), owner_email null
    // means "leave it" (the backend skips null), expires_in_days only
    // when typed (it resets expiry to now + days), notes only while the
    // notes feature is on (otherwise the backend 400s a non-empty value).
    const handleEdit = (license) => {
        setEditing(license);
        setEditForm({
            product_id: license.product_id ? String(license.product_id) : "",
            product: license.product || "",
            billing_cycle: license.billing_cycle || "",
            owner_email: license.owner_email || "",
            status: license.status || "active",
            expires_in_days: "",
            max_activations: license.max_activations ?? 1,
            allowed_domains: (license.allowed_domains || []).join(", "),
            allowed_ips: (license.allowed_ips || []).join(", "),
            install_path: license.install_path || "",
            notes: license.notes || "",
        });
    };

    const handleEditSave = async (e) => {
        e.preventDefault();
        if (!editing || !editForm) return;
        setEditBusy(true);
        try {
            const linked = editForm.product_id ? products.find((p) => String(p.id) === String(editForm.product_id)) : null;
            const payload = {
                product_id: editForm.product_id ? Number(editForm.product_id) : null,
                product: linked ? linked.name : (editForm.product || undefined),
                billing_cycle: editForm.billing_cycle || undefined,
                owner_email: editForm.owner_email || null,
                status: editForm.status,
                expires_in_days: editForm.expires_in_days ? Number(editForm.expires_in_days) : undefined,
                max_activations: Number(editForm.max_activations) || 1,
                allowed_domains: editForm.allowed_domains,
                allowed_ips: editForm.allowed_ips,
                install_path: editForm.install_path,
                ...(notesEnabled ? {notes: editForm.notes} : {}),
            };
            const updated = await put(`/licenses/${editing.id}`, payload);
            setLicenses(licenses.map((l) => (l.id === editing.id ? updated : l)));
            if (selected && selected.id === editing.id) setSelected(updated);
            toast.success(t("licenses.updated"));
            setEditing(null);
            setEditForm(null);
        } catch (err) {
            toast.error(err.message || t("common.error"));
        } finally {
            setEditBusy(false);
        }
    };

    const resetWizard = () => {
        setWGroupFilter(""); setWProductId(""); setWProduct(""); setWCycle("");
        setWOwnerEmail(""); setWExpiresInDays(365); setWMaxActivations(1);
        setWDomains(""); setWIps(""); setWInstallPath(""); setWNotes("");
        setWizardStep(0);
    };

    const handleWizardCreate = async () => {
        setWizardBusy(true);
        try {
            let payload;
            const notesPayload = notesEnabled && wNotes ? {notes: wNotes} : {};
            if (wProductId) {
                if (!wCycle) { toast.error(t("licenses.cycleRequired")); return; }
                payload = {
                    product_id: Number(wProductId),
                    billing_cycle: wCycle,
                    owner_email: wOwnerEmail || undefined,
                    max_activations: Number(wMaxActivations) || 1,
                    allowed_domains: wDomains || undefined,
                    allowed_ips: wIps || undefined,
                    install_path: wInstallPath || undefined,
                    ...notesPayload,
                };
            } else {
                if (!wProduct.trim()) { toast.error(t("licenses.productRequired")); return; }
                payload = {
                    product: wProduct,
                    owner_email: wOwnerEmail || undefined,
                    expires_in_days: Number(wExpiresInDays) || undefined,
                    max_activations: Number(wMaxActivations) || 1,
                    allowed_domains: wDomains || undefined,
                    allowed_ips: wIps || undefined,
                    install_path: wInstallPath || undefined,
                    ...notesPayload,
                };
            }
            const created = await post("/licenses", payload);
            if (page === 1) setLicenses([created, ...licenses].slice(0, pageSize));
            setTotal((prev) => prev + 1);
            toast.success(t("licenses.created"));
            resetWizard();
            setShowWizard(false);
        } catch (err) {
            toast.error(err.message || t("common.error"));
        } finally {
            setWizardBusy(false);
        }
    };

    // Client-side search over the loaded page (key / product / owner).
    const visible = licenses.filter((lic) => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return (lic.key || "").toLowerCase().includes(q)
            || (lic.product || "").toLowerCase().includes(q)
            || (lic.owner_email || "").toLowerCase().includes(q);
    });

    // Step 0 must not advance with neither a product nor a name: the
    // old `true` let the wizard reach step 1 with nothing selected, where
    // Next then sat disabled with no explanation.
    const wizardCanNext =
        wizardStep === 0 ? (wProductId !== "" || wProduct.trim().length > 0)
        : wizardStep === 1 ? (wProductId ? wCycle.length > 0 : wProduct.trim().length > 0)
        : true;

    // Inline per-step validation message (the Next button is disabled
    // while the step is incomplete, so the reason must be visible).
    const stepError =
        wizardStep === 0 && wProductId === "" && !wProduct.trim()
            ? t("licenses.productRequired")
            : wizardStep === 1 && wProductId !== "" && !wCycle
                ? t("licenses.cycleRequired")
                : wizardStep === 1 && wProductId === "" && !wProduct.trim()
                    ? t("licenses.productRequired")
                    : "";

    const reviewRows = [
        [t("licenses.product"), wProductId ? (selectedProduct ? selectedProduct.name : `#${wProductId}`) : (wProduct || "-")],
        // Without a product there is no billing cycle — the value is an
        // expiry in days, so label it as such (not "Billing Cycle").
        [wProductId ? t("licenses.billingCycle") : t("licenses.expiresInDays"), wProductId ? (wCycle ? t(`cycle.${wCycle}`) : "-") : `${wExpiresInDays} ${t("common.days")}`],
        [t("licenses.owner"), wOwnerEmail || "-"],
        [t("licenses.maxActivations"), String(wMaxActivations)],
        [t("licenses.allowedDomains"), wDomains || "-"],
        [t("licenses.allowedIps"), wIps || "-"],
        [t("licenses.installPath"), wInstallPath || "-"],
        ...(notesEnabled ? [[t("licenses.notes"), wNotes || "-"]] : []),
    ];

    return (
        <div className="license-list-container page-enter">
            <h1 className="gradient-text">{t("licenses.title")}</h1>
            {productFilter && <p className="dashboard-empty">{t("products.title")}: {products.find((p) => String(p.id) === productFilter)?.name || productFilter}</p>}
            <div className="toolbar">
                <button onClick={() => { resetWizard(); setShowWizard(true); }}><Plus size={16} />{t("licenses.create")}</button>
                <div className="filter-container">
                    <label htmlFor="filter">{t("licenses.filter")}:</label>
                    <select id="filter" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}>
                        <option value="all">{t("licenses.all")}</option>
                        <option value="active">{t("licenses.active")}</option>
                        <option value="inactive">{t("licenses.inactive")}</option>
                        <option value="daily">{t("licenses.daily")}</option>
                        <option value="weekly">{t("licenses.weekly")}</option>
                        <option value="monthly">{t("licenses.monthly")}</option>
                    </select>
                </div>
                <div className="search-wrap">
                    <span className="search-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
                    </span>
                    <input type="text" className="search-input" placeholder={t("licenses.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
            </div>

            {/* v3.0.1: the create wizard opens in the animated Modal (same
                popup as View/Edit) — inline it pushed the whole table
                down the page on phones. The Modal title carries the
                heading now, so the Wizard renders without its own. */}
            <Modal open={showWizard} title={t("licenses.create")} onClose={() => { setShowWizard(false); resetWizard(); }}>
                <Wizard
                    steps={[t("wizard.selectProduct"), t("wizard.customer"), t("wizard.locks"), t("wizard.review")]}
                    step={wizardStep}
                    onStepChange={setWizardStep}
                    canNext={wizardCanNext}
                    onSubmit={handleWizardCreate}
                    submitting={wizardBusy}
                    onCancel={() => { setShowWizard(false); resetWizard(); }}
                >
                    {wizardStep === 0 && (
                        <>
                            <select value={wGroupFilter} onChange={(e) => { setWGroupFilter(e.target.value); setWProductId(""); setWCycle(""); }} aria-label={t("products.group")}>
                                <option value="">{t("groups.selectGroup")}</option>
                                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                            </select>
                            <select value={wProductId} onChange={(e) => { setWProductId(e.target.value); setWCycle(""); }}>
                                <option value="">{t("licenses.noProduct")}</option>
                                {wizardProducts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                            {!wProductId && (
                                <input type="text" placeholder={t("licenses.productName")} value={wProduct} onChange={(e) => setWProduct(e.target.value)} required />
                            )}
                            {stepError && <p className="wizard-error" role="alert">{stepError}</p>}
                        </>
                    )}
                    {wizardStep === 1 && (
                        <>
                            {wProductId ? (
                                <label className="field-label">
                                    <span>{t("licenses.billingCycle")}</span>
                                    <select value={wCycle} onChange={(e) => setWCycle(e.target.value)} required>
                                        <option value="">{t("licenses.billingCycle")}</option>
                                        {cycles.map((c) => <option key={c} value={c}>{t(`cycle.${c}`)}</option>)}
                                    </select>
                                </label>
                            ) : (
                                <label className="field-label">
                                    <span>{t("licenses.expiresInDays")}</span>
                                    <input type="number" min="1" placeholder={t("licenses.expiresInDays")} value={wExpiresInDays} onChange={(e) => setWExpiresInDays(e.target.value)} />
                                </label>
                            )}
                            <label className="field-label">
                                <span>{t("licenses.ownerEmail")}</span>
                                <input type="email" placeholder={t("licenses.ownerEmail")} value={wOwnerEmail} onChange={(e) => setWOwnerEmail(e.target.value)} />
                            </label>
                            <label className="field-label">
                                <span>{t("licenses.maxActivations")}</span>
                                <input type="number" min="1" placeholder={t("licenses.maxActivations")} value={wMaxActivations} onChange={(e) => setWMaxActivations(e.target.value)} />
                            </label>
                            {notesEnabled && (
                                <label className="field-label">
                                    <span>{t("licenses.notes")}</span>
                                    <textarea placeholder={t("licenses.notes")} value={wNotes} onChange={(e) => setWNotes(e.target.value)} rows={3} />
                                </label>
                            )}
                            {stepError && <p className="wizard-error" role="alert">{stepError}</p>}
                        </>
                    )}
                    {wizardStep === 2 && (
                        <>
                            <label className="field-label">
                                <span>{t("licenses.allowedDomains")}</span>
                                <input type="text" placeholder={t("licenses.allowedDomains")} value={wDomains} onChange={(e) => setWDomains(e.target.value)} />
                                <small className="hint">{t("licenses.allowedDomainsHint")}</small>
                            </label>
                            <label className="field-label">
                                <span>{t("licenses.allowedIps")}</span>
                                <input type="text" placeholder={t("licenses.allowedIps")} value={wIps} onChange={(e) => setWIps(e.target.value)} />
                                <small className="hint">{t("licenses.allowedIpsHint")}</small>
                            </label>
                            <label className="field-label">
                                <span>{t("licenses.installPath")}</span>
                                <input type="text" placeholder={t("licenses.installPath")} value={wInstallPath} onChange={(e) => setWInstallPath(e.target.value)} />
                                <small className="hint">{t("licenses.installPathHint")}</small>
                            </label>
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
            </Modal>

            {loading ? (
                <TableSkeleton rows={5} />
            ) : visible.length === 0 ? (
                <EmptyState title={t("licenses.noLicenses")} text={search ? t("common.noResults") : undefined} />
            ) : (
            <>
            <div className="table-wrap">
            <table>
                <thead>
                <tr>
                    <th className="col-id">ID</th>
                    <th>{t("licenses.key")}</th>
                    <th className="col-product">{t("licenses.product")}</th>
                    <th className="col-cycle">{t("licenses.billingCycle")}</th>
                    <th>{t("common.status")}</th>
                    <th className="col-created">{t("common.createdAt")}</th>
                    <th>{t("common.actions")}</th>
                </tr>
                </thead>
                <tbody>
                {visible.map((license, i) => (
                    <tr key={license.id} className="stagger-item" style={{animationDelay: `${i * 40}ms`}}>
                        <td className="col-id">{license.id}</td>
                        <td className="key-cell">
                            <span className="key-cell-text">{license.key}</span> <CopyButton text={license.key} />
                        </td>
                        <td className="col-product">{license.product}</td>
                        <td className="col-cycle">{license.billing_cycle ? <span className="badge">{t(`cycle.${license.billing_cycle}`)}</span> : "-"}</td>
                        <td>{statusPill(license.status, t)}</td>
                        <td className="nowrap col-created">{formatDate(license.created_at, lang)}</td>
                        <td>
                            <div className="row-actions">
                                <button className="view-btn icon-btn" title={t("common.view")} aria-label={t("common.view")} onClick={() => { setSelected(license); setValidateResult(null); setValidateDomain(""); setValidateIp(""); setValidatePath(""); }}>
                                    {ICONS.view}
                                </button>
                                <button className="edit-btn icon-btn row-action-extra" title={t("licenses.edit")} aria-label={t("licenses.edit")} onClick={() => handleEdit(license)}>
                                    {ICONS.edit}
                                </button>
                                <button className="renew-btn icon-btn row-action-extra" title={t("common.renew")} aria-label={t("common.renew")} onClick={() => handleRenew(license.id)}>
                                    {ICONS.renew}
                                </button>
                                <button className="icon-btn row-action-extra" title={t("licenses.reissue")} aria-label={t("licenses.reissue")} onClick={() => setPendingReissue(license.id)}>
                                    {ICONS.reissue}
                                </button>
                                <button className="delete-btn icon-btn row-action-extra" title={t("common.delete")} aria-label={t("common.delete")} onClick={() => setPendingDelete(license.id)}>
                                    {ICONS.delete}
                                </button>
                            </div>
                        </td>
                    </tr>
                ))}
                </tbody>
            </table>
            </div>
            <Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
            </>
            )}
            <Modal open={editing !== null} title={editing ? `${t("licenses.edit")} #${editing.id}` : ""} onClose={() => { setEditing(null); setEditForm(null); }}>
                {editing && editForm && (
                <form className="license-edit-form" onSubmit={handleEditSave}>
                    <p><strong>{t("licenses.key")}:</strong> {editing.key} <CopyButton text={editing.key} /></p>
                    {editForm.product_id ? (
                        <label className="field-label">
                            <span>{t("licenses.product")}</span>
                            <select value={editForm.product_id} onChange={(e) => {
                                const p = products.find((x) => String(x.id) === String(e.target.value));
                                setEditForm({...editForm, product_id: e.target.value, product: p ? p.name : editForm.product, billing_cycle: ""});
                            }}>
                                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                        </label>
                    ) : (
                        <label className="field-label">
                            <span>{t("licenses.product")}</span>
                            <input type="text" placeholder={t("licenses.productName")} value={editForm.product} onChange={(e) => setEditForm({...editForm, product: e.target.value})} required />
                        </label>
                    )}
                    <label className="field-label">
                        <span>{t("licenses.billingCycle")}</span>
                        <select value={editForm.billing_cycle} onChange={(e) => setEditForm({...editForm, billing_cycle: e.target.value})}>
                            <option value="">—</option>
                            {editCycles.map((c) => <option key={c} value={c}>{t(`cycle.${c}`)}</option>)}
                        </select>
                    </label>
                    <label className="field-label">
                        <span>{t("licenses.ownerEmail")}</span>
                        <input type="email" placeholder={t("licenses.ownerEmail")} value={editForm.owner_email} onChange={(e) => setEditForm({...editForm, owner_email: e.target.value})} />
                    </label>
                    <label className="field-label">
                        <span>{t("common.status")}</span>
                        <select value={editForm.status} onChange={(e) => setEditForm({...editForm, status: e.target.value})}>
                            {LICENSE_STATUSES.map((s) => <option key={s} value={s}>{t(`common.${s}`) !== `common.${s}` ? t(`common.${s}`) : s}</option>)}
                        </select>
                    </label>
                    <p><strong>{t("licenses.expiresAt")}:</strong> {editing.expires_at ? formatDate(editing.expires_at, lang) : t("common.never")}</p>
                    <label className="field-label">
                        <span>{t("licenses.newExpiry")}</span>
                        <input type="number" min="1" placeholder={t("licenses.newExpiry")} value={editForm.expires_in_days} onChange={(e) => setEditForm({...editForm, expires_in_days: e.target.value})} />
                    </label>
                    <label className="field-label">
                        <span>{t("licenses.maxActivations")}</span>
                        <input type="number" min="1" placeholder={t("licenses.maxActivations")} value={editForm.max_activations} onChange={(e) => setEditForm({...editForm, max_activations: e.target.value})} required />
                    </label>
                    <label className="field-label">
                        <span>{t("licenses.allowedDomains")}</span>
                        <input type="text" placeholder={t("licenses.allowedDomains")} value={editForm.allowed_domains} onChange={(e) => setEditForm({...editForm, allowed_domains: e.target.value})} />
                        <small className="hint">{t("licenses.allowedDomainsHint")}</small>
                    </label>
                    <label className="field-label">
                        <span>{t("licenses.allowedIps")}</span>
                        <input type="text" placeholder={t("licenses.allowedIps")} value={editForm.allowed_ips} onChange={(e) => setEditForm({...editForm, allowed_ips: e.target.value})} />
                        <small className="hint">{t("licenses.allowedIpsHint")}</small>
                    </label>
                    <label className="field-label">
                        <span>{t("licenses.installPath")}</span>
                        <input type="text" placeholder={t("licenses.installPath")} value={editForm.install_path} onChange={(e) => setEditForm({...editForm, install_path: e.target.value})} />
                        <small className="hint">{t("licenses.installPathHint")}</small>
                    </label>
                    {notesEnabled && (
                        <label className="field-label">
                            <span>{t("licenses.notes")}</span>
                            <textarea placeholder={t("licenses.notes")} value={editForm.notes} onChange={(e) => setEditForm({...editForm, notes: e.target.value})} rows={3} />
                        </label>
                    )}
                    <div className="form-row">
                        <button type="submit" disabled={editBusy}>{t("common.save")}</button>
                        <button type="button" className="btn-ghost" onClick={() => { setEditing(null); setEditForm(null); }}>{t("common.cancel")}</button>
                    </div>
                </form>
                )}
            </Modal>
            <Modal open={!!selected} title={selected ? `${t("licenses.licenseDetail")} #${selected.id}` : ""} onClose={() => { setSelected(null); setValidateResult(null); }}>
                {selected && (<>
                    <p><strong>{t("licenses.key")}:</strong> {selected.key} <CopyButton text={selected.key} /></p>
                    <p><strong>{t("licenses.product")}:</strong> {selected.product}</p>
                    <p><strong>{t("licenses.billingCycle")}:</strong> {selected.billing_cycle ? t(`cycle.${selected.billing_cycle}`) : "-"}</p>
                    <p><strong>{t("licenses.owner")}:</strong> {selected.owner_email || "-"}</p>
                    <p><strong>{t("common.status")}:</strong> {statusPill(selected.status, t)}</p>
                    <p><strong>{t("licenses.expiresAt")}:</strong> {selected.expires_at ? formatDate(selected.expires_at, lang) : t("common.never")}</p>
                    <p><strong>{t("licenses.activations")}:</strong> {selected.activations} / {selected.max_activations}</p>
                    <p><strong>{t("licenses.allowedDomains")}:</strong> {(selected.allowed_domains || []).join(", ") || "-"}</p>
                    <p><strong>{t("licenses.allowedIps")}:</strong> {(selected.allowed_ips || []).join(", ") || "-"}</p>
                    <p><strong>{t("licenses.installPath")}:</strong> {selected.install_path || "-"}</p>
                    {notesEnabled && selected.notes && <p><strong>{t("licenses.notes")}:</strong> {selected.notes}</p>}
                    <p><strong>{t("common.createdAt")}:</strong> {formatDate(selected.created_at, lang)}</p>
                    <p><strong>{t("common.updatedAt")}:</strong> {formatDate(selected.updated_at, lang)}</p>
                    <div className="activations-section">
                        <h4>{t("licenses.activationsTitle")}</h4>
                        {activations.length === 0 ? (
                            <p className="dashboard-empty">{t("licenses.noActivations")}</p>
                        ) : (
                            <ul className="activations-list">
                                {activations.map((a) => (
                                    <li key={a.id}>
                                        <span><strong>{t("licenses.fingerprint")}:</strong> <span className="key-cell">{a.fingerprint}</span>{a.label ? ` — ${a.label}` : ""}</span>
                                        <button className="delete-btn" onClick={() => handleDeactivate(selected.id, a.id)}>{t("licenses.deactivate")}</button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <div className="validate-form">
                        <h4>{t("licenses.validateWith")}</h4>
                        <input type="text" placeholder={t("licenses.domain")} value={validateDomain} onChange={(e) => setValidateDomain(e.target.value)} />
                        <input type="text" placeholder={t("licenses.ip")} value={validateIp} onChange={(e) => setValidateIp(e.target.value)} />
                        <input type="text" placeholder={t("licenses.installPath")} value={validatePath} onChange={(e) => setValidatePath(e.target.value)} />
                        <button onClick={() => handleValidate(selected)}>{t("common.validate")}</button>
                    </div>
                    <div className="row-actions modal-actions">
                        <button onClick={() => { const lic = selected; setSelected(null); handleEdit(lic); }}>{t("licenses.edit")}</button>
                        <button onClick={() => handleRenew(selected.id)}>{t("licenses.renewCycle")}</button>
                        <button onClick={() => { const id = selected.id; setSelected(null); setPendingReissue(id); }}>{t("licenses.reissue")}</button>
                        <button className="btn-danger" onClick={() => { const id = selected.id; setSelected(null); setPendingDelete(id); }}>{t("common.delete")}</button>
                    </div>
                    {validateResult && (
                        <p className="validate-result">
                            <strong>{t("licenses.validation")}:</strong>{" "}
                            {validateResult.valid ? t("licenses.valid") : t("licenses.invalid")}
                            {validateResult.detail ? ` — ${validateResult.detail}` : ""}
                            {validateResult.reason && validateResult.reason !== validateResult.detail ? ` (${validateResult.reason})` : ""}
                        </p>
                    )}
                    </>)}
                </Modal>
            <ConfirmModal
                open={pendingDelete !== null}
                message={t("common.confirmDelete")}
                onConfirm={() => { const id = pendingDelete; setPendingDelete(null); handleDelete(id); }}
                onCancel={() => setPendingDelete(null)}
            />
            <ConfirmModal
                open={pendingReissue !== null}
                message={t("licenses.reissueConfirm")}
                confirmLabel={t("licenses.reissue")}
                onConfirm={() => { const id = pendingReissue; setPendingReissue(null); handleReissue(id); }}
                onCancel={() => setPendingReissue(null)}
            />
        </div>
    );
}

export default LicenseList;
