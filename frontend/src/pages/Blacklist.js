import React, {useState, useEffect} from "react";
import {getList, post, del} from "../utils/api";
import {formatDateTime} from "../utils/format";
import {useLanguage} from "../i18n";
import {useToast} from "../components/Toast";
import {useListFetch} from "../utils/useListFetch";
import {useLiveRefresh} from "../utils/useLiveRefresh";
import LiveIndicator from "../components/LiveIndicator";
import ConfirmModal from "../components/ConfirmModal";
import Modal from "../components/Modal";
import EmptyState from "../components/EmptyState";
import Pagination from "../components/Pagination";
import {usePageSize} from "../utils/responsive";
import {TableSkeleton} from "../components/Skeleton";
import "../styles/Blacklist.css";
import {Plus} from "lucide-react";


function Blacklist() {
    const {t, lang} = useLanguage();
    const {toast} = useToast();
    const [entries, setEntries] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = usePageSize("blacklist");
    // Breakpoint change resets to page 1 (the fetch refetches via its
    // pageSize dep below).
    useEffect(() => { setPage(1); }, [pageSize]);
    const [typeFilter, setTypeFilter] = useState("");
    const [search, setSearch] = useState("");
    // `loading` comes from useListFetch below (it owns the fetch state).
    const [type, setType] = useState("ip");
    const [value, setValue] = useState("");
    const [reason, setReason] = useState("");
    const [addOpen, setAddOpen] = useState(false);
    const [pendingDelete, setPendingDelete] = useState(null);

    // v3.0.6: shared list fetch (loading + toast + empty fallback).
    const {loading, reload: fetchEntries, reloadQuiet: fetchEntriesQuiet, lastUpdated} = useListFetch(
        async () => {
            const q = typeFilter ? `?type=${typeFilter}` : "";
            return getList(`/blacklist${q}`, {skip: (page - 1) * pageSize, limit: pageSize});
        },
        [page, pageSize, typeFilter],
        {
            onData: ({items, total: t}) => { setEntries(items); setTotal(t); },
            onError: () => { setEntries([]); setTotal(0); },
        },
    );

    // Live auto-refresh (v3.0.11): quiet 60s tick, pauses when hidden.
    useLiveRefresh(fetchEntriesQuiet);

    const handleAdd = async (e) => {
        e.preventDefault();
        if (!value.trim()) return;
        try {
            const created = await post("/blacklist", {type, value: value.trim(), reason: reason.trim() || undefined});
            if (page === 1) setEntries([created, ...entries].slice(0, pageSize));
            setTotal((prev) => prev + 1);
            setValue("");
            setReason("");
            setAddOpen(false);
            toast.success(t("blacklist.added"));
        } catch (err) {
            toast.error(err.message || t("common.error"));
        }
    };

    const handleDelete = async (id) => {
        try {
            await del(`/blacklist/${id}`);
            setEntries(entries.filter((en) => en.id !== id));
            setTotal((prev) => Math.max(0, prev - 1));
            toast.success(t("blacklist.deleted"));
        } catch (err) {
            toast.error(err.message || t("common.error"));
        }
    };

    // Client-side search over the loaded page (value / reason / type).
    // The type filter above stays server-side (?type=, supported by the
    // backend and the demo mock); search here works in demo mode as-is.
    const filtersActive = search.trim() !== "" || typeFilter !== "";
    const visible = entries.filter((en) => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return (en.value || "").toLowerCase().includes(q)
            || (en.reason || "").toLowerCase().includes(q)
            || (en.type || "").toLowerCase().includes(q);
    });

    const clearFilters = () => {
        setSearch("");
        setTypeFilter("");
        setPage(1);
    };

    return (
        <div className="blacklist-container page-enter">
            <h1 className="gradient-text">{t("blacklist.title")}</h1>
            <p className="dashboard-empty">{t("blacklist.blockedNote")}</p>

            <div className="toolbar">
                <LiveIndicator lastUpdated={lastUpdated} />
                <button type="button" onClick={() => setAddOpen(true)}><Plus size={16} />{t("blacklist.add")}</button>
                <div className="search-wrap">
                    <span className="search-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
                    </span>
                    <input type="text" className="search-input" placeholder={t("blacklist.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <div className="filter-container">
                    <label htmlFor="blacklist-type-filter">{t("blacklist.type")}:</label>
                    <select id="blacklist-type-filter" value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}>
                        <option value="">{t("common.all")}</option>
                        <option value="ip">{t("blacklist.ip")}</option>
                        <option value="domain">{t("blacklist.domain")}</option>
                    </select>
                </div>
                {filtersActive && (
                    <button type="button" className="btn-ghost" onClick={clearFilters}>{t("filters.clearAll")}</button>
                )}
            </div>

            {loading ? (
                <TableSkeleton rows={4} />
            ) : visible.length === 0 ? (
                <EmptyState title={t("blacklist.noEntries")} text={filtersActive ? t("common.noResults") : undefined} />
            ) : (
                <>
                <div className="table-wrap">
                <table>
                    <thead>
                        <tr>
                            <th>{t("blacklist.type")}</th>
                            <th>{t("blacklist.value")}</th>
                            <th>{t("blacklist.reason")}</th>
                            <th>{t("common.createdAt")}</th>
                            <th>{t("common.actions")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visible.map((en) => (
                            <tr key={en.id}>
                                <td><span className="badge badge-danger">{t(`blacklist.${en.type}`)}</span></td>
                                <td className="key-cell">{en.value}</td>
                                <td>{en.reason || "-"}</td>
                                <td className="nowrap">{formatDateTime(en.created_at, lang)}</td>
                                <td>
                                    <div className="row-actions">
                                        <button className="delete-btn" onClick={() => setPendingDelete(en.id)}>{t("common.delete")}</button>
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
            <Modal open={addOpen} title={t("blacklist.add")} onClose={() => setAddOpen(false)}>
                <form className="blacklist-form" onSubmit={handleAdd}>
                    <div className="form-row">
                        <select value={type} onChange={(e) => setType(e.target.value)} aria-label={t("blacklist.type")}>
                            <option value="ip">{t("blacklist.ip")}</option>
                            <option value="domain">{t("blacklist.domain")}</option>
                        </select>
                        <input
                            type="text"
                            placeholder={t("blacklist.valuePlaceholder")}
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            required
                        />
                        <input
                            type="text"
                            placeholder={t("blacklist.reasonPlaceholder")}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                        />
                        <button type="submit">{t("common.add")}</button>
                    </div>
                </form>
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

export default Blacklist;
