import React, {useState, useEffect, useCallback} from "react";
import {useNavigate} from "react-router-dom";
import {get, post} from "../utils/api";
import {formatDateTime} from "../utils/format";
import {useLanguage} from "../i18n";
import {useToast} from "../components/Toast";
import EmptyState from "../components/EmptyState";
import {TableSkeleton} from "../components/Skeleton";
import "../styles/Notifications.css";

function Notifications() {
    const {t, lang} = useLanguage();
    const {toast} = useToast();
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState([]);
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

    return (
        <div className="notifications-container page-enter">
            <h1 className="gradient-text">{t("notifications.title")}</h1>
            <div className="toolbar">
                <button className="btn-ghost" onClick={markAllRead}>{t("notifications.markAllRead")}</button>
            </div>
            {loading ? (
                <TableSkeleton rows={5} />
            ) : notifications.length === 0 ? (
                <EmptyState title={t("notifications.noNotifications")} />
            ) : (
                <ul className="notif-page-list">
                    {notifications.map((n) => (
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
