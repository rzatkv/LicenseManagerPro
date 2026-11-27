import React, {useState} from "react";
import {useNavigate} from "react-router-dom";
import {get, post} from "../utils/api";
import {formatDateTime} from "../utils/format";
import {useLanguage} from "../i18n";
import {useToast} from "../components/Toast";
import {useListFetch} from "../utils/useListFetch";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import ToggleSwitch from "../components/ToggleSwitch";
import {TableSkeleton} from "../components/Skeleton";
import "../styles/Notifications.css";

function Notifications() {
    const {t, lang} = useLanguage();
    const {toast} = useToast();
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState([]);
    const [search, setSearch] = useState("");
    const [typeFilter, setTypeFilter] = useState("");
    const [unreadOnly, setUnreadOnly] = useState(false);
    // `loading` comes from useListFetch below (it owns the fetch state).
    const [selected, setSelected] = useState(null);

    // v3.0.6: shared list fetch (loading + toast + empty fallback).
    const {loading, reload: fetchNotifications} = useListFetch(
        async () => get("/notifications?limit=50"),
        [],
        {
            onData: (data) => setNotifications(Array.isArray(data) ? data : (data.notifications || data.items || [])),
            onError: () => setNotifications([]),
        },
    );

    const markAllRead = async () => {
        try {
            await post("/notifications/read-all", {});
            setNotifications((prev) => prev.map((n) => ({...n, is_read: true})));
        } catch (err) {
            toast.error(err.message || t("common.error"));
        }
    };

    // v3.0.1: tapping a card opens a details popup (same pattern as the
    // Audit Logs details modal) — it used to navigate straight to the
    // linked page (#/downloads, #/licenses), which felt like the tap
    // did nothing useful and lost the list. Mark-read still happens
    // on open; the link is an explicit button inside the popup.
    const openNotification = async (n) => {
        try {
            if (!n.is_read) {
                await post(`/notifications/${n.id}/read`, {});
                setNotifications((prev) => prev.map((x) => (x.id === n.id ? {...x, is_read: true} : x)));
            }
        } catch (err) {
            // The popup still opens even if the read call fails.
        }
        setSelected(n);
    };

    // Distinct notification types from the loaded data (e.g. info,
    // warning, success) — shown raw, same convention as the action
    // badges on AuditLogs. All filters here are client-side over the
    // loaded list, which works in demo mode as-is.
    const types = [...new Set(notifications.map((n) => n.type).filter(Boolean))].sort();
    const filtersActive = search.trim() !== "" || typeFilter !== "" || unreadOnly;
    const visible = notifications.filter((n) => {
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            if (!(n.title || "").toLowerCase().includes(q)
                && !(n.message || "").toLowerCase().includes(q)) return false;
        }
        if (typeFilter && (n.type || "info") !== typeFilter) return false;
        if (unreadOnly && n.is_read) return false;
        return true;
    });

    const clearFilters = () => {
        setSearch("");
        setTypeFilter("");
        setUnreadOnly(false);
    };

    return (
        <div className="notifications-container page-enter">
            <h1 className="gradient-text">{t("notifications.title")}</h1>
            <div className="toolbar">
                <button className="btn-ghost" onClick={markAllRead}>{t("notifications.markAllRead")}</button>
                <div className="search-wrap">
                    <span className="search-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
                    </span>
                    <input type="text" className="search-input" placeholder={t("notifications.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <div className="filter-container">
                    <label htmlFor="notif-type-filter">{t("blacklist.type")}:</label>
                    <select id="notif-type-filter" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                        <option value="">{t("common.all")}</option>
                        {types.map((ty) => (
                            <option key={ty} value={ty}>{ty}</option>
                        ))}
                    </select>
                </div>
                <ToggleSwitch checked={unreadOnly} onChange={setUnreadOnly} label={t("notifications.unread")} />
                {filtersActive && (
                    <button type="button" className="btn-ghost" onClick={clearFilters}>{t("filters.clearAll")}</button>
                )}
            </div>
            {loading ? (
                <TableSkeleton rows={5} />
            ) : visible.length === 0 ? (
                <EmptyState title={t("notifications.noNotifications")} text={filtersActive ? t("common.noResults") : undefined} />
            ) : (
                <ul className="notif-page-list">
                    {visible.map((n) => (
                        <li key={n.id}>
                            <button type="button" className={`notif-item${n.is_read ? "" : " unread"}`} onClick={() => openNotification(n)}>
                                <span className={`notif-dot notif-${n.type || "info"}`} />
                                <span className="notif-text">
                                    <span className="notif-title">{n.title}</span>
                                    <span className="notif-message">{n.message}</span>
                                    <span className="notif-time">{formatDateTime(n.created_at, lang)}</span>
                                </span>
                                {!n.is_read && <span className="badge badge-accent">{t("notifications.unread")}</span>}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <Modal open={!!selected} title={selected ? selected.title : ""} onClose={() => setSelected(null)}>
                {selected && (<>
                    <p className="notif-modal-message">{selected.message}</p>
                    <div className="detail-row"><strong>{t("common.status")}</strong><span>{selected.is_read ? t("common.read") : t("notifications.unread")}</span></div>
                    <div className="detail-row"><strong>{t("audit.time")}</strong><span>{formatDateTime(selected.created_at, lang)}</span></div>
                    {selected.type && <div className="detail-row"><strong>{t("blacklist.type")}</strong><span>{selected.type}</span></div>}
                    <div className="row-actions modal-actions">
                        {selected.link && (
                            <button type="button" onClick={() => { const link = selected.link; setSelected(null); navigate(link); }}>
                                {t("notifications.openLink")}
                            </button>
                        )}
                        <button type="button" className="btn-ghost" onClick={() => setSelected(null)}>{t("common.close")}</button>
                    </div>
                </>)}
            </Modal>
        </div>
    );
}

export default Notifications;
