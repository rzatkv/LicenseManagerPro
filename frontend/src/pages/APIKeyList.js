import React, {useState, useEffect} from "react";
import {getList, post, put, del} from "../utils/api";
import {formatDate} from "../utils/format";
import {useLanguage} from "../i18n";
import {useToast} from "../components/Toast";
import ConfirmModal from "../components/ConfirmModal";
import Modal from "../components/Modal";
import CopyButton from "../components/CopyButton";
import EmptyState from "../components/EmptyState";
import Pagination from "../components/Pagination";
import {usePageSize} from "../utils/responsive";
import {useListFetch} from "../utils/useListFetch";
import {useLiveRefresh} from "../utils/useLiveRefresh";
import LiveIndicator from "../components/LiveIndicator";
import {TableSkeleton} from "../components/Skeleton";
import Wizard from "../components/Wizard";
import ChipSelect from "../components/ChipSelect";
import ToggleSwitch from "../components/ToggleSwitch";
import "../styles/APIKeyList.css";
import {Plus} from "lucide-react";


const ALL_ACCESS_RIGHTS = [
    "create_license",
    "edit_license",
    "delete_license",
    "get_license_info",
    "renew_license",
    "remove_access",
    "add_access",
    "change_access_key",
    "create_temporary_access_key",
];

// Row-action icons (same set as Products/LicenseList): 32px icon buttons;
// at ≤640px only the eye stays in the row (global .row-action-extra
// rule), edit/rotate/delete live in the details popup.
const ICONS = {
  view: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  edit: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.8 2.8 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>,
  rotate: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0114.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0020.5 15"/></svg>,
  delete: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>,
};

