import React, {useState, useEffect, useCallback} from "react";
import {getList, post, put, del} from "../utils/api";
import {formatDate} from "../utils/format";
import {useLanguage} from "../i18n";
import {useToast} from "../components/Toast";
import ConfirmModal from "../components/ConfirmModal";
import CopyButton from "../components/CopyButton";
import EmptyState from "../components/EmptyState";
import Pagination from "../components/Pagination";
import {TableSkeleton} from "../components/Skeleton";
import Wizard from "../components/Wizard";
import "../styles/APIKeyList.css";

const PAGE_SIZE = 10;

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

function APIKeyList() {
    const {t, lang} = useLanguage();
    const {toast} = useToast();
    const [apiKeys, setApiKeys] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [newKey, setNewKey] = useState("");
    const [newRights, setNewRights] = useState(["get_license_info"]);
    const [newExpiresInDays, setNewExpiresInDays] = useState("");
    const [newIp, setNewIp] = useState("");
    const [newDomain, setNewDomain] = useState("");
    const [newDirectory, setNewDirectory] = useState("");
    const [newSingleUse, setNewSingleUse] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [pendingDelete, setPendingDelete] = useState(null);
    // Wizard state (create only; edit stays inline).
    const [showWizard, setShowWizard] = useState(false);
    const [wizardStep, setWizardStep] = useState(0);
    const [wizardBusy, setWizardBusy] = useState(false);
    const [createdKey, setCreatedKey] = useState(null);

    const fetchApiKeys = useCallback(async () => {
        setLoading(true);
        try {
            const {items, total: t} = await getList("/api-keys", {skip: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE});
            setApiKeys(items);
            setTotal(t);
        } catch (err) {
            toast.error(err.message || t("common.failedFetch"));
            setApiKeys([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    }, [page, toast, t]);

    useEffect(() => {
        fetchApiKeys();
    }, [fetchApiKeys]);

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
        setWizardStep(0);
        setCreatedKey(null);
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
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        try {
            const updated = await put(`/api-keys/${editingId}`, {
                access_rights: newRights,
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
                expires_in_days: newExpiresInDays ? Number(newExpiresInDays) : undefined,
                associated_ip: newIp || undefined,
                associated_domain: newDomain || undefined,
                associated_directory: newDirectory || undefined,
                single_use: newSingleUse,
            });
            if (page === 1) setApiKeys([created, ...apiKeys].slice(0, PAGE_SIZE));
            setTotal((prev) => prev + 1);
            setCreatedKey(created.key);
            toast.success(t("apikeys.created"));
        } catch (err) {
            toast.error(err.message || t("common.error"));
        } finally {
            setWizardBusy(false);
        }
    };

    // Client-side search over the loaded page (key value / access rights).
    const visible = apiKeys.filter((key) => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return (key.key || "").toLowerCase().includes(q)
            || (key.access_rights || []).join(" ").toLowerCase().includes(q);
    });

    const wizardCanNext = wizardStep === 0 ? newRights.length > 0 : true;
    const reviewRows = [
        [t("apikeys.accessRights"), newRights.join(", ") || "-"],
        [t("apikeys.key"), newKey || t("apikeys.keyPlaceholder")],
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
                <button onClick={() => { resetWizard(); setShowWizard(true); }}>{t("apikeys.create")}</button>
            </div>

            {showWizard && (
                <Wizard
                    title={t("apikeys.create")}
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
                            <button onClick={() => { setShowWizard(false); resetWizard(); }}>{t("common.close")}</button>
                        </>
                    ) : null}
                >
                    {wizardStep === 0 && (
                        <fieldset>
                            <legend>{t("apikeys.accessRights")}</legend>
                            <div className="check-group">
                                {ALL_ACCESS_RIGHTS.map((right) => (
                                    <label key={right} className="check-label">
                                        <input type="checkbox" checked={newRights.includes(right)} onChange={() => toggleRight(right)} /> {right}
                                    </label>
                                ))}
                            </div>
                        </fieldset>
                    )}
                    {wizardStep === 1 && (
                        <>
                            <input type="text" placeholder={t("apikeys.keyPlaceholder")} value={newKey} onChange={(e) => setNewKey(e.target.value)} />
                            <input type="number" min="1" placeholder={t("apikeys.expiresPlaceholder")} value={newExpiresInDays} onChange={(e) => setNewExpiresInDays(e.target.value)} />
                            <input type="text" placeholder={t("apikeys.restrictIp")} value={newIp} onChange={(e) => setNewIp(e.target.value)} />
                            <input type="text" placeholder={t("apikeys.restrictDomain")} value={newDomain} onChange={(e) => setNewDomain(e.target.value)} />
                            <input type="text" placeholder={t("apikeys.restrictDirectory")} value={newDirectory} onChange={(e) => setNewDirectory(e.target.value)} />
                            <label className="check-label">
                                <input type="checkbox" checked={newSingleUse} onChange={(e) => setNewSingleUse(e.target.checked)} /> {t("apikeys.singleUseLabel")}
                            </label>
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
            )}

            {editingId !== null && (
                <form className="add-api-key-form glass-card" onSubmit={handleUpdate} style={{margin: "16px 0"}}>
                    <h3>{`${t("apikeys.edit")} #${editingId}`}</h3>
                    <input type="text" placeholder={t("apikeys.keyLocked")} value={newKey} disabled />
                    <fieldset>
                        <legend>{t("apikeys.accessRights")}</legend>
                        <div className="check-group">
                            {ALL_ACCESS_RIGHTS.map((right) => (
                                <label key={right} className="check-label">
                                    <input type="checkbox" checked={newRights.includes(right)} onChange={() => toggleRight(right)} /> {right}
                                </label>
                            ))}
                        </div>
                    </fieldset>
                    <input type="number" min="1" placeholder={t("apikeys.expiresEdit")} value={newExpiresInDays} onChange={(e) => setNewExpiresInDays(e.target.value)} />
                    <input type="text" placeholder={t("apikeys.restrictIp")} value={newIp} onChange={(e) => setNewIp(e.target.value)} />
                    <input type="text" placeholder={t("apikeys.restrictDomain")} value={newDomain} onChange={(e) => setNewDomain(e.target.value)} />
                    <input type="text" placeholder={t("apikeys.restrictDirectory")} value={newDirectory} onChange={(e) => setNewDirectory(e.target.value)} />
                    <label className="check-label">
                        <input type="checkbox" checked={newSingleUse} onChange={(e) => setNewSingleUse(e.target.checked)} /> {t("apikeys.singleUseLabel")}
                    </label>
                    <div className="form-row">
                        <button type="submit">{t("apikeys.saveChanges")}</button>
                        <button type="button" className="btn-ghost" onClick={resetForm}>{t("common.cancel")}</button>
                    </div>
                </form>
            )}

            <div className="toolbar">
                <div className="search-wrap">
                    <span className="search-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
                    </span>
                    <input type="text" className="search-input" placeholder={t("apikeys.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
            </div>
            {loading ? (
                <TableSkeleton rows={4} />
            ) : visible.length === 0 ? (
                <EmptyState title={t("dashboard.noApiKeys")} text={search ? t("common.noResults") : undefined} />
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
                            <td className="key-cell">{key.key} <CopyButton text={key.key} /></td>
                            <td>{key.access_rights.join(", ")}</td>
                            <td className="nowrap">{key.expires_at ? formatDate(key.expires_at, lang) : t("common.never")}</td>
                            <td>{key.single_use ? t("common.yes") : t("common.no")}</td>
                            <td>
                                <div className="row-actions">
                                    <button className="edit-btn" onClick={() => handleEdit(key)}>
                                        {t("common.edit")}
                                    </button>
                                    <button className="delete-btn" onClick={() => setPendingDelete(key.id)}>
                                        {t("common.delete")}
                                    </button>
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
            <ConfirmModal
                open={pendingDelete !== null}
                message={t("common.confirmDelete")}
                onConfirm={() => { const id = pendingDelete; setPendingDelete(null); handleDelete(id); }}
                onCancel={() => setPendingDelete(null)}
            />
        </div>
    );
}

export default APIKeyList;
