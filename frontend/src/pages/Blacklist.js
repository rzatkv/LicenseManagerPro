import React, {useState, useEffect, useCallback} from "react";
import {getList, post, del} from "../utils/api";
import {formatDateTime} from "../utils/format";
import {useLanguage} from "../i18n";
import {useToast} from "../components/Toast";
import ConfirmModal from "../components/ConfirmModal";
import EmptyState from "../components/EmptyState";
import Pagination from "../components/Pagination";
import {TableSkeleton} from "../components/Skeleton";
import "../styles/Blacklist.css";

const PAGE_SIZE = 10;

function Blacklist() {
    const {t, lang} = useLanguage();
    const {toast} = useToast();
    const [entries, setEntries] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [typeFilter, setTypeFilter] = useState("");
    const [loading, setLoading] = useState(true);
    const [type, setType] = useState("ip");
    const [value, setValue] = useState("");
    const [reason, setReason] = useState("");
    const [pendingDelete, setPendingDelete] = useState(null);

    const fetchEntries = useCallback(async () => {
        setLoading(true);
        try {
            const q = typeFilter ? `?type=${typeFilter}` : "";
            const {items, total: t} = await getList(`/blacklist${q}`, {skip: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE});
            setEntries(items);
            setTotal(t);
        } catch (err) {
            toast.error(err.message || t("common.failedFetch"));
            setEntries([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    }, [page, typeFilter, toast, t]);

    useEffect(() => { fetchEntries(); }, [fetchEntries]);

    const handleAdd = async (e) => {
        e.preventDefault();
        if (!value.trim()) return;
        try {
            const created = await post("/blacklist", {type, value: value.trim(), reason: reason.trim() || undefined});
            if (page === 1) setEntries([created, ...entries].slice(0, PAGE_SIZE));
            setTotal((prev) => prev + 1);
            setValue("");
            setReason("");
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

    return (
        <div className="blacklist-container page-enter">
            <h1 className="gradient-text">{t("blacklist.title")}</h1>
            <p className="dashboard-empty">{t("blacklist.blockedNote")}</p>

            <form className="blacklist-form glass-card" onSubmit={handleAdd}>
                <h3>{t("blacklist.add")}</h3>
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

            <div className="toolbar">
                <div className="filter-container">
                    <label htmlFor="blacklist-type-filter">{t("blacklist.type")}:</label>
                    <select id="blacklist-type-filter" value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}>
                        <option value="">{t("common.all")}</option>
                        <option value="ip">{t("blacklist.ip")}</option>
                        <option value="domain">{t("blacklist.domain")}</option>
                    </select>
                </div>
            </div>

            {loading ? (
                <TableSkeleton rows={4} />
            ) : entries.length === 0 ? (
                <EmptyState title={t("blacklist.noEntries")} />
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
                        {entries.map((en) => (
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

export default Blacklist;