function APIKeyList() {
    const {t, lang} = useLanguage();
    const {toast} = useToast();
    const [apiKeys, setApiKeys] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = usePageSize("api-keys");
    // Breakpoint change resets to page 1 (the fetch refetches via its
    // pageSize dep below).
    useEffect(() => { setPage(1); }, [pageSize]);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [sort, setSort] = useState("newest");
    // `loading` comes from useListFetch below (it owns the fetch state).
    const [newKey, setNewKey] = useState("");
    const [newRights, setNewRights] = useState(["get_license_info"]);
    const [newExpiresInDays, setNewExpiresInDays] = useState("");
    const [newIp, setNewIp] = useState("");
    const [newDomain, setNewDomain] = useState("");
    const [newDirectory, setNewDirectory] = useState("");
    const [newSingleUse, setNewSingleUse] = useState(false);
    const [newIsModule, setNewIsModule] = useState(false);
    const [newSigned, setNewSigned] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [pendingDelete, setPendingDelete] = useState(null);
    const [pendingRotate, setPendingRotate] = useState(null);
    // Details popup (v3.0.1): the full key + rights live here; at ≤640px
    // the table shows only Key + Actions, so this popup is the only
    // place a phone user reaches edit/rotate/delete.
    const [detailsKey, setDetailsKey] = useState(null);
    // Secret shown exactly once after create/rotate; cleared on dismiss.
    const [revealedSecret, setRevealedSecret] = useState(null);
    // Wizard state (create only; edit opens in an animated Modal — see
    // the edit form below, APIKeyList.js:328 — NOT an inline form).
    const [showWizard, setShowWizard] = useState(false);
    const [wizardStep, setWizardStep] = useState(0);
    const [wizardBusy, setWizardBusy] = useState(false);
    const [createdKey, setCreatedKey] = useState(null);

    // v3.0.6: shared list fetch (loading + toast + empty fallback).
    const {loading, reload: fetchApiKeys, reloadQuiet: fetchApiKeysQuiet, lastUpdated} = useListFetch(
        async () => getList("/api-keys", {skip: (page - 1) * pageSize, limit: pageSize}),
        [page, pageSize],
        {
            onData: ({items, total: t}) => { setApiKeys(items); setTotal(t); },
            onError: () => { setApiKeys([]); setTotal(0); },
        },
    );

    // Live auto-refresh (v3.0.11): quiet 60s tick, pauses when hidden.
    useLiveRefresh(fetchApiKeysQuiet);

    const handleDelete = async (id) => {
        try {
            await del(`/api-keys/${id}`);
            setApiKeys(apiKeys.filter((key) => key.id !== id));
            setTotal((prev) => Math.max(0, prev - 1));
            toast.success(t("apikeys.deleted"));
        } catch (err) {
            toast.error(err.message || t("common.error"));
        }
    };

    const toggleRight = (right) => {
        setNewRights((prev) =>
            prev.includes(right) ? prev.filter((r) => r !== right) : [...prev, right]
        );
    };

    const resetForm = () => {
        setNewKey("");
        setNewRights(["get_license_info"]);
        setNewExpiresInDays("");
        setNewIp("");
        setNewDomain("");
        setNewDirectory("");
        setNewSingleUse(false);
        setNewIsModule(false);
        setNewSigned(false);
        setEditingId(null);
    };

    const resetWizard = () => {
        setNewKey("");
        setNewRights(["get_license_info"]);
        setNewExpiresInDays("");
        setNewIp("");
        setNewDomain("");
        setNewDirectory("");
        setNewSingleUse(false);
        setNewIsModule(false);
        setNewSigned(false);
        setWizardStep(0);
        setCreatedKey(null);
    };

    // Rotate a key: the old secret stops working immediately and the new
    // secret is shown exactly once (in the reveal card below).
    const handleRotate = async (id) => {
        try {
            const rotated = await post(`/api-keys/${id}/rotate`, {});
            setApiKeys(apiKeys.map((key) => (key.id === id ? {...key, key: rotated.key, scopes: rotated.scopes || key.scopes} : key)));
            setRevealedSecret(rotated.plain_key || null);
            toast.success(t("apikeys.rotated"));
        } catch (err) {
            toast.error(err.message || t("common.error"));
        }
    };

    const handleEdit = (key) => {
        setEditingId(key.id);
        setNewKey(key.key);
        setNewRights([...key.access_rights]);
        // Leave expiry empty: an empty value means "do not change".
        setNewExpiresInDays("");
        setNewIp(key.associated_ip || "");
        setNewDomain(key.associated_domain || "");
        setNewDirectory(key.associated_directory || "");
        setNewSingleUse(!!key.single_use);
        setNewIsModule((key.scopes || []).includes("module"));
        setNewSigned(!!key.require_signed_requests);
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        try {
            const updated = await put(`/api-keys/${editingId}`, {
                access_rights: newRights,
                scopes: newIsModule ? ["module"] : [],
                require_signed_requests: newSigned,
                expires_in_days: newExpiresInDays ? Number(newExpiresInDays) : undefined,
                associated_ip: newIp || undefined,
                associated_domain: newDomain || undefined,
                associated_directory: newDirectory || undefined,
                single_use: newSingleUse,
            });
            setApiKeys(apiKeys.map((key) => (key.id === editingId ? updated : key)));
            toast.success(t("apikeys.updated"));
            resetForm();
        } catch (err) {
            toast.error(err.message || t("common.error"));
        }
    };

    const handleWizardCreate = async () => {
        setWizardBusy(true);
        try {
            const created = await post("/api-keys", {
                key: newKey || undefined,
                access_rights: newRights,
                scopes: newIsModule ? ["module"] : [],
                require_signed_requests: newSigned,
                expires_in_days: newExpiresInDays ? Number(newExpiresInDays) : undefined,
                associated_ip: newIp || undefined,
                associated_domain: newDomain || undefined,
                associated_directory: newDirectory || undefined,
                single_use: newSingleUse,
            });
            if (page === 1) setApiKeys([created, ...apiKeys].slice(0, pageSize));
            setTotal((prev) => prev + 1);
            // The secret is returned once, at creation — show it, not the prefix.
            setCreatedKey(created.plain_key || created.key);
            toast.success(t("apikeys.created"));
        } catch (err) {
            toast.error(err.message || t("common.error"));
        } finally {
            setWizardBusy(false);
        }
    };

    // Key status, derived from the record itself: a consumed single-use key
    // is "consumed", a past expiry is "expired", anything else is "active".
    const keyStatus = (key) => {
        if (key.consumed) return "consumed";
        if (key.expires_at && new Date(key.expires_at) < new Date()) return "expired";
        return "active";
    };

    // Client-side search + status filter + sort over the loaded page
    // (key value / access rights). The demo mock has no server-side
    // filter for API keys, so filtering here works in demo mode as-is.
    const filtersActive = search.trim() !== "" || statusFilter !== "all" || sort !== "newest";
    const visible = apiKeys
        .filter((key) => {
            if (search.trim()) {
                const q = search.trim().toLowerCase();
                if (!(key.key || "").toLowerCase().includes(q)
                    && !(key.access_rights || []).join(" ").toLowerCase().includes(q)) return false;
            }
            if (statusFilter !== "all" && keyStatus(key) !== statusFilter) return false;
            return true;
        })
        .sort((a, b) => {
            const ta = new Date(a.created_at || 0).getTime();
            const tb = new Date(b.created_at || 0).getTime();
            return sort === "oldest" ? ta - tb : tb - ta;
        });

    const clearFilters = () => {
        setSearch("");
        setStatusFilter("all");
        setSort("newest");
    };

    const wizardCanNext = wizardStep === 0 ? newRights.length > 0 : true;
    const reviewRows = [
        [t("apikeys.accessRights"), newRights.join(", ") || "-"],
        [t("apikeys.key"), newKey || t("apikeys.keyPlaceholder")],
        [t("apikeys.scopes"), newIsModule ? t("apikeys.moduleKey") : "-"],
        [t("apikeys.signedRequests"), newSigned ? t("common.yes") : t("common.no")],
        [t("apikeys.expires"), newExpiresInDays ? `${newExpiresInDays} ${t("common.days")}` : t("common.never")],
        [t("apikeys.restrictIp"), newIp || "-"],
        [t("apikeys.restrictDomain"), newDomain || "-"],
        [t("apikeys.restrictDirectory"), newDirectory || "-"],
        [t("apikeys.singleUse"), newSingleUse ? t("common.yes") : t("common.no")],
    ];

    return (
        <div className="api-key-list-container page-enter">
            <h1 className="gradient-text">{t("apikeys.title")}</h1>
            <div className="toolbar">
                <button onClick={() => { resetWizard(); setShowWizard(true); }}><Plus size={16} />{t("apikeys.create")}</button>
            </div>

            {/* v3.0.1: the create wizard opens in the animated Modal (same
                popup as Edit) — inline it pushed the whole table down
                the page on phones. The Modal title carries the heading
                now, so the Wizard renders without its own. The
                generated key (success state) is shown inside the same
                popup, still only once. */}
            <Modal open={showWizard} title={t("apikeys.create")} onClose={() => { setShowWizard(false); resetWizard(); }}>
                <Wizard
                    steps={[t("wizard.rights"), t("wizard.restrictions"), t("wizard.review")]}
                    step={wizardStep}
                    onStepChange={setWizardStep}
                    canNext={wizardCanNext}
                    onSubmit={handleWizardCreate}
                    submitting={wizardBusy}
                    onCancel={() => { setShowWizard(false); resetWizard(); }}
                    success={createdKey ? (
                        <>
                            <p>{t("wizard.yourKey")}</p>
                            <p className="key-cell">{createdKey} <CopyButton text={createdKey} /></p>
                            <p className="hint">{t("apikeys.secretShownOnce")}</p>
                            <button onClick={() => { setShowWizard(false); resetWizard(); }}>{t("common.close")}</button>
                        </>
                    ) : null}
                >
                    {wizardStep === 0 && (
                        <div className="check-field">
                            <div className="check-field-title">{t("apikeys.accessRights")}</div>
                            <ChipSelect
                              ariaLabel={t("apikeys.accessRights")}
                              options={ALL_ACCESS_RIGHTS}
                              selected={newRights}
                              onToggle={toggleRight}
                            />
                        </div>
                    )}
                    {wizardStep === 1 && (
                        <>
                            <ToggleSwitch checked={newIsModule} onChange={(v) => { setNewIsModule(v); if (v && !newExpiresInDays) setNewExpiresInDays("90"); }} label={t("apikeys.moduleKey")} hint={t("apikeys.moduleKeyHint")} />
                            {newIsModule && (
                                <>
                                    <select value={newExpiresInDays} onChange={(e) => setNewExpiresInDays(e.target.value)} aria-label={t("apikeys.expires")}>
                                        {[30, 90, 180, 365].map((d) => (
                                            <option key={d} value={String(d)}>{d} {t("common.days")}</option>
                                        ))}
                                    </select>
                                    <ToggleSwitch checked={newSigned} onChange={setNewSigned} label={t("apikeys.signedRequests")} />
                                </>
                            )}
                            <input type="text" placeholder={t("apikeys.keyPlaceholder")} value={newKey} onChange={(e) => setNewKey(e.target.value)} />
                            {!newIsModule && (
                                <input type="number" min="1" placeholder={t("apikeys.expiresPlaceholder")} value={newExpiresInDays} onChange={(e) => setNewExpiresInDays(e.target.value)} />
                            )}
                            <input type="text" placeholder={t("apikeys.restrictIp")} value={newIp} onChange={(e) => setNewIp(e.target.value)} />
                            <input type="text" placeholder={t("apikeys.restrictDomain")} value={newDomain} onChange={(e) => setNewDomain(e.target.value)} />
                            <input type="text" placeholder={t("apikeys.restrictDirectory")} value={newDirectory} onChange={(e) => setNewDirectory(e.target.value)} />
                            <ToggleSwitch checked={newSingleUse} onChange={setNewSingleUse} label={t("apikeys.singleUseLabel")} />
                        </>
                    )}
                    {wizardStep === 2 && (
                        <div className="wizard-review">
                            {reviewRows.map(([label, value]) => (
                                <div key={label} className="wizard-review-row"><strong>{label}</strong><span>{value}</span></div>
                            ))}
                        </div>
                    )}
                </Wizard>
            </Modal>

            {revealedSecret && (
                <div className="glass-card reveal-secret" style={{margin: "16px 0"}}>
                    <strong>{t("wizard.yourKey")}</strong>
                    <p className="key-cell">{revealedSecret} <CopyButton text={revealedSecret} /></p>
                    <p className="hint">{t("apikeys.secretShownOnce")}</p>
                    <button type="button" className="btn-ghost" onClick={() => setRevealedSecret(null)}>{t("common.close")}</button>
                </div>
            )}

            <Modal open={editingId !== null} title={editingId !== null ? `${t("apikeys.edit")} #${editingId}` : ""} onClose={resetForm}>
                <form className="add-api-key-form" onSubmit={handleUpdate}>
                    <input type="text" placeholder={t("apikeys.keyLocked")} value={newKey} disabled />
                    <ToggleSwitch checked={newIsModule} onChange={setNewIsModule} label={t("apikeys.moduleKey")} hint={t("apikeys.moduleKeyHint")} />
                    {newIsModule && (
                        <ToggleSwitch checked={newSigned} onChange={setNewSigned} label={t("apikeys.signedRequests")} />
                    )}
                    <div className="check-field">
                        <div className="check-field-title">{t("apikeys.accessRights")}</div>
                        <ChipSelect
                          ariaLabel={t("apikeys.accessRights")}
                          options={ALL_ACCESS_RIGHTS}
                          selected={newRights}
                          onToggle={toggleRight}
                        />
                    </div>
                    <input type="number" min="1" placeholder={t("apikeys.expiresEdit")} value={newExpiresInDays} onChange={(e) => setNewExpiresInDays(e.target.value)} />
                    <input type="text" placeholder={t("apikeys.restrictIp")} value={newIp} onChange={(e) => setNewIp(e.target.value)} />
                    <input type="text" placeholder={t("apikeys.restrictDomain")} value={newDomain} onChange={(e) => setNewDomain(e.target.value)} />
                    <input type="text" placeholder={t("apikeys.restrictDirectory")} value={newDirectory} onChange={(e) => setNewDirectory(e.target.value)} />
                    <ToggleSwitch checked={newSingleUse} onChange={setNewSingleUse} label={t("apikeys.singleUseLabel")} />
                    <div className="form-row">
                        <button type="submit">{t("apikeys.saveChanges")}</button>
                        <button type="button" className="btn-ghost" onClick={resetForm}>{t("common.cancel")}</button>
                    </div>
                </form>
            </Modal>

            <div className="toolbar">
                <LiveIndicator lastUpdated={lastUpdated} />
                <div className="search-wrap">
                    <span className="search-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
                    </span>
                    <input type="text" className="search-input" placeholder={t("apikeys.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <div className="filter-container">
                    <label htmlFor="apikey-status-filter">{t("common.status")}:</label>
                    <select id="apikey-status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        <option value="all">{t("common.all")}</option>
                        <option value="active">{t("common.active")}</option>
                        <option value="expired">{t("common.expired")}</option>
                        {/* No i18n key exists for "consumed": raw status value, same
                            convention as the raw action badges on AuditLogs. */}
                        <option value="consumed">consumed</option>
                    </select>
                </div>
                <div className="filter-container">
                    <label htmlFor="apikey-sort">{t("common.createdAt")}:</label>
                    <select id="apikey-sort" value={sort} onChange={(e) => setSort(e.target.value)}>
                        <option value="newest">↓</option>
                        <option value="oldest">↑</option>
                    </select>
                </div>
                {filtersActive && (
                    <button type="button" className="btn-ghost" onClick={clearFilters}>{t("filters.clearAll")}</button>
                )}
            </div>
            {loading ? (
                <TableSkeleton rows={4} />
            ) : visible.length === 0 ? (
                <EmptyState title={t("dashboard.noApiKeys")} text={filtersActive ? t("common.noResults") : undefined} />
            ) : (
                <>
                <div className="table-wrap">
                <table>
                    <thead>
                    <tr>
                        <th>ID</th>
                        <th>{t("apikeys.key")}</th>
                        <th>{t("apikeys.accessRights")}</th>
                        <th>{t("apikeys.expires")}</th>
                        <th>{t("apikeys.singleUse")}</th>
                        <th>{t("common.actions")}</th>
                    </tr>
                    </thead>
                    <tbody>
                    {visible.map((key, i) => (
                        <tr key={key.id} className="stagger-item" style={{animationDelay: `${i * 40}ms`}}>
                            <td>{key.id}</td>
                            <td className="key-cell">{key.key} <CopyButton text={key.key} />{(key.scopes || []).includes("module") && <span className="pill pill-module">{t("apikeys.moduleKey")}</span>}</td>
                            <td>{key.access_rights.join(", ")}</td>
                            <td className="nowrap">{key.expires_at ? formatDate(key.expires_at, lang) : t("common.never")}{key.expires_at && new Date(key.expires_at) - new Date() > 0 && new Date(key.expires_at) - new Date() < 7 * 24 * 60 * 60 * 1000 && <span className="pill pill-warn">{t("apikeys.expiringSoon")}</span>}</td>
                            <td>{key.single_use ? t("common.yes") : t("common.no")}</td>
                            <td>
                                <div className="row-actions">
                                    <button className="view-btn icon-btn" title={t("common.view")} aria-label={t("common.view")} onClick={() => setDetailsKey(key)}>{ICONS.view}</button>
                                    <button className="edit-btn icon-btn row-action-extra" title={t("common.edit")} aria-label={t("common.edit")} onClick={() => handleEdit(key)}>{ICONS.edit}</button>
                                    <button className="edit-btn icon-btn row-action-extra" title={t("apikeys.rotate")} aria-label={t("apikeys.rotate")} onClick={() => setPendingRotate(key.id)}>{ICONS.rotate}</button>
                                    <button className="delete-btn icon-btn row-action-extra" title={t("common.delete")} aria-label={t("common.delete")} onClick={() => setPendingDelete(key.id)}>{ICONS.delete}</button>
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
            <Modal open={!!detailsKey} title={detailsKey ? `${t("apikeys.key")} #${detailsKey.id}` : ""} onClose={() => setDetailsKey(null)}>
                {detailsKey && (<>
                    <p className="key-cell">{detailsKey.key} <CopyButton text={detailsKey.key} /></p>
                    <div className="detail-row"><strong>{t("apikeys.accessRights")}</strong><span>{(detailsKey.access_rights || []).join(", ") || "-"}</span></div>
                    <div className="detail-row"><strong>{t("apikeys.expires")}</strong><span>{detailsKey.expires_at ? formatDate(detailsKey.expires_at, lang) : t("common.never")}</span></div>
                    <div className="detail-row"><strong>{t("apikeys.singleUse")}</strong><span>{detailsKey.single_use ? t("common.yes") : t("common.no")}</span></div>
                    <div className="detail-row"><strong>{t("apikeys.moduleKey")}</strong><span>{(detailsKey.scopes || []).includes("module") ? t("common.yes") : t("common.no")}</span></div>
                    {detailsKey.associated_ip && <div className="detail-row"><strong>{t("apikeys.restrictIp")}</strong><span>{detailsKey.associated_ip}</span></div>}
                    {detailsKey.associated_domain && <div className="detail-row"><strong>{t("apikeys.restrictDomain")}</strong><span>{detailsKey.associated_domain}</span></div>}
                    <div className="row-actions modal-actions">
                        <button onClick={() => { const k = detailsKey; setDetailsKey(null); handleEdit(k); }}>{t("common.edit")}</button>
                        <button onClick={() => { const id = detailsKey.id; setDetailsKey(null); setPendingRotate(id); }}>{t("apikeys.rotate")}</button>
                        <button className="btn-danger" onClick={() => { const id = detailsKey.id; setDetailsKey(null); setPendingDelete(id); }}>{t("common.delete")}</button>
                    </div>
                </>)}
            </Modal>
            <ConfirmModal
                open={pendingDelete !== null}
                message={t("common.confirmDelete")}
                onConfirm={() => { const id = pendingDelete; setPendingDelete(null); handleDelete(id); }}
                onCancel={() => setPendingDelete(null)}
            />
            <ConfirmModal
                open={pendingRotate !== null}
                message={t("apikeys.rotateConfirm")}
                onConfirm={() => { const id = pendingRotate; setPendingRotate(null); handleRotate(id); }}
                onCancel={() => setPendingRotate(null)}
            />
        </div>
    );
}

export default APIKeyList;
