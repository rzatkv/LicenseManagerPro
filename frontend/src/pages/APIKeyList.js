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

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            if (editingId !== null) {
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
                return;
            }
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
            toast.success(t("apikeys.created"));
            resetForm();
        } catch (err) {
            toast.error(err.message || t("common.error"));
        }
    };

    // Client-side search over the loaded page (key value / access rights).
    const visible = apiKeys.filter((key) => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return (key.key || "").toLowerCase().includes(q)
            || (key.access_rights || []).join(" ").toLowerCase().includes(q);
    });

    return (
        <div className="api-key-list-container page-enter">
            <h1 className="gradient-text">{t("apikeys.title")}</h1>
            <form className="add-api-key-form glass-card" onSubmit={handleCreate} style={{margin: "16px 0"}}>
                <h3>{editingId !== null ? `${t("apikeys.edit")} #${editingId}` : t("apikeys.create")}</h3>
                <input
                    type="text"
                    placeholder={editingId !== null ? t("apikeys.keyLocked") : t("apikeys.keyPlaceholder")}
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    disabled={editingId !== null}
                />
                <div>
                    {ALL_ACCESS_RIGHTS.map((right) => (
                        <label key={right} className="check-label">
                            <input
                                type="checkbox"
                                checked={newRights.includes(right)}
                                onChange={() => toggleRight(right)}
                            />{" "}
                            {right}
                        </label>
                    ))}
                </div>
                <input
                    type="number"
                    min="1"
                    placeholder={editingId !== null ? t("apikeys.expiresEdit") : t("apikeys.expiresPlaceholder")}
                    value={newExpiresInDays}
                    onChange={(e) => setNewExpiresInDays(e.target.value)}
                />
                <input
                    type="text"
                    placeholder={t("apikeys.restrictIp")}
                    value={newIp}
                    onChange={(e) => setNewIp(e.target.value)}
                />
                <input
                    type="text"
                    placeholder={t("apikeys.restrictDomain")}
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                />
                <input
                    type="text"
                    placeholder={t("apikeys.restrictDirectory")}
                    value={newDirectory}
                    onChange={(e) => setNewDirectory(e.target.value)}
                />
                <label className="check-label">
                    <input
                        type="checkbox"
                        checked={newSingleUse}
                        onChange={(e) => setNewSingleUse(e.target.checked)}
                    />{" "}
                    {t("apikeys.singleUseLabel")}
                </label>
                <button type="submit">{editingId !== null ? t("apikeys.saveChanges") : t("apikeys.create")}</button>
                {editingId !== null && (
                    <button type="button" className="btn-ghost" onClick={resetForm} style={{marginInlineStart: "8px"}}>
                        {t("common.cancel")}
                    </button>
                )}
            </form>
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
                                <button className="edit-btn" onClick={() => handleEdit(key)}>
                                    {t("common.edit")}
                                </button>{" "}
                                <button className="delete-btn" onClick={() => setPendingDelete(key.id)}>
                                    {t("common.delete")}
                                </button>
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
