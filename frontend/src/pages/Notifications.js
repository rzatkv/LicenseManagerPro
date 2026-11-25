import React, {useState, useEffect, useCallback} from "react";
import {useNavigate} from "react-router-dom";
import {get, post} from "../utils/api";
import {formatDateTime} from "../utils/format";
import {useLanguage} from "../i18n";
import {useToast} from "../components/Toast";
import EmptyState from "../components/EmptyState";
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
    const [loading, setLoading] = useState(true);

    const fetchNotifications = useCallback(async () => {
        setLoading(true);
        try {
            const data = await get("/notifications?limit=50");
            setNotifications(Array.isArray(data) ? data : (data.notifications || data.items || []));
        } catch (err) {
            toast.error(err.message || t("common.failedFetch"));
            setNotifications([]);
        } finally {
            setLoading(false);
        }
    }, [toast, t]);

    useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

    const markAllRead = async () => {
        try {
            await post("/notifications/read-all", {});
            setNotifications((prev) => prev.map((n) => ({...n, is_read: true})));
        } catch (err) {
            toast.error(err.message || t("common.error"));
        }
    };

    const openNotification = async (n) => {
        try {
            if (!n.is_read) {
                await post(`/notifications/${n.id}/read`, {});
                setNotifications((prev) => prev.map((x) => (x.id === n.id ? {...x, is_read: true} : x)));
            }
        } catch (err) {
            // Navigation still works even if the read call fails.
        }
        if (n.link) navigate(n.link);
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
        </div>
    );
}

export default Notifications;
