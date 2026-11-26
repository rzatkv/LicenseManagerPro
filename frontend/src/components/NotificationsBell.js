import React, {useState, useEffect, useCallback, useRef} from "react";
import {createPortal} from "react-dom";
import {useNavigate} from "react-router-dom";
import {Bell} from "lucide-react";
import {get, post} from "../utils/api";
import {formatDateTime} from "../utils/format";
import {useLanguage} from "../i18n";
import {useAnimatedOpen} from "../utils/useAnimatedOpen";
import "./NotificationsBell.css";

/**
 * Bell icon in the topbar with an unread-count badge and a dropdown panel.
 * Clicking a notification marks it read and navigates to its link.
 * Polls every 60s so a fresh notification appears without a reload.
 */
function NotificationsBell() {
    const {t, lang} = useLanguage();
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState([]);
    const [unread, setUnread] = useState(0);
    const [open, setOpen] = useState(false);
    // v3.0: the panel stays mounted ~200ms while the close animation
    // plays (useAnimatedOpen), then unmounts.
    const {visible: panelVisible, closing: panelClosing} = useAnimatedOpen(open);
    const [ringing, setRinging] = useState(false);
    const panelRef = useRef(null);
    const panelElRef = useRef(null);
    const btnRef = useRef(null);
    // Fixed-position style for the panel, clamped inside the viewport.
    // The panel used to be absolutely positioned against the bell: when
    // the topbar wraps on a narrow screen the bell sits near a viewport
    // edge and the 360px panel overflowed off-screen (clipped titles).
    // v3.0.0: the panel is rendered via a portal into document.body.
    // The topbar has backdrop-filter: blur(20px), which in Chrome makes
    // it the containing block for fixed-position descendants — the JS
    // clamp computed VIEWPORT coordinates (e.g. left 764px at 1280px)
    // but CSS applied them relative to the topbar (x=280 in LTR with
    // the docked sidebar), landing the panel 280px too far right and
    // clipping 124px off the right edge in EN on laptops. Portaling
    // makes position:fixed viewport-relative, so the clamp is correct.
    const [panelStyle, setPanelStyle] = useState(null);

    // Clamp the open panel inside the viewport (right-aligned to the bell
    // when there is room, otherwise pushed in from the edge).
    useEffect(() => {
        if (!open) return;
        const place = () => {
            const btn = btnRef.current;
            if (!btn) return;
            const r = btn.getBoundingClientRect();
            const width = Math.min(360, window.innerWidth - 16);
            const left = Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8));
            setPanelStyle({left: `${left}px`, top: `${r.bottom + 8}px`, width: `${width}px`});
        };
        place();
        window.addEventListener("resize", place);
        return () => window.removeEventListener("resize", place);
    }, [open]);

    const fetchNotifications = useCallback(async () => {
        try {
            const data = await get("/notifications?limit=10");
            const items = Array.isArray(data) ? data : (data.notifications || data.items || []);
            setNotifications(items);
            setUnread(items.filter((n) => !n.is_read).length);
        } catch (err) {
            // Notifications are best-effort: never break the topbar.
            setNotifications([]);
            setUnread(0);
        }
    }, []);

    useEffect(() => {
        fetchNotifications();
        const id = setInterval(fetchNotifications, 60000);
        return () => clearInterval(id);
    }, [fetchNotifications]);

    // Close the panel on a click outside it. The panel is portaled to
    // document.body, so it is NOT inside panelRef (the wrapper div):
    // clicks inside the panel must be checked against the panel element
    // itself, or every click on a notification would close the panel.
    // v3.0.0: Escape closes it too, like every Modal — without this, a
    // keyboard user (and the bell sweep, which closes with Escape) can
    // never dismiss the panel, and the next bell click toggles it shut
    // instead of opening it.
    useEffect(() => {
        if (!open) return;
        const onClick = (e) => {
            if (panelRef.current && panelRef.current.contains(e.target)) return;
            if (panelElRef.current && panelElRef.current.contains(e.target)) return;
            setOpen(false);
        };
        const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
        document.addEventListener("mousedown", onClick);
        document.addEventListener("keydown", onKey);
        return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
    }, [open]);

    const markAllRead = async () => {
        try {
            await post("/notifications/read-all", {});
            setNotifications((prev) => prev.map((n) => ({...n, is_read: true})));
            setUnread(0);
        } catch (err) {
            // Best-effort only.
        }
    };

    const openNotification = async (n) => {
        try {
            if (!n.is_read) {
                await post(`/notifications/${n.id}/read`, {});
                setNotifications((prev) => prev.map((x) => (x.id === n.id ? {...x, is_read: true} : x)));
                setUnread((prev) => Math.max(0, prev - 1));
            }
        } catch (err) {
            // Navigation still works even if the read call fails.
        }
        setOpen(false);
        if (n.link) navigate(n.link);
    };

    return (
        <div className="notif-bell" ref={panelRef}>
            <button
                type="button"
                className={`notif-bell-btn${ringing ? " bell-ringing" : ""}`}
                ref={btnRef}
                aria-label={t("notifications.title")}
                aria-expanded={open}
                onClick={() => {
                    setOpen((v) => !v);
                    setRinging(true);
                    setTimeout(() => setRinging(false), 600);
                }}
            >
                <Bell size={20} />
                {unread > 0 && <span key={unread} className="notif-badge">{unread > 9 ? "9+" : unread}</span>}
            </button>
            {panelVisible && createPortal(
                <div className={`notif-panel${panelClosing ? " dropdown-closing" : ""}`} role="menu" ref={panelElRef} style={panelStyle || undefined}>
                    <div className="notif-panel-head">
                        <strong>{t("notifications.title")}</strong>
                        <button type="button" className="notif-mark-all" onClick={markAllRead}>
                            {t("notifications.markAllRead")}
                        </button>
                    </div>
                    {notifications.length === 0 ? (
                        <p className="notif-empty">{t("notifications.noNotifications")}</p>
                    ) : (
                        <ul className="notif-list">
                            {notifications.map((n) => (
                                <li key={n.id}>
                                    <button type="button" className={`notif-item${n.is_read ? "" : " unread"}`} onClick={() => openNotification(n)}>
                                        <span className={`notif-dot notif-${n.type || "info"}`} />
                                        <span className="notif-text">
                                            <span className="notif-title">{n.title}</span>
                                            <span className="notif-message">{n.message}</span>
                                            <span className="notif-time">{formatDateTime(n.created_at, lang)}</span>
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    <button type="button" className="notif-view-all" onClick={() => { setOpen(false); navigate("/notifications"); }}>
                        {t("notifications.viewAll")}
                    </button>
                </div>,
                document.body
            )}
        </div>
    );
}

export default NotificationsBell;
