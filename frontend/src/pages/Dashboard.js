import React, {useEffect, useState, useCallback, useMemo, useRef} from "react";
import {Link, useNavigate} from "react-router-dom";
import {get, post, put} from "../utils/api";
import {formatDate, formatDateTime, formatDayShort, formatMonthShort} from "../utils/format";
import {useLanguage} from "../i18n";
import {useToast} from "../components/Toast";
import {SkeletonCard} from "../components/Skeleton";
import Modal from "../components/Modal";
import "../styles/Dashboard.css";

const daysLeft = (expiresAt) => {
    if (!expiresAt) return null;
    return Math.ceil((new Date(expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
};

const STATUS_COLORS = {active: "var(--success)", inactive: "var(--muted-2)", expired: "var(--danger)", revoked: "var(--warning)"};

function DonutChart({data, title, t}) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        const id = requestAnimationFrame(() => setMounted(true));
        return () => cancelAnimationFrame(id);
    }, []);
    const total = Object.values(data).reduce((a, b) => a + b, 0);
    const size = 180;
    const r = 70;
    const cx = size / 2;
    const cy = size / 2;
    const circumference = 2 * Math.PI * r;
    let offset = 0;
    const segments = Object.entries(data).filter(([, v]) => v > 0).map(([key, value]) => {
        const frac = total ? value / total : 0;
        const dash = mounted ? frac * circumference : 0;
        const seg = {key, value, dash, offset};
        offset += frac * circumference;
        return seg;
    });
    return (
        <div className="chart-card">
            <h3>{title}</h3>
            {total === 0 ? <p className="dashboard-empty">—</p> : (
                <div className="chart-body">
                    <svg className="chart-anim" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={title}>
                        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-2)" strokeWidth="28" />
                        {segments.map((s) => (
                            <circle key={s.key} className="chart-seg" cx={cx} cy={cy} r={r} fill="none"
                                stroke={STATUS_COLORS[s.key] || "var(--accent)"} strokeWidth="28"
                                strokeDasharray={`${s.dash} ${circumference - s.dash}`}
                                strokeDashoffset={-s.offset}
                                transform={`rotate(-90 ${cx} ${cy})`} />
                        ))}
                        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill="var(--text)" fontSize="22" fontWeight="bold">{total}</text>
                    </svg>
                    <ul className="chart-legend">
                        {segments.map((s) => (
                            <li key={s.key}>
                                <span className="legend-dot" style={{background: STATUS_COLORS[s.key] || "var(--accent)"}} />
                                {t(`common.${s.key}`) !== `common.${s.key}` ? t(`common.${s.key}`) : s.key}: {s.value}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

function BarChart({data, title, color}) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        const id = requestAnimationFrame(() => setMounted(true));
        return () => cancelAnimationFrame(id);
    }, []);
    const max = Math.max(1, ...data.map((d) => d.value));
    const width = 320;
    const height = 190;
    const barW = Math.min(40, (width - 20) / Math.max(1, data.length) - 8);
    // Long labels wrap onto two lines instead of being truncated ("CloudPanel P…").
    const splitLabel = (label) => {
        if (label.length <= 10) return [label];
        const mid = Math.floor(label.length / 2);
        const cut = label.indexOf(" ", Math.max(0, mid - 3)) || label.lastIndexOf(" ", mid);
        const at = (cut > 0 ? cut : label.lastIndexOf(" ", mid));
        if (at <= 0) return [label];
        return [label.slice(0, at), label.slice(at + 1)];
    };
    return (
        <div className="chart-card">
            <h3>{title}</h3>
            <svg className="chart-anim" width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title} preserveAspectRatio="xMidYMid meet">
                {data.map((d, i) => {
                    const h = mounted ? (d.value / max) * (height - 60) : 0;
                    const x = 10 + i * ((width - 20) / Math.max(1, data.length)) + (((width - 20) / Math.max(1, data.length)) - barW) / 2;
                    const lines = splitLabel(d.label);
                    return (
                        <g key={d.label}>
                            <rect x={x} y={height - 36 - h} width={barW} height={h} rx="3" fill={color} />
                            <text x={x + barW / 2} y={height - 40 - h} textAnchor="middle" fill="var(--text)" fontSize="11">{d.value}</text>
                            {lines.map((line, li) => (
                                <text key={li} x={x + barW / 2} y={height - 18 + li * 11} textAnchor="middle" fill="var(--muted)" fontSize="9">{line}</text>
                            ))}
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

/** 14-day area/line chart of licenses created per day (v2.2). */
function TrendChart({points, title, lang}) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        const id = requestAnimationFrame(() => setMounted(true));
        return () => cancelAnimationFrame(id);
    }, []);
    const width = 640;
    const height = 200;
    const padL = 28;
    const padR = 10;
    const padT = 14;
    const padB = 38;
    const max = Math.max(1, ...points.map((p) => p.count));
    const n = Math.max(1, points.length);
    const x = (i) => padL + (i * (width - padL - padR)) / Math.max(1, n - 1);
    const y = (v) => padT + (1 - v / max) * (height - padT - padB);
    const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${(mounted ? y(p.count) : y(0)).toFixed(1)}`).join(" ");
    const area = `${line} L${x(n - 1).toFixed(1)},${height - padB} L${x(0).toFixed(1)},${height - padB} Z`;
    // Unique integer ticks only: [0, max/2, max] rounded duplicates when
    // max is 1 (Math.round(0.5) === 1), rendering "0, 1, 1".
    const ticks = [...new Set([0, Math.round(max / 2), max])].sort((a, b) => a - b);
    return (
        <div className="chart-card chart-card-wide">
            <h3>{title}</h3>
            {points.length === 0 ? <p className="dashboard-empty">—</p> : (
                <svg className="chart-anim" width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title} preserveAspectRatio="xMidYMid meet">
                    <defs>
                        <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
                            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
                        </linearGradient>
                    </defs>
                    {ticks.map((v) => (
                        <g key={v}>
                            <line x1={padL} x2={width - padR} y1={y(v)} y2={y(v)} stroke="var(--border)" strokeWidth="1" />
                            <text x={padL - 4} y={y(v) + 3} textAnchor="end" fill="var(--muted)" fontSize="10">{v}</text>
                        </g>
                    ))}
                    <path d={area} fill="url(#trend-fill)" />
                    <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                    {points.map((p, i) => (
                        <circle key={p.date} cx={x(i)} cy={mounted ? y(p.count) : y(0)} r="3.5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="1.5">
                            <title>{`${formatDayShort(new Date(p.date), lang)}: ${p.count}`}</title>
                        </circle>
                    ))}
                    {/* Every third day only, at 11px: 14 labels at 9px were
                        tiny and cramped in Persian ("۴ آذر" etc.). */}
                    {points.map((p, i) => (i % 3 === 0 ? (
                        <text key={p.date} x={x(i)} y={height - 14} textAnchor="middle" fill="var(--muted)" fontSize="11">
                            {formatDayShort(new Date(p.date), lang)}
                        </text>
                    ) : null))}
                </svg>
            )}
        </div>
    );
}

/** Webhook delivery stats widget (v2.3): overall success rate + a row
 * per event with a small success bar. */
function WebhookStatsWidget({stats, title, t}) {
    if (!stats) return (
        <div className="chart-card">
            <h3>{title}</h3>
            <p className="dashboard-empty">—</p>
        </div>
    );
    const events = Object.entries(stats.by_event || {}).sort((a, b) => b[1].total - a[1].total);
    return (
        <div className="chart-card">
            <h3>{title}</h3>
            <div className="webhook-rate">
                <span className="webhook-rate-value">{stats.success_rate}%</span>
                <span className="webhook-rate-label">{t("dashboard.webhookSuccessRate")}</span>
            </div>
            <p className="webhook-totals">{stats.success} ✓ · {stats.failed} ✗ · {stats.total} total</p>
            <ul className="chart-legend webhook-events">
                {events.map(([event, e]) => {
                    const pct = e.total ? Math.round((100 * e.success) / e.total) : 100;
                    return (
                        <li key={event}>
                            <span className="webhook-event-name">{event}</span>
                            <span className="webhook-event-bar"><span style={{width: `${pct}%`}} /></span>
                            <span className="webhook-event-pct">{pct}%</span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

/** Sending activity chart (v3.0): per-day sent (green) + failed (red)
 * bars for one channel (or all channels combined). */
function SendingChart({series, title, t}) {
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        const id = requestAnimationFrame(() => setMounted(true));
        return () => cancelAnimationFrame(id);
    }, []);
    const width = 640;
    const height = 200;
    const padL = 28;
    const padR = 10;
    const padT = 14;
    const padB = 34;
    const max = Math.max(1, ...series.map((d) => d.sent + d.failed));
    const n = Math.max(1, series.length);
    const slot = (width - padL - padR) / n;
    const barW = Math.min(14, slot / 2 - 2);
    const y = (v) => padT + (1 - v / max) * (height - padT - padB);
    const total = series.reduce((a, d) => a + d.sent + d.failed, 0);
    return (
        <div className="chart-card chart-card-wide">
            <h3>{title}</h3>
            {total === 0 ? <p className="dashboard-empty">{t("dashboard.sendingNoData")}</p> : (
                <svg className="chart-anim" width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title} preserveAspectRatio="xMidYMid meet">
                    {series.map((d, i) => {
                        const x0 = padL + i * slot + (slot - barW * 2 - 2) / 2;
                        const sentH = mounted ? (d.sent / max) * (height - padT - padB) : 0;
                        const failedH = mounted ? (d.failed / max) * (height - padT - padB) : 0;
                        return (
                            <g key={d.date}>
                                <rect x={x0} y={height - padB - sentH} width={barW} height={sentH} rx="2" fill="var(--success)">
                                    <title>{`${d.date}: ${t("dashboard.sendingSent")} ${d.sent}`}</title>
                                </rect>
                                <rect x={x0 + barW + 2} y={height - padB - failedH} width={barW} height={failedH} rx="2" fill="var(--danger)">
                                    <title>{`${d.date}: ${t("dashboard.sendingFailed")} ${d.failed}`}</title>
                                </rect>
                                {i % Math.ceil(n / 7) === 0 && (
                                    <text x={padL + i * slot + slot / 2} y={height - 12} textAnchor="middle" fill="var(--muted)" fontSize="10">
                                        {d.date.slice(5)}
                                    </text>
                                )}
                            </g>
                        );
                    })}
                    <line x1={padL} x2={width - padR} y1={height - padB} y2={height - padB} stroke="var(--border)" strokeWidth="1" />
                </svg>
            )}
            <p className="chart-legend-line">
                <span className="legend-dot" style={{background: "var(--success)"}} /> {t("dashboard.sendingSent")}
                {" · "}
                <span className="legend-dot" style={{background: "var(--danger)"}} /> {t("dashboard.sendingFailed")}
            </p>
        </div>
    );
}

// --- Customizable dashboard widgets (v2.3, extended v3.0) -----------------
const WIDGET_IDS = ["trend", "status", "perMonth", "byProduct", "activations", "webhooks", "services", "sending"];
const WIDGET_TABS = {
    trend: "trends", status: "status", perMonth: "monthly", byProduct: "monthly",
    activations: "trends", webhooks: "status", services: "services", sending: "sending",
};
const TAB_ORDER = ["overview", "highlights", "trends", "status", "monthly", "activity", "apikeys", "users", "services", "sending"];
// Tabs that exist only because of widgets: hidden when all their widgets
// are turned off in the gear popup.
const WIDGET_TABS_ONLY = ["trends", "status", "monthly", "services", "sending"];
const DEFAULT_LAYOUT = {
    order: [...WIDGET_IDS],
    sizes: {trend: "L", status: "M", perMonth: "M", byProduct: "M", activations: "L", webhooks: "M", services: "L", sending: "L"},
    ranges: {trend: 14, activations: 14, perMonth: 6, byProduct: 90, sending: 14},
    hidden: {},
};
const LAYOUT_KEY = "lmp-dashboard-layout";
const TAB_KEY = "lmp-dashboard-tab";
const RANGE_OPTIONS = [7, 14, 30, 90];
const MONTH_OPTIONS = [3, 6, 12];
const SERVICE_REFRESH_SECONDS = 300;

function readLayout() {
    try {
        const raw = localStorage.getItem(LAYOUT_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.order)) return null;
        return {
            order: [...new Set([...parsed.order, ...WIDGET_IDS])].filter((id) => WIDGET_IDS.includes(id)),
            sizes: {...DEFAULT_LAYOUT.sizes, ...(parsed.sizes || {})},
            ranges: {...DEFAULT_LAYOUT.ranges, ...(parsed.ranges || {})},
            hidden: {...(parsed.hidden || {})},
        };
    } catch (e) {
        return null;
    }
}

function readTab() {
    try {
        const tab = localStorage.getItem(TAB_KEY);
        return TAB_ORDER.includes(tab) ? tab : "overview";
    } catch (e) {
        return "overview";
    }
}

function Dashboard() {
    const {t, lang} = useLanguage();
    const {toast} = useToast();
    const [summary, setSummary] = useState(null);
    const [licenses, setLicenses] = useState([]);
    const [apiKeys, setApiKeys] = useState([]);
    const [users, setUsers] = useState([]);
    const [trend, setTrend] = useState([]);
    const [activations, setActivations] = useState([]);
    const [webhookStats, setWebhookStats] = useState(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [slide, setSlide] = useState(0);
    const [paused, setPaused] = useState(false);
    // Customizable widgets (v2.3): order, size (S/M/L), chart range and
    // visibility persist per user (localStorage first, backend too).
    const [layout, setLayout] = useState(() => readLayout() || DEFAULT_LAYOUT);
    const [customizing, setCustomizing] = useState(false);
    const [gearOpen, setGearOpen] = useState(false);
    const [activeTab, setActiveTab] = useState(() => readTab());
    // Narrow viewports (<640px) show fewer rows in the dashboard's recent
    // lists (responsive page size, same pattern as the list pages): the
    // 5-row recent-licenses table is 466px tall at 360px in fa and pushes
    // the Activity tab 157px past the viewport.
    const [isNarrow, setIsNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches);
    useEffect(() => {
        const mq = window.matchMedia("(max-width: 640px)");
        const onChange = (e) => setIsNarrow(e.matches);
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, []);
    const recentCount = isNarrow ? 3 : 5;
    // One panel at a time inside the four stacked tabs (v3.0): the Trends
    // tab holds two full-width charts, the Status tab a donut + the webhook
    // stats, the Monthly tab two bar charts, and the Activity tab two
    // tables — stacked they overflow at 360px and at 1366x768, so each
    // gets a mini-tab switcher (split, never squeeze).
    const [trendView, setTrendView] = useState("trend");
    const [statusView, setStatusView] = useState("status");
    const [monthlyView, setMonthlyView] = useState("perMonth");
    const [activityView, setActivityView] = useState("expiring");
    // Service status (v3.0): lazy, non-blocking — fetched only when the
    // Services tab opens, never before the dashboard renders.
    const [serviceStatus, setServiceStatus] = useState(null);
    const [serviceLoading, setServiceLoading] = useState(false);
    const [serviceCheckedAt, setServiceCheckedAt] = useState(null);
    const [serviceCountdown, setServiceCountdown] = useState(SERVICE_REFRESH_SECONDS);
    // IPPanel SMS balance (v3.0): same lazy pattern — fetched only on
    // the Services tab, never blocks the dashboard render. The backend
    // caches the credit ~5 minutes; refresh=true forces a live call.
    const [smsBalance, setSmsBalance] = useState(null);
    const [smsBalanceLoading, setSmsBalanceLoading] = useState(false);
    // Sending charts (v3.0): lazy too — fetched only on the Sending tab.
    const [sendingStats, setSendingStats] = useState(null);
    const [sendingLoading, setSendingLoading] = useState(false);
    const [sendingChannel, setSendingChannel] = useState("total");
    const navigate = useNavigate();

    const isVisible = (id) => !layout.hidden[id];
    const visibleTabs = useMemo(() => TAB_ORDER.filter((tab) => {
        if (!WIDGET_TABS_ONLY.includes(tab)) return true;
        return WIDGET_IDS.some((id) => WIDGET_TABS[id] === tab && isVisible(id));
    }), [layout.hidden]);
    const effectiveTab = visibleTabs.includes(activeTab) ? activeTab : visibleTabs[0] || "overview";

    useEffect(() => {
        try { localStorage.setItem(TAB_KEY, effectiveTab); } catch (e) {}
    }, [effectiveTab]);

    // Load a saved layout from the backend when nothing is stored
    // locally (same pattern as the theme provider).
    useEffect(() => {
        if (readLayout()) return;
        get("/users/me/preferences").then((data) => {
            const saved = data && data.preferences && data.preferences.dashboard;
            if (saved && Array.isArray(saved.order)) {
                setLayout({
                    order: [...new Set([...saved.order, ...WIDGET_IDS])].filter((id) => WIDGET_IDS.includes(id)),
                    sizes: {...DEFAULT_LAYOUT.sizes, ...(saved.sizes || {})},
                    ranges: {...DEFAULT_LAYOUT.ranges, ...(saved.ranges || {})},
                    hidden: {...(saved.hidden || {})},
                });
            }
        }).catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Persist every layout change (local + backend, fire-and-forget).
    useEffect(() => {
        try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch (e) {}
        put("/users/me/preferences", {key: "dashboard", value: layout}).catch(() => {});
    }, [layout]);

    // Trend + activations charts refetch when their range changes.
    useEffect(() => {
        get(`/dashboard/license-trend?days=${layout.ranges.trend}`)
            .then((d) => setTrend(Array.isArray(d.points) ? d.points : []))
            .catch(() => setTrend([]));
    }, [layout.ranges.trend]);
    useEffect(() => {
        get(`/dashboard/activations-trend?days=${layout.ranges.activations}`)
            .then((d) => setActivations(Array.isArray(d.points) ? d.points : []))
            .catch(() => setActivations([]));
    }, [layout.ranges.activations]);

    // Service status: fetch on demand (tab opens or manual re-check).
    const fetchServiceStatus = useCallback(async () => {
        setServiceLoading(true);
        try {
            const data = await get("/system/service-status");
            setServiceStatus(Array.isArray(data.services) ? data.services : []);
            setServiceCheckedAt(data.checked_at || new Date().toISOString());
            setServiceCountdown(SERVICE_REFRESH_SECONDS);
        } catch (err) {
            setServiceStatus([]);
            toast.error(err.message || t("common.error"));
        } finally {
            setServiceLoading(false);
        }
    }, [toast, t]);
    useEffect(() => {
        if (effectiveTab === "services" && serviceStatus === null) fetchServiceStatus();
    }, [effectiveTab, serviceStatus, fetchServiceStatus]);
    // SMS balance: fetch on demand with the Services tab (same trigger
    // as the service status); a failed fetch degrades to the
    // "unavailable" state instead of spinning forever.
    const fetchSmsBalance = useCallback(async (refresh = false) => {
        setSmsBalanceLoading(true);
        try {
            const data = await get(refresh ? "/sms/balance?refresh=1" : "/sms/balance");
            setSmsBalance(data || {available: false, error: "unavailable"});
        } catch (err) {
            setSmsBalance({available: false, error: "unavailable"});
        } finally {
            setSmsBalanceLoading(false);
        }
    }, []);
    useEffect(() => {
        if (effectiveTab === "services" && smsBalance === null) fetchSmsBalance();
    }, [effectiveTab, smsBalance, fetchSmsBalance]);
    // Auto-refresh every 5 minutes while the Services tab is open, with
    // a visible countdown; the page never waits for a check. The SMS
    // balance refreshes on the same tick (the backend caches the credit
    // ~5 minutes, so this costs no extra live call).
    useEffect(() => {
        if (effectiveTab !== "services") return;
        const id = setInterval(() => {
            setServiceCountdown((c) => {
                if (c <= 1) {
                    fetchServiceStatus();
                    fetchSmsBalance();
                    return SERVICE_REFRESH_SECONDS;
                }
                return c - 1;
            });
        }, 1000);
        return () => clearInterval(id);
    }, [effectiveTab, fetchServiceStatus, fetchSmsBalance]);

    // Sending stats: fetch on demand (tab opens, range or channel change
    // only re-fetches on range — the channel switch is client-side).
    useEffect(() => {
        if (effectiveTab !== "sending") return;
        setSendingLoading(true);
        get(`/system/sending-stats?days=${layout.ranges.sending}`)
            .then((d) => setSendingStats(d && d.series ? d.series : null))
            .catch(() => setSendingStats(null))
            .finally(() => setSendingLoading(false));
    }, [effectiveTab, layout.ranges.sending]);

    const slides = useMemo(() => [
        {title: t("dashboard.slide1Title"), text: t("dashboard.slide1Text")},
        {title: t("dashboard.slide2Title"), text: t("dashboard.slide2Text")},
        {title: t("dashboard.slide3Title"), text: t("dashboard.slide3Text")},
    ], [t]);

    useEffect(() => {
        if (paused) return;
        const id = setInterval(() => setSlide((s) => (s + 1) % slides.length), 5000);
        return () => clearInterval(id);
    }, [paused, slides.length]);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const [summaryData, licensesData, keysData, usersData, webhookData] = await Promise.all([
                get("/dashboard/summary"),
                get("/licenses?filter=all"),
                get("/api-keys"),
                get("/users"),
                get("/dashboard/webhook-stats").catch(() => null),
            ]);
            setSummary(summaryData);
            setLicenses(licensesData);
            setApiKeys(keysData.api_keys || []);
            setUsers(usersData);
            setWebhookStats(webhookData);
            setError("");
        } catch (err) {
            if (err.status === 401) { navigate("/"); return; }
            setError(err.message || t("common.failedFetch"));
            toast.error(err.message || t("common.failedFetch"));
        } finally {
            setLoading(false);
        }
    }, [navigate, t, toast]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const handleRenew = async (id) => {
        try {
            const renewed = await post(`/licenses/${id}/renew`, {});
            setLicenses((prev) => prev.map((lic) => (lic.id === id ? renewed : lic)));
            toast.success(t("dashboard.renewed"));
            const summaryData = await get("/dashboard/summary");
            setSummary(summaryData);
        } catch (err) {
            toast.error(err.message || t("common.error"));
        }
    };

    const statusCounts = useMemo(() => {
        const counts = {active: 0, inactive: 0, expired: 0, revoked: 0};
        for (const lic of licenses) {
            const s = lic.status;
            if (counts[s] !== undefined) counts[s] += 1;
            else counts[s] = 1;
        }
        return counts;
    }, [licenses]);

    const perMonth = useMemo(() => {
        const months = [];
        const now = new Date();
        const count = layout.ranges.perMonth || 6;
        for (let i = count - 1; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            const label = formatMonthShort(d, lang);
            const n = licenses.filter((l) => l.created_at && l.created_at.slice(0, 7) === key).length;
            months.push({label, value: n});
        }
        return months;
    }, [licenses, lang, layout.ranges.perMonth]);

    const byProduct = useMemo(() => {
        const days = layout.ranges.byProduct || 90;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        const map = {};
        for (const lic of licenses) {
            if (!lic.created_at || new Date(lic.created_at) < cutoff) continue;
            const name = lic.product || "-";
            map[name] = (map[name] || 0) + 1;
        }
        return Object.entries(map).map(([label, value]) => ({label, value}))
            .sort((a, b) => b.value - a.value).slice(0, 6);
    }, [licenses, layout.ranges.byProduct]);

    if (error && !summary) {
        return (
            <div className="dashboard-container page-enter">
                <div className="glass-card error-boundary">
                    <h1 className="gradient-text">{t("common.errorTitle")}</h1>
                    <p style={{color: "var(--muted)"}}>{error}</p>
                    <button onClick={fetchAll}>{t("common.retry")}</button>
                </div>
            </div>
        );
    }

    if (loading || !summary) {
        return (
            <div className="dashboard-container page-enter">
                <h1 className="gradient-text">{t("dashboard.title")}</h1>
                <SkeletonCard lines={2} />
                <div className="dashboard-summary">
                    {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} lines={2} />)}
                </div>
                <SkeletonCard lines={4} />
            </div>
        );
    }

    const expiringSoon = licenses
        .filter((lic) => { const left = daysLeft(lic.expires_at); return lic.status === "active" && left !== null && left <= 30; })
        .sort((a, b) => daysLeft(a.expires_at) - daysLeft(b.expires_at));
    const recentLicenses = [...licenses].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, recentCount);
    const recentApiKeys = [...apiKeys].sort((a, b) => b.id - a.id).slice(0, recentCount);
    const recentUsers = [...users].sort((a, b) => b.id - a.id).slice(0, recentCount);

    // One widget card, with its own range control directly underneath the
    // chart (v3.0: per-chart ranges, independent, persisted in the layout).
    const renderWidget = (id, index) => {
        const size = layout.sizes[id] || "M";
        const move = (dir) => {
            setLayout((prev) => {
                const order = [...prev.order];
                const j = order.indexOf(id) + dir;
                if (j < 0 || j >= order.length) return prev;
                [order[index], order[j]] = [order[j], order[index]];
                return {...prev, order};
            });
        };
        const rangeControl = (rangeKey, options, unitKey) => (
            <div className="chart-range" role="group" aria-label={t("dashboard.range")}>
                <span className="chart-range-label">{t("dashboard.range")}</span>
                {options.map((d) => (
                    <button
                        key={d}
                        type="button"
                        className={layout.ranges[rangeKey] === d ? "chart-range-btn active" : "chart-range-btn"}
                        aria-pressed={layout.ranges[rangeKey] === d}
                        onClick={() => setLayout((prev) => ({...prev, ranges: {...prev.ranges, [rangeKey]: d}}))}
                    >
                        {d} {t(unitKey)}
                    </button>
                ))}
            </div>
        );
        return (
            <div
                key={id}
                className={`dashboard-widget widget-size-${size.toLowerCase()}${customizing ? " widget-customizing" : ""}`}
                draggable={customizing}
                onDragStart={(e) => { e.dataTransfer.setData("text/plain", id); }}
                onDragOver={(e) => { if (customizing) e.preventDefault(); }}
                onDrop={(e) => {
                    e.preventDefault();
                    const dragged = e.dataTransfer.getData("text/plain");
                    if (!dragged || dragged === id) return;
                    setLayout((prev) => {
                        const order = prev.order.filter((x) => x !== dragged);
                        order.splice(order.indexOf(id), 0, dragged);
                        return {...prev, order};
                    });
                }}
            >
                {customizing && (
                    <div className="widget-controls">
                        <span className="widget-drag-handle" title={t("dashboard.customize")}>⠿</span>
                        <span className="widget-control-group">
                            <span className="widget-control-label">{t("dashboard.size")}</span>
                            {["S", "M", "L"].map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    className={size === s ? "widget-size-btn active" : "widget-size-btn"}
                                    aria-pressed={size === s}
                                    onClick={() => setLayout((prev) => ({...prev, sizes: {...prev.sizes, [id]: s}}))}
                                >
                                    {t(`dashboard.size${s}`)}
                                </button>
                            ))}
                        </span>
                        <span className="widget-control-group">
                            <button type="button" className="widget-move-btn" disabled={index === 0} onClick={() => move(-1)} aria-label="↑">↑</button>
                            <button type="button" className="widget-move-btn" disabled={index === layout.order.length - 1} onClick={() => move(1)} aria-label="↓">↓</button>
                        </span>
                    </div>
                )}
                {id === "trend" && (
                    <>
                        <TrendChart points={trend} title={`${t("dashboard.trendTitle")} · ${layout.ranges.trend} ${t("common.days")}`} lang={lang} />
                        {rangeControl("trend", RANGE_OPTIONS, "common.days")}
                    </>
                )}
                {id === "status" && <DonutChart data={statusCounts} title={t("dashboard.byStatus")} t={t} />}
                {id === "perMonth" && (
                    <>
                        <BarChart data={perMonth} title={t("dashboard.createdPerMonth")} color="var(--accent)" />
                        {rangeControl("perMonth", MONTH_OPTIONS, "common.months")}
                    </>
                )}
                {id === "byProduct" && (
                    <>
                        <BarChart data={byProduct} title={t("dashboard.byProduct")} color="var(--success)" />
                        {rangeControl("byProduct", RANGE_OPTIONS, "common.days")}
                    </>
                )}
                {id === "activations" && (
                    <>
                        <TrendChart points={activations} title={`${t("dashboard.activationsTrend")} · ${layout.ranges.activations} ${t("common.days")}`} lang={lang} />
                        {rangeControl("activations", RANGE_OPTIONS, "common.days")}
                    </>
                )}
                {id === "webhooks" && <WebhookStatsWidget stats={webhookStats} title={t("dashboard.webhookStats")} t={t} />}
            </div>
        );
    };

    const tabWidgets = (tab) => layout.order.filter((id) => WIDGET_TABS[id] === tab && isVisible(id));

    const countdownText = () => {
        const m = Math.floor(serviceCountdown / 60);
        const s = serviceCountdown % 60;
        return `${m}:${String(s).padStart(2, "0")}`;
    };

    const statusDot = (status) => ({
        connected: "var(--success)",
        not_configured: "var(--muted-2)",
        auth_failed: "var(--warning)",
        unreachable: "var(--danger)",
    }[status] || "var(--muted-2)");

    return (
        <div className="dashboard-container page-enter">
            <div className="dashboard-header">
                <span className="dashboard-title gradient-text">{t("dashboard.title")}</span>
                <div className="dashboard-header-actions">
                    <button
                        type="button"
                        className="btn-ghost dashboard-gear-btn"
                        aria-label={t("dashboard.widgetVisibility")}
                        title={t("dashboard.widgetVisibility")}
                        onClick={() => setGearOpen(true)}
                    >
                        ⚙
                    </button>
                    <button
                        type="button"
                        className="btn-ghost"
                        aria-pressed={customizing}
                        onClick={() => setCustomizing((v) => !v)}
                    >
                        {t("dashboard.customize")}
                    </button>
                </div>
            </div>

            <div className="dashboard-tabs" role="tablist" aria-label={t("dashboard.title")}>
                {visibleTabs.map((tab) => (
                    <button
                        key={tab}
                        type="button"
                        role="tab"
                        aria-selected={effectiveTab === tab}
                        className={effectiveTab === tab ? "dashboard-tab active" : "dashboard-tab"}
                        onClick={() => setActiveTab(tab)}
                    >
                        {t(`dashboard.tabs.${tab}`)}
                    </button>
                ))}
            </div>

            <div className="dashboard-tab-panel" key={effectiveTab}>
                {effectiveTab === "overview" && (
                    <>
                        {/* No financial card: this is not a financial system (v2.3) —
                            the Estimated MRR card was removed entirely. */}
                        <div className="dashboard-summary">
                            {[
                                {label: t("dashboard.apiKeys"), value: summary.apiKeysCount},
                                {label: t("dashboard.users"), value: summary.usersCount},
                                {label: t("dashboard.activeLicenses"), value: summary.activeLicenses},
                                {label: t("dashboard.inactiveLicenses"), value: summary.inactiveLicenses},
                            ].map((box, i) => (
                                <div key={box.label} className="summary-box glass-card stagger-item" style={{animationDelay: `${i * 70}ms`}}>
                                    <h2>{box.label}</h2>
                                    <p>{box.value}</p>
                                </div>
                            ))}
                        </div>
                        <div className="dashboard-actions">
                            <h2>{t("dashboard.quickActions")}</h2>
                            <div className="action-buttons">
                                <Link className="action-btn" to="/licenses">{t("dashboard.createLicense")}</Link>
                                <Link className="action-btn" to="/api-keys">{t("dashboard.createApiKey")}</Link>
                                <Link className="action-btn" to="/users">{t("dashboard.addUser")}</Link>
                                <Link className="action-btn" to="/products">{t("nav.products")}</Link>
                                <Link className="action-btn" to="/docs">{t("nav.apiDocs")}</Link>
                                <Link className="action-btn" to="/settings">{t("dashboard.settings")}</Link>
                            </div>
                        </div>
                    </>
                )}

                {effectiveTab === "highlights" && (
                    <div className="highlights-slider glass-card" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
                        <div className="slide slide-fade" key={slide}>
                            <h3>{slides[slide].title}</h3>
                            <p>{slides[slide].text}</p>
                        </div>
                        <div className="slider-dots">
                            {slides.map((_, i) => (
                                <button key={i} className={`slider-dot${i === slide ? " active" : ""}`} aria-label={`${t("dashboard.slide")} ${i + 1}`} onClick={() => setSlide(i)} />
                            ))}
                        </div>
                    </div>
                )}

                {effectiveTab === "trends" && (
                    <>
                        <div className="mini-tabs" role="tablist" aria-label={t("dashboard.tabs.trends")}>
                            {["trend", "activations"].filter((id) => isVisible(id)).map((id) => (
                                <button
                                    key={id}
                                    type="button"
                                    role="tab"
                                    aria-selected={trendView === id}
                                    className={trendView === id ? "mini-tab active" : "mini-tab"}
                                    onClick={() => setTrendView(id)}
                                >
                                    {t(`dashboard.widgets.${id}`)}
                                </button>
                            ))}
                        </div>
                        <div className="charts-row">
                            {tabWidgets("trends").filter((id) => id === (isVisible(trendView) ? trendView : tabWidgets("trends")[0])).map((id) => renderWidget(id, layout.order.indexOf(id)))}
                        </div>
                    </>
                )}
                {effectiveTab === "status" && (
                    <>
                        <div className="mini-tabs" role="tablist" aria-label={t("dashboard.tabs.status")}>
                            {["status", "webhooks"].filter((id) => isVisible(id)).map((id) => (
                                <button
                                    key={id}
                                    type="button"
                                    role="tab"
                                    aria-selected={statusView === id}
                                    className={statusView === id ? "mini-tab active" : "mini-tab"}
                                    onClick={() => setStatusView(id)}
                                >
                                    {t(`dashboard.widgets.${id}`)}
                                </button>
                            ))}
                        </div>
                        <div className="charts-row">
                            {tabWidgets("status").filter((id) => id === (isVisible(statusView) ? statusView : tabWidgets("status")[0])).map((id) => renderWidget(id, layout.order.indexOf(id)))}
                        </div>
                    </>
                )}
                {effectiveTab === "monthly" && (
                    <>
                        <div className="mini-tabs" role="tablist" aria-label={t("dashboard.tabs.monthly")}>
                            {["perMonth", "byProduct"].filter((id) => isVisible(id)).map((id) => (
                                <button
                                    key={id}
                                    type="button"
                                    role="tab"
                                    aria-selected={monthlyView === id}
                                    className={monthlyView === id ? "mini-tab active" : "mini-tab"}
                                    onClick={() => setMonthlyView(id)}
                                >
                                    {t(`dashboard.widgets.${id}`)}
                                </button>
                            ))}
                        </div>
                        <div className="charts-row">
                            {tabWidgets("monthly").filter((id) => id === (isVisible(monthlyView) ? monthlyView : tabWidgets("monthly")[0])).map((id) => renderWidget(id, layout.order.indexOf(id)))}
                        </div>
                    </>
                )}

                {effectiveTab === "activity" && (
                    <>
                        <div className="mini-tabs" role="tablist" aria-label={t("dashboard.tabs.activity")}>
                            {["expiring", "recent"].map((v) => (
                                <button
                                    key={v}
                                    type="button"
                                    role="tab"
                                    aria-selected={activityView === v}
                                    className={activityView === v ? "mini-tab active" : "mini-tab"}
                                    onClick={() => setActivityView(v)}
                                >
                                    {v === "expiring" ? t("dashboard.expiringSoon") : t("dashboard.recentLicenses")}
                                </button>
                            ))}
                        </div>
                        {activityView === "expiring" ? (
                        <div className="dashboard-section">
                            <h2>{t("dashboard.expiringSoon")}</h2>
                            {expiringSoon.length === 0 ? (
                                <p className="dashboard-empty">{t("dashboard.noExpiring")}</p>
                            ) : (
                                <div className="table-wrap">
                                <table>
                                    <thead><tr><th>{t("dashboard.product")}</th><th>{t("dashboard.licenseKey")}</th><th>{t("dashboard.daysLeft")}</th><th>{t("common.actions")}</th></tr></thead>
                                    <tbody>
                                    {expiringSoon.map((lic) => (
                                        <tr key={lic.id}>
                                            <td>{lic.product}</td>
                                            <td className="key-cell">{lic.key}</td>
                                            <td className="nowrap">{daysLeft(lic.expires_at)} {t("common.days")}</td>
                                            <td><button onClick={() => handleRenew(lic.id)}>{t("common.renew")}</button></td>
                                        </tr>
                                    ))}
                                    </tbody>
                                </table>
                                </div>
                            )}
                        </div>
                        ) : (
                        <div className="dashboard-section">
                            <h2>{t("dashboard.recentLicenses")}</h2>
                            {recentLicenses.length === 0 ? <p className="dashboard-empty">{t("dashboard.noLicenses")}</p> : (
                                <div className="table-wrap">
                                <table>
                                    <thead><tr><th>{t("dashboard.product")}</th><th>{t("dashboard.licenseKey")}</th><th>{t("common.status")}</th><th>{t("common.createdAt")}</th></tr></thead>
                                    <tbody>{recentLicenses.map((lic) => (<tr key={lic.id}><td>{lic.product}</td><td className="key-cell">{lic.key}</td><td>{t(`common.${lic.status}`) !== `common.${lic.status}` ? t(`common.${lic.status}`) : lic.status}</td><td className="nowrap">{formatDate(lic.created_at, lang)}</td></tr>))}</tbody>
                                </table>
                                </div>
                            )}
                            <p><Link to="/licenses">{t("dashboard.viewAll")} {t("nav.licenses")}</Link></p>
                        </div>
                        )}
                    </>
                )}

                {effectiveTab === "apikeys" && (
                    <div className="dashboard-section">
                        <h2>{t("dashboard.recentApiKeys")}</h2>
                        {recentApiKeys.length === 0 ? <p className="dashboard-empty">{t("dashboard.noApiKeys")}</p> : (
                            <div className="table-wrap">
                            <table>
                                <thead><tr><th>{t("apikeys.key")}</th><th>{t("apikeys.accessRights")}</th></tr></thead>
                                <tbody>{recentApiKeys.map((key) => (<tr key={key.id}><td className="key-cell">{key.key}</td><td>{key.access_rights.join(", ")}</td></tr>))}</tbody>
                            </table>
                            </div>
                        )}
                        <p><Link to="/api-keys">{t("dashboard.viewAll")} {t("nav.apiKeys")}</Link></p>
                    </div>
                )}

                {effectiveTab === "users" && (
                    <div className="dashboard-section">
                        <h2>{t("dashboard.recentUsers")}</h2>
                        {recentUsers.length === 0 ? <p className="dashboard-empty">{t("dashboard.noUsers")}</p> : (
                            <div className="table-wrap">
                            <table>
                                <thead><tr><th>{t("common.email")}</th><th>{t("common.role")}</th></tr></thead>
                                <tbody>{recentUsers.map((user) => (<tr key={user.id}><td>{user.email}</td><td>{user.role}</td></tr>))}</tbody>
                            </table>
                            </div>
                        )}
                        <p><Link to="/users">{t("dashboard.viewAll")} {t("nav.users")}</Link></p>
                    </div>
                )}

                {effectiveTab === "services" && (
                    <>
                    <div className="chart-card service-status-card">
                        <div className="service-status-header">
                            <h3>{t("dashboard.serviceStatusTitle")}</h3>
                            <button type="button" className="btn-ghost" onClick={() => { fetchServiceStatus(); fetchSmsBalance(true); }} disabled={serviceLoading}>
                                {t("dashboard.serviceRecheck")}
                            </button>
                        </div>
                        {serviceLoading && serviceStatus === null ? (
                            <SkeletonCard lines={5} />
                        ) : (
                            <>
                                <ul className="service-status-list">
                                    {(serviceStatus || []).map((s) => (
                                        <li key={s.key} className="service-status-row">
                                            <span className="service-status-dot" style={{background: statusDot(s.status)}} />
                                            <span className="service-status-label">{s.label}</span>
                                            <span className="service-status-detail">{s.detail || ""}</span>
                                            <span className="service-status-state">{t(`dashboard.serviceStatus.${s.status}`)}</span>
                                        </li>
                                    ))}
                                </ul>
                                <p className="service-status-meta">
                                    {serviceCheckedAt
                                        ? `${t("dashboard.serviceLastChecked")}: ${formatDateTime(serviceCheckedAt, lang)} · ${t("dashboard.serviceNextCheck")}: ${countdownText()}`
                                        : t("dashboard.serviceNeverChecked")}
                                </p>
                            </>
                        )}
                    </div>
                    <div className="chart-card sms-balance-card">
                        {smsBalanceLoading && smsBalance === null ? (
                            <SkeletonCard lines={1} />
                        ) : (
                            <>
                                <div className="sms-balance-row">
                                    <h3>{t("dashboard.smsBalanceTitle")}</h3>
                                    <button type="button" className="btn-ghost sms-balance-recheck" onClick={() => fetchSmsBalance(true)} disabled={smsBalanceLoading}>
                                        {t("dashboard.serviceRecheck")}
                                    </button>
                                </div>
                                {smsBalance && smsBalance.available ? (
                                    <>
                                        <p className="sms-balance-value">
                                            {Number(smsBalance.credit).toLocaleString(lang === "fa" ? "fa-IR" : "en-US")}
                                            {" "}
                                            <span className="sms-balance-unit">{t("dashboard.smsBalanceUnit")}</span>
                                            {smsBalance.demo ? <span className="demo-badge">demo</span> : null}
                                        </p>
                                        <p className="sms-balance-meta">
                                            {smsBalance.checked_at
                                                ? `${t("dashboard.serviceLastChecked")}: ${formatDateTime(smsBalance.checked_at, lang)}`
                                                : t("dashboard.serviceNeverChecked")}
                                        </p>
                                    </>
                                ) : (
                                    <p className="sms-balance-empty">
                                        {t(smsBalance && smsBalance.error === "not_configured"
                                            ? "dashboard.smsBalanceNotConfigured"
                                            : "dashboard.smsBalanceUnavailable")}
                                    </p>
                                )}
                            </>
                        )}
                    </div>
                    </>
                )}

                {effectiveTab === "sending" && (
                    <div className="sending-tab">
                        <div className="chart-channel-row" role="group" aria-label={t("dashboard.sendingChannel")}>
                            {["total", "email", "sms", "telegram"].map((ch) => (
                                <button
                                    key={ch}
                                    type="button"
                                    className={sendingChannel === ch ? "chart-range-btn active" : "chart-range-btn"}
                                    aria-pressed={sendingChannel === ch}
                                    onClick={() => setSendingChannel(ch)}
                                >
                                    {t(`dashboard.sendingChannel.${ch}`)}
                                </button>
                            ))}
                        </div>
                        {sendingLoading && !sendingStats ? (
                            <SkeletonCard lines={4} />
                        ) : (
                            <>
                                <SendingChart
                                    series={(sendingStats && sendingStats[sendingChannel]) || []}
                                    title={`${t(`dashboard.sendingChannel.${sendingChannel}`)} · ${layout.ranges.sending} ${t("common.days")}`}
                                    t={t}
                                />
                                <div className="chart-range" role="group" aria-label={t("dashboard.range")}>
                                    <span className="chart-range-label">{t("dashboard.range")}</span>
                                    {RANGE_OPTIONS.map((d) => (
                                        <button
                                            key={d}
                                            type="button"
                                            className={layout.ranges.sending === d ? "chart-range-btn active" : "chart-range-btn"}
                                            aria-pressed={layout.ranges.sending === d}
                                            onClick={() => setLayout((prev) => ({...prev, ranges: {...prev.ranges, sending: d}}))}
                                        >
                                            {d} {t("common.days")}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Widget visibility popup (v3.0): every dashboard widget with
                a quick on/off toggle; takes effect immediately and persists
                with the widget preferences. */}
            <Modal open={gearOpen} onClose={() => setGearOpen(false)} title={t("dashboard.widgetVisibility")}>
                <ul className="widget-visibility-list">
                    {WIDGET_IDS.map((id) => (
                        <li key={id} className="widget-visibility-row">
                            <span>{t(`dashboard.widgets.${id}`)}</span>
                            <button
                                type="button"
                                className={isVisible(id) ? "widget-switch on" : "widget-switch"}
                                role="switch"
                                aria-checked={isVisible(id)}
                                aria-label={t(`dashboard.widgets.${id}`)}
                                onClick={() => setLayout((prev) => ({
                                    ...prev,
                                    hidden: {...prev.hidden, [id]: !prev.hidden[id] ? true : false},
                                }))}
                            >
                                <span className="widget-knob" />
                            </button>
                        </li>
                    ))}
                </ul>
                <p className="modal-hint">{t("dashboard.widgetVisibilityHint")}</p>
            </Modal>
        </div>
    );
}

export default Dashboard;
