import React, {useEffect, useState, useCallback, useMemo, useRef} from "react";
import {Link, useNavigate} from "react-router-dom";
import {motion, useReducedMotion} from "framer-motion";
import {
    ResponsiveContainer,
    LineChart as RLineChart, Line,
    AreaChart as RAreaChart, Area,
    BarChart as RBarChart, Bar,
    PieChart as RPieChart, Pie, Cell,
    XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import {
    TrendingUp, ChartPie, ChartColumn, Boxes, Activity, Webhook, Server, Send,
    KeyRound, Users, UserPlus, ShieldCheck, ShieldOff, CalendarClock,
    FileText, Plus, Sparkles, Zap, MessageSquare, Settings as SettingsIcon, SlidersHorizontal,
    GripVertical, ChevronUp, ChevronDown, RefreshCw, Check, X, BookOpen,
} from "lucide-react";
import {get, post, put} from "../utils/api";
import {getCurrentUser} from "../utils/auth";
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

// v3.0.3: chart height per widget size — S/M/L must render visibly
// different chart sizes, not just different frame widths. Recharts
// draws into a ResponsiveContainer with an explicit pixel height per
// size (v3.0.4), so the svg's rendered height grows with the size at
// every viewport, including 360px.
const CHART_HEIGHT = {S: 150, M: 200, L: 280};
const BAR_HEIGHT = {S: 140, M: 190, L: 250};
const DONUT_SIZE = {S: 120, M: 180, L: 240};

// Long labels wrap onto two lines instead of being truncated ("CloudPanel P…").
const splitLabel = (label) => {
    if (!label || label.length <= 10) return [label || ""];
    const mid = Math.floor(label.length / 2);
    const cut = label.indexOf(" ", Math.max(0, mid - 3)) || label.lastIndexOf(" ", mid);
    const at = (cut > 0 ? cut : label.lastIndexOf(" ", mid));
    if (at <= 0) return [label];
    return [label.slice(0, at), label.slice(at + 1)];
};

// Recharts shared bits: muted axis ticks, no axis lines, light grid,
// glass tooltip. Colours come from the theme variables so a preset
// change recolours the charts with the rest of the UI.
const AXIS_TICK = {fontSize: 11, fill: "var(--muted)"};
const TOOLTIP_STYLE = {background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text)", fontSize: 12};

/** Two-line X-axis tick for the bar charts (long product/month labels). */
function SplitTick(props) {
    const {x, y, payload} = props;
    const lines = splitLabel(payload && payload.value);
    return (
        <text x={x} y={y} textAnchor="middle" fill="var(--muted)" fontSize={9}>
            {lines.map((line, i) => (
                <tspan key={i} x={x} dy={i === 0 ? 0 : 11}>{line}</tspan>
            ))}
        </text>
    );
}

function ChartTitle({icon, title}) {
    return (
        <h3>
            {icon ? <span className="chart-title-icon">{icon}</span> : null}
            {title}
        </h3>
    );
}

/** Donut / pie / bar breakdown of licenses by status (Recharts, v3.0.4). */
function DonutChart({data, title, t, size = "M", type = "donut", icon}) {
    const total = Object.values(data).reduce((a, b) => a + b, 0);
    const entries = Object.entries(data).filter(([, v]) => v > 0).map(([key, value]) => ({key, value}));
    const donutPx = DONUT_SIZE[size] || 180;
    return (
        <div className="chart-card">
            <ChartTitle icon={icon} title={title} />
            {total === 0 ? <p className="dashboard-empty">—</p> : type === "bar" ? (
                <div className="chart-body">
                    <ResponsiveContainer width="100%" height={donutPx}>
                        <RBarChart data={entries} layout="vertical" margin={{top: 4, right: 12, bottom: 4, left: 4}}>
                            <XAxis type="number" hide />
                            <YAxis type="category" dataKey="key" width={76} tickLine={false} axisLine={false}
                                tick={{fontSize: 11, fill: "var(--text)"}}
                                tickFormatter={(k) => (t(`common.${k}`) !== `common.${k}` ? t(`common.${k}`) : k)} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                                {entries.map((e) => (
                                    <Cell key={e.key} fill={STATUS_COLORS[e.key] || "var(--accent)"} />
                                ))}
                            </Bar>
                        </RBarChart>
                    </ResponsiveContainer>
                </div>
            ) : (
                <div className="chart-body">
                    <div className="donut-wrap" style={{width: donutPx, height: donutPx}}>
                        <ResponsiveContainer width="100%" height="100%">
                            <RPieChart>
                                <Pie data={entries} dataKey="value" nameKey="key"
                                    innerRadius={type === "pie" ? 0 : "62%"} outerRadius="85%"
                                    paddingAngle={2} stroke="var(--surface)" strokeWidth={2}>
                                    {entries.map((e) => (
                                        <Cell key={e.key} fill={STATUS_COLORS[e.key] || "var(--accent)"} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={TOOLTIP_STYLE} />
                            </RPieChart>
                        </ResponsiveContainer>
                        <span className="donut-center">{total}</span>
                    </div>
                    <ul className="chart-legend">
                        {entries.map((e) => (
                            <li key={e.key}>
                                <span className="legend-dot" style={{background: STATUS_COLORS[e.key] || "var(--accent)"}} />
                                {t(`common.${e.key}`) !== `common.${e.key}` ? t(`common.${e.key}`) : e.key}: {e.value}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

/** Bar / line / area chart of values per label (Recharts, v3.0.4). */
function BarChart({data, title, color, size = "M", type = "bar", icon}) {
    const height = BAR_HEIGHT[size] || 190;
    return (
        <div className="chart-card">
            <ChartTitle icon={icon} title={title} />
            {data.length === 0 ? <p className="dashboard-empty">—</p> : (
                <ResponsiveContainer width="100%" height={height}>
                    {type === "line" ? (
                        <RLineChart data={data} margin={{top: 8, right: 8, bottom: 4, left: 0}}>
                            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="label" height={36} interval={0} tickLine={false} axisLine={false} tick={<SplitTick />} />
                            <YAxis allowDecimals={false} domain={[0, "dataMax"]} width={28} tickLine={false} axisLine={false} tick={AXIS_TICK} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{r: 3, fill: color}} />
                        </RLineChart>
                    ) : type === "area" ? (
                        <RAreaChart data={data} margin={{top: 8, right: 8, bottom: 4, left: 0}}>
                            <defs>
                                <linearGradient id="bar-area-fill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                                    <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="label" height={36} interval={0} tickLine={false} axisLine={false} tick={<SplitTick />} />
                            <YAxis allowDecimals={false} domain={[0, "dataMax"]} width={28} tickLine={false} axisLine={false} tick={AXIS_TICK} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill="url(#bar-area-fill)" />
                        </RAreaChart>
                    ) : (
                        <RBarChart data={data} margin={{top: 8, right: 8, bottom: 4, left: 0}}>
                            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="label" height={36} interval={0} tickLine={false} axisLine={false} tick={<SplitTick />} />
                            <YAxis allowDecimals={false} domain={[0, "dataMax"]} width={28} tickLine={false} axisLine={false} tick={AXIS_TICK} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Bar dataKey="value" fill={color} radius={[3, 3, 0, 0]} maxBarSize={40} />
                        </RBarChart>
                    )}
                </ResponsiveContainer>
            )}
        </div>
    );
}

/** 14-day line / area / bar chart of licenses created per day (Recharts, v3.0.4). */
function TrendChart({points, title, lang, size = "M", type = "line", icon, widgetId = "trend"}) {
    const height = CHART_HEIGHT[size] || 200;
    const gradId = `trend-fill-${widgetId}`;
    return (
        <div className="chart-card chart-card-wide">
            <ChartTitle icon={icon} title={title} />
            {points.length === 0 ? <p className="dashboard-empty">—</p> : (
                <ResponsiveContainer width="100%" height={height}>
                    {type === "bar" ? (
                        <RBarChart data={points} margin={{top: 8, right: 8, bottom: 4, left: 0}}>
                            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="date" interval={2} tickLine={false} axisLine={false} tick={AXIS_TICK}
                                tickFormatter={(d) => formatDayShort(new Date(d), lang)} />
                            <YAxis allowDecimals={false} domain={[0, "dataMax"]} width={28} tickLine={false} axisLine={false} tick={AXIS_TICK} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(d) => formatDayShort(new Date(d), lang)} />
                            <Bar dataKey="count" fill="var(--accent)" radius={[3, 3, 0, 0]} maxBarSize={22} />
                        </RBarChart>
                    ) : type === "area" ? (
                        <RAreaChart data={points} margin={{top: 8, right: 8, bottom: 4, left: 0}}>
                            <defs>
                                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                                    <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="date" interval={2} tickLine={false} axisLine={false} tick={AXIS_TICK}
                                tickFormatter={(d) => formatDayShort(new Date(d), lang)} />
                            <YAxis allowDecimals={false} domain={[0, "dataMax"]} width={28} tickLine={false} axisLine={false} tick={AXIS_TICK} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(d) => formatDayShort(new Date(d), lang)} />
                            <Area type="monotone" dataKey="count" stroke="var(--accent)" strokeWidth={2} fill={`url(#${gradId})`}
                                dot={{r: 3.5, fill: "var(--accent)", stroke: "var(--surface)", strokeWidth: 1.5}} />
                        </RAreaChart>
                    ) : (
                        <RLineChart data={points} margin={{top: 8, right: 8, bottom: 4, left: 0}}>
                            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="date" interval={2} tickLine={false} axisLine={false} tick={AXIS_TICK}
                                tickFormatter={(d) => formatDayShort(new Date(d), lang)} />
                            <YAxis allowDecimals={false} domain={[0, "dataMax"]} width={28} tickLine={false} axisLine={false} tick={AXIS_TICK} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(d) => formatDayShort(new Date(d), lang)} />
                            <Line type="monotone" dataKey="count" stroke="var(--accent)" strokeWidth={2}
                                dot={{r: 3.5, fill: "var(--accent)", stroke: "var(--surface)", strokeWidth: 1.5}} activeDot={{r: 5}} />
                        </RLineChart>
                    )}
                </ResponsiveContainer>
            )}
        </div>
    );
}

/** Webhook delivery stats widget (v2.3, Recharts line variant v3.0.4):
 * overall success rate + a row per event; the "line" type draws the
 * per-event success rate as a line chart instead of bars. */
function WebhookStatsWidget({stats, title, t, type = "bar", icon}) {
    if (!stats) return (
        <div className="chart-card">
            <ChartTitle icon={icon} title={title} />
            <p className="dashboard-empty">—</p>
        </div>
    );
    const events = Object.entries(stats.by_event || {}).sort((a, b) => b[1].total - a[1].total);
    const lineData = events.map(([event, e]) => ({
        event: event.replace(/^license\./, ""),
        pct: e.total ? Math.round((100 * e.success) / e.total) : 100,
    }));
    return (
        <div className="chart-card">
            <ChartTitle icon={icon} title={title} />
            <div className="webhook-rate">
                <span className="webhook-rate-value">{stats.success_rate}%</span>
                <span className="webhook-rate-label">{t("dashboard.webhookSuccessRate")}</span>
            </div>
            <p className="webhook-totals">
                <Check size={12} /> {stats.success}
                {" · "}
                <X size={12} /> {stats.failed}
                {" · "}
                {stats.total} total
            </p>
            {type === "line" ? (
                <ResponsiveContainer width="100%" height={150}>
                    <RLineChart data={lineData} margin={{top: 8, right: 8, bottom: 4, left: 0}}>
                        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="event" interval={0} tickLine={false} axisLine={false} tick={{fontSize: 9, fill: "var(--muted)"}} />
                        <YAxis domain={[0, 100]} width={28} tickLine={false} axisLine={false} tick={AXIS_TICK} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}%`, t("dashboard.webhookSuccessRate")]} />
                        <Line type="monotone" dataKey="pct" stroke="var(--accent)" strokeWidth={2} dot={{r: 3, fill: "var(--accent)"}} />
                    </RLineChart>
                </ResponsiveContainer>
            ) : (
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
            )}
        </div>
    );
}

/** Sending activity chart (v3.0, Recharts v3.0.4): per-day sent (green)
 * + failed (red) bars / lines / areas for one channel (or all). */
function SendingChart({series, title, t, size = "M", type = "bar", icon}) {
    const height = CHART_HEIGHT[size] || 200;
    const total = series.reduce((a, d) => a + d.sent + d.failed, 0);
    const interval = Math.max(0, Math.ceil(series.length / 7) - 1);
    return (
        <div className="chart-card chart-card-wide">
            <ChartTitle icon={icon} title={title} />
            {total === 0 ? <p className="dashboard-empty">{t("dashboard.sendingNoData")}</p> : (
                <ResponsiveContainer width="100%" height={height}>
                    {type === "line" ? (
                        <RLineChart data={series} margin={{top: 8, right: 8, bottom: 4, left: 0}}>
                            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="date" interval={interval} tickLine={false} axisLine={false} tick={AXIS_TICK}
                                tickFormatter={(d) => d.slice(5)} />
                            <YAxis allowDecimals={false} domain={[0, "dataMax"]} width={28} tickLine={false} axisLine={false} tick={AXIS_TICK} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Line type="monotone" dataKey="sent" name={t("dashboard.sendingSent")} stroke="var(--success)" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="failed" name={t("dashboard.sendingFailed")} stroke="var(--danger)" strokeWidth={2} dot={false} />
                        </RLineChart>
                    ) : type === "area" ? (
                        <RAreaChart data={series} margin={{top: 8, right: 8, bottom: 4, left: 0}}>
                            <defs>
                                <linearGradient id="sending-sent-fill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="var(--success)" stopOpacity={0.35} />
                                    <stop offset="100%" stopColor="var(--success)" stopOpacity={0.02} />
                                </linearGradient>
                                <linearGradient id="sending-failed-fill" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="var(--danger)" stopOpacity={0.35} />
                                    <stop offset="100%" stopColor="var(--danger)" stopOpacity={0.02} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="date" interval={interval} tickLine={false} axisLine={false} tick={AXIS_TICK}
                                tickFormatter={(d) => d.slice(5)} />
                            <YAxis allowDecimals={false} domain={[0, "dataMax"]} width={28} tickLine={false} axisLine={false} tick={AXIS_TICK} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Area type="monotone" dataKey="sent" name={t("dashboard.sendingSent")} stroke="var(--success)" strokeWidth={2} fill="url(#sending-sent-fill)" dot={false} />
                            <Area type="monotone" dataKey="failed" name={t("dashboard.sendingFailed")} stroke="var(--danger)" strokeWidth={2} fill="url(#sending-failed-fill)" dot={false} />
                        </RAreaChart>
                    ) : (
                        <RBarChart data={series} margin={{top: 8, right: 8, bottom: 4, left: 0}}>
                            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="date" interval={interval} tickLine={false} axisLine={false} tick={AXIS_TICK}
                                tickFormatter={(d) => d.slice(5)} />
                            <YAxis allowDecimals={false} domain={[0, "dataMax"]} width={28} tickLine={false} axisLine={false} tick={AXIS_TICK} />
                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                            <Bar dataKey="sent" name={t("dashboard.sendingSent")} fill="var(--success)" radius={[3, 3, 0, 0]} maxBarSize={14} />
                            <Bar dataKey="failed" name={t("dashboard.sendingFailed")} fill="var(--danger)" radius={[3, 3, 0, 0]} maxBarSize={14} />
                        </RBarChart>
                    )}
                </ResponsiveContainer>
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
// v3.0.3: the dashboard is ONE single page — the tab strip is gone
// (user decision, 2026-11-26). Every widget renders on the page in
// layout.order; the Activity / API Keys / Users sections follow below.
const WIDGET_IDS = ["trend", "status", "perMonth", "byProduct", "activations", "webhooks", "services", "sending"];
// v3.0.4: every dashboard block can be hidden, not just the 8 chart
// widgets — the summary boxes, quick-action buttons, highlights slider
// and the 4 sections are blocks too. They get a visibility toggle ONLY:
// no size buttons, no ↑/↓ reorder (the quick-action buttons are not
// widgets, and neither are the other sections).
const SECTION_IDS = ["summary", "actions", "highlights", "expiring", "recentLicenses", "recentApiKeys", "recentUsers"];
// v3.0.4: Grafana-style chart types per widget (Recharts supports them
// all). Services is status cards, not a chart — no type switcher there.
const CHART_TYPES = {
    trend: ["line", "area", "bar"],
    status: ["donut", "pie", "bar"],
    perMonth: ["bar", "line", "area"],
    byProduct: ["bar", "pie", "donut"],
    activations: ["line", "area", "bar"],
    webhooks: ["bar", "line"],
    sending: ["bar", "line", "area"],
};
const DEFAULT_TYPES = {trend: "line", status: "donut", perMonth: "bar", byProduct: "bar", activations: "line", webhooks: "bar", sending: "bar"};
const DEFAULT_LAYOUT = {
    order: [...WIDGET_IDS],
    sizes: {trend: "L", status: "M", perMonth: "M", byProduct: "M", activations: "L", webhooks: "M", services: "L", sending: "L"},
    ranges: {trend: 14, activations: 14, perMonth: 6, byProduct: 90, sending: 14},
    hidden: {},
    types: {...DEFAULT_TYPES},
};
// v3.0.4: the layout is PER ADMIN (same pattern as the per-admin theme
// in theme.js). The old browser-global key leaked one admin's layout
// into the next admin on the same browser; the key is now per user id
// and the backend is re-consulted on every auth change.
const LAYOUT_KEY_PREFIX = "lmp-dashboard-layout";
const LEGACY_LAYOUT_KEY = "lmp-dashboard-layout";
const RANGE_OPTIONS = [7, 14, 30, 90];
const MONTH_OPTIONS = [3, 6, 12];
const SERVICE_REFRESH_SECONDS = 300;

function layoutKeyFor(userId) {
    return userId != null ? `${LAYOUT_KEY_PREFIX}-${userId}` : LEGACY_LAYOUT_KEY;
}

/** Keep only the known, well-formed parts of a stored layout (unknown
 * widget ids, sizes, ranges and chart types fall back to defaults, so
 * a saved layout from an older version keeps working). */
function normalizeLayout(saved) {
    if (!saved || !Array.isArray(saved.order)) return null;
    const types = {...DEFAULT_TYPES};
    for (const [id, ty] of Object.entries(saved.types || {})) {
        if (CHART_TYPES[id] && CHART_TYPES[id].includes(ty)) types[id] = ty;
    }
    return {
        order: [...new Set([...saved.order, ...WIDGET_IDS])].filter((id) => WIDGET_IDS.includes(id)),
        sizes: {...DEFAULT_LAYOUT.sizes, ...(saved.sizes || {})},
        ranges: {...DEFAULT_LAYOUT.ranges, ...(saved.ranges || {})},
        hidden: {...(saved.hidden || {})},
        types,
    };
}

function readLayout(key) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        return normalizeLayout(JSON.parse(raw));
    } catch (e) {
        return null;
    }
}

// v3.0.4: one lucide icon per dashboard element (the single icon
// source on this page). Stroke-based, currentColor, 24px outline.
const WIDGET_ICONS = {
    trend: <TrendingUp size={16} />,
    status: <ChartPie size={16} />,
    perMonth: <ChartColumn size={16} />,
    byProduct: <Boxes size={16} />,
    activations: <Activity size={16} />,
    webhooks: <Webhook size={16} />,
    services: <Server size={16} />,
    sending: <Send size={16} />,
};
const SUMMARY_ICONS = [
    <KeyRound key="apiKeys" size={20} />,
    <Users key="users" size={20} />,
    <ShieldCheck key="active" size={20} />,
    <ShieldOff key="inactive" size={20} />,
];
const SECTION_ICONS = {
    expiring: <CalendarClock size={16} />,
    recentLicenses: <FileText size={16} />,
    recentApiKeys: <KeyRound size={16} />,
    recentUsers: <Users size={16} />,
};

function Dashboard() {
    const {t, lang} = useLanguage();
    const {toast} = useToast();
    const reduceMotion = useReducedMotion();
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
    // Customizable widgets (v2.3): order, size (S/M/L), chart range,
    // chart type and visibility persist per user (localStorage first,
    // backend too).
    const [layout, setLayout] = useState(() => readLayout(layoutKeyFor(getCurrentUser()?.id)) || DEFAULT_LAYOUT);
    const layoutKeyRef = useRef(layoutKeyFor(getCurrentUser()?.id));
    // Same guard as the theme provider: the mount-time PUT must stay
    // silent until the server layout for THIS user has loaded, or it
    // would clobber the server layout with local defaults.
    const layoutServerReadyRef = useRef(false);
    const [customizing, setCustomizing] = useState(false);
    const [gearOpen, setGearOpen] = useState(false);
    // Narrow viewports (<640px) show fewer rows in the dashboard's recent
    // lists (responsive page size, same pattern as the list pages): the
    // 5-row recent-licenses table is 466px tall at 360px in fa and pushes
    // the Activity section 157px past the viewport.
    const [isNarrow, setIsNarrow] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches);
    useEffect(() => {
        const mq = window.matchMedia("(max-width: 640px)");
        const onChange = (e) => setIsNarrow(e.matches);
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, []);
    const recentCount = isNarrow ? 3 : 5;
    // Service status (v3.0): lazy, non-blocking — fetched once on mount,
    // never before the dashboard renders (v3.0.3: no tabs, so the fetch
    // is no longer tied to opening a Services tab).
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
    // Widgets visible on the single page, in layout.order (v3.0.3).
    const visibleWidgets = useMemo(() => layout.order.filter((id) => !layout.hidden[id]), [layout]);

    // Load the logged-in admin's layout on mount and whenever the auth
    // state changes (login as another admin, logout): the local
    // per-user cache paints first, the backend is the source of truth.
    // A second admin on the same browser never inherits the first
    // one's layout, and a logged-out dashboard resets to defaults.
    const syncLayoutFromServer = useCallback(async () => {
        const user = getCurrentUser();
        const key = layoutKeyFor(user?.id);
        layoutKeyRef.current = key;
        layoutServerReadyRef.current = false;
        if (!user || user.id == null) {
            setLayout(DEFAULT_LAYOUT);
            layoutServerReadyRef.current = true;
            return;
        }
        const local = readLayout(key);
        if (local) setLayout(local);
        try {
            const data = await get("/users/me/preferences");
            const saved = normalizeLayout(data && data.preferences && data.preferences.dashboard);
            if (saved) setLayout(saved);
        } catch (e) {
            // Offline / backend down: keep the local cache.
        }
        layoutServerReadyRef.current = true;
        // The old browser-global key is retired (v3.0.4: per-admin
        // layouts); drop it once so a second admin on this browser
        // never inherits it.
        try { localStorage.removeItem(LEGACY_LAYOUT_KEY); } catch (e) {}
    }, []);
    useEffect(() => {
        syncLayoutFromServer();
        window.addEventListener("lmp-auth-change", syncLayoutFromServer);
        return () => window.removeEventListener("lmp-auth-change", syncLayoutFromServer);
    }, [syncLayoutFromServer]);

    // Persist every layout change (local per-user key + backend,
    // fire-and-forget). The backend PUT stays silent until the server
    // layout for this user has loaded (see layoutServerReadyRef).
    useEffect(() => {
        try { localStorage.setItem(layoutKeyRef.current, JSON.stringify(layout)); } catch (e) {}
        if (layoutServerReadyRef.current && getCurrentUser() && getCurrentUser().id != null) {
            put("/users/me/preferences", {key: "dashboard", value: layout}).catch(() => {});
        }
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
        if (serviceStatus === null) fetchServiceStatus();
    }, [serviceStatus, fetchServiceStatus]);
    // SMS balance: fetch on demand with the service status (same trigger
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
        if (smsBalance === null) fetchSmsBalance();
    }, [smsBalance, fetchSmsBalance]);
    // Auto-refresh every 5 minutes while the dashboard is mounted, with
    // a visible countdown; the page never waits for a check. The SMS
    // balance refreshes on the same tick (the backend caches the credit
    // ~5 minutes, so this costs no extra live call).
    useEffect(() => {
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
    }, [fetchServiceStatus, fetchSmsBalance]);

    // Sending stats: fetch on mount and whenever the range changes (the
    // channel switch is client-side only).
    useEffect(() => {
        setSendingLoading(true);
        get(`/system/sending-stats?days=${layout.ranges.sending}`)
            .then((d) => setSendingStats(d && d.series ? d.series : null))
            .catch(() => setSendingStats(null))
            .finally(() => setSendingLoading(false));
    }, [layout.ranges.sending]);

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
                {isVisible("summary") && (
                <div className="dashboard-summary">
                    {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} lines={2} />)}
                </div>
                )}
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

    // Entrance animation (framer-motion, v3.0.4): cards fade/slide in
    // with a small stagger; disabled entirely when the user prefers
    // reduced motion. The old CSS stagger classes stay out of the
    // motion-wrapped elements so the two systems never fight.
    const cardMotion = (delay) => reduceMotion
        ? {}
        : {initial: {opacity: 0, y: 14}, animate: {opacity: 1, y: 0}, transition: {duration: 0.35, delay}};

    // Chart-type switcher (v3.0.4, Grafana-style): small tappable pills
    // under the chart; the choice persists per widget in the layout.
    // Services has none — it is status cards, not a chart.
    const typeControl = (id) => {
        const options = CHART_TYPES[id];
        if (!options) return null;
        const current = layout.types[id] || DEFAULT_TYPES[id];
        return (
            <div className="chart-type-row" role="group" aria-label={t("dashboard.chartType")}>
                <span className="chart-range-label">{t("dashboard.chartType")}</span>
                {options.map((ty) => (
                    <button
                        key={ty}
                        type="button"
                        className={current === ty ? "chart-type-btn active" : "chart-type-btn"}
                        aria-pressed={current === ty}
                        onClick={() => setLayout((prev) => ({...prev, types: {...prev.types, [id]: ty}}))}
                    >
                        {t(`dashboard.chartType.${ty}`)}
                    </button>
                ))}
            </div>
        );
    };

    // One widget card, with its own range control directly underneath the
    // chart (v3.0: per-chart ranges, independent, persisted in the layout).
    const renderWidget = (id, index) => {
        const size = layout.sizes[id] || "M";
        const chartType = layout.types[id] || DEFAULT_TYPES[id];
        // Position among the widgets visible on the single page
        // (v3.0.3): the ↑/↓ buttons move the widget within the page
        // order, so the change is always visible. The old version
        // swapped adjacent positions within a tab, which often moved a
        // widget of another tab instead — layout.order changed, nothing
        // on screen did.
        const visibleIds = layout.order.filter((x) => isVisible(x));
        const posInList = visibleIds.indexOf(id);
        const move = (dir) => {
            setLayout((prev) => {
                const order = [...prev.order];
                const ids = order.filter((x) => !prev.hidden[x]);
                const pos = ids.indexOf(id);
                const j = pos + dir;
                if (pos < 0 || j < 0 || j >= ids.length) return prev;
                const a = order.indexOf(ids[pos]);
                const b = order.indexOf(ids[j]);
                [order[a], order[b]] = [order[b], order[a]];
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
            <motion.div
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
                {...cardMotion(Math.min(index * 0.05, 0.4))}
            >
                {customizing && (
                    <div className="widget-controls">
                        <span className="widget-drag-handle" title={t("dashboard.customize")}><GripVertical size={16} /></span>
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
                            <button type="button" className="widget-move-btn" disabled={posInList <= 0} onClick={() => move(-1)} title={t("dashboard.moveUp")} aria-label={t("dashboard.moveUp")}><ChevronUp size={16} /></button>
                            <button type="button" className="widget-move-btn" disabled={posInList >= visibleIds.length - 1} onClick={() => move(1)} title={t("dashboard.moveDown")} aria-label={t("dashboard.moveDown")}><ChevronDown size={16} /></button>
                        </span>
                    </div>
                )}
                {id === "trend" && (
                    <>
                        <TrendChart points={trend} title={`${t("dashboard.trendTitle")} · ${layout.ranges.trend} ${t("common.days")}`} lang={lang} size={size} type={chartType} icon={WIDGET_ICONS.trend} widgetId="trend" />
                        {typeControl("trend")}
                        {rangeControl("trend", RANGE_OPTIONS, "common.days")}
                    </>
                )}
                {id === "status" && (
                    <>
                        <DonutChart data={statusCounts} title={t("dashboard.byStatus")} t={t} size={size} type={chartType} icon={WIDGET_ICONS.status} />
                        {typeControl("status")}
                    </>
                )}
                {id === "perMonth" && (
                    <>
                        <BarChart data={perMonth} title={t("dashboard.createdPerMonth")} color="var(--accent)" size={size} type={chartType} icon={WIDGET_ICONS.perMonth} />
                        {typeControl("perMonth")}
                        {rangeControl("perMonth", MONTH_OPTIONS, "common.months")}
                    </>
                )}
                {id === "byProduct" && (
                    <>
                        <BarChart data={byProduct} title={t("dashboard.byProduct")} color="var(--success)" size={size} type={chartType} icon={WIDGET_ICONS.byProduct} />
                        {typeControl("byProduct")}
                        {rangeControl("byProduct", RANGE_OPTIONS, "common.days")}
                    </>
                )}
                {id === "activations" && (
                    <>
                        <TrendChart points={activations} title={`${t("dashboard.activationsTrend")} · ${layout.ranges.activations} ${t("common.days")}`} lang={lang} size={size} type={chartType} icon={WIDGET_ICONS.activations} widgetId="activations" />
                        {typeControl("activations")}
                        {rangeControl("activations", RANGE_OPTIONS, "common.days")}
                    </>
                )}
                {id === "webhooks" && (
                    <>
                        <WebhookStatsWidget stats={webhookStats} title={t("dashboard.webhookStats")} t={t} type={chartType} icon={WIDGET_ICONS.webhooks} />
                        {typeControl("webhooks")}
                    </>
                )}
                {/* v3.0.1: Services and Sending are real widgets now — they
                    used to be plain cards in their tabs, so Custom showed
                    no controls on those tabs at all. Same content, now
                    wrapped in the widget card with drag + size + ↑/↓. */}
                {id === "services" && (
                    <>
                    <div className="chart-card service-status-card">
                        <div className="service-status-header">
                            <h3><span className="chart-title-icon">{WIDGET_ICONS.services}</span>{t("dashboard.serviceStatusTitle")}</h3>
                            <button type="button" className="btn-ghost btn-icon" aria-label={t("dashboard.serviceRecheck")} title={t("dashboard.serviceRecheck")} onClick={() => { fetchServiceStatus(); fetchSmsBalance(true); }} disabled={serviceLoading}>
                                <RefreshCw size={16} />
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
                                    <h3><span className="chart-title-icon"><MessageSquare size={16} /></span>{t("dashboard.smsBalanceTitle")}</h3>
                                    <button type="button" className="btn-ghost btn-icon sms-balance-recheck" aria-label={t("dashboard.serviceRecheck")} title={t("dashboard.serviceRecheck")} onClick={() => fetchSmsBalance(true)} disabled={smsBalanceLoading}>
                                        <RefreshCw size={16} />
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
                {id === "sending" && (
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
                                    size={size}
                                    type={chartType}
                                    icon={WIDGET_ICONS.sending}
                                />
                                {typeControl("sending")}
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
            </motion.div>
        );
    };

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
                        <SettingsIcon size={18} />
                    </button>
                    <button
                        type="button"
                        className="btn-ghost dashboard-customize-btn"
                        aria-pressed={customizing}
                        aria-label={customizing ? t("dashboard.doneCustomizing") : t("dashboard.customize")}
                        title={customizing ? t("dashboard.doneCustomizing") : t("dashboard.customize")}
                        onClick={() => setCustomizing((v) => !v)}
                    >
                        <SlidersHorizontal size={16} />
                        <span className="dashboard-customize-label">{customizing ? t("dashboard.doneCustomizing") : t("dashboard.customize")}</span>
                    </button>
                </div>
            </div>

            {/* v3.0.3: one single page, no tab strip — every section
                renders in order; the page scrolls when content does
                not fit (safety net), never clips. */}
            {/* No financial card: this is not a financial system (v2.3) —
                the Estimated MRR card was removed entirely. */}
            {isVisible("summary") && (
            <div className="dashboard-summary">
                {[
                    {label: t("dashboard.apiKeys"), value: summary.apiKeysCount},
                    {label: t("dashboard.users"), value: summary.usersCount},
                    {label: t("dashboard.activeLicenses"), value: summary.activeLicenses},
                    {label: t("dashboard.inactiveLicenses"), value: summary.inactiveLicenses},
                ].map((box, i) => (
                    <motion.div key={box.label} className="summary-box glass-card" {...cardMotion(i * 0.07)}>
                        <span className="summary-icon">{SUMMARY_ICONS[i]}</span>
                        <h2>{box.label}</h2>
                        <p>{box.value}</p>
                    </motion.div>
                ))}
            </div>
            )}
            {isVisible("actions") && (
            <div className="dashboard-actions">
                <h2><Zap size={16} />{t("dashboard.quickActions")}</h2>
                <div className="action-buttons">
                    <Link className="action-btn" to="/licenses"><Plus size={16} />{t("dashboard.createLicense")}</Link>
                    <Link className="action-btn" to="/api-keys"><KeyRound size={16} />{t("dashboard.createApiKey")}</Link>
                    <Link className="action-btn" to="/users"><UserPlus size={16} />{t("dashboard.addUser")}</Link>
                    <Link className="action-btn" to="/products"><Boxes size={16} />{t("nav.products")}</Link>
                    <Link className="action-btn" to="/docs"><BookOpen size={16} />{t("nav.apiDocs")}</Link>
                    <Link className="action-btn" to="/settings"><SettingsIcon size={16} />{t("dashboard.settings")}</Link>
                </div>
            </div>
            )}
            {isVisible("highlights") && (
            <div className="highlights-slider glass-card" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
                <div className="slide slide-fade" key={slide}>
                    <h3><Sparkles size={16} />{slides[slide].title}</h3>
                    <p>{slides[slide].text}</p>
                </div>
                <div className="slider-dots">
                    {slides.map((_, i) => (
                        <button key={i} className={`slider-dot${i === slide ? " active" : ""}`} aria-label={`${t("dashboard.slide")} ${i + 1}`} onClick={() => setSlide(i)} />
                    ))}
                </div>
            </div>
            )}
            {visibleWidgets.length > 0 && (
            <div className="charts-row">
                {visibleWidgets.map((id) => renderWidget(id, layout.order.indexOf(id)))}
            </div>
            )}

            {isVisible("expiring") && (
            <motion.div className="dashboard-section" {...cardMotion(0)}>
                <h2>{SECTION_ICONS.expiring}{t("dashboard.expiringSoon")}</h2>
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
            </motion.div>
            )}
            {isVisible("recentLicenses") && (
            <motion.div className="dashboard-section" {...cardMotion(0.05)}>
                <h2>{SECTION_ICONS.recentLicenses}{t("dashboard.recentLicenses")}</h2>
                {recentLicenses.length === 0 ? <p className="dashboard-empty">{t("dashboard.noLicenses")}</p> : (
                    <div className="table-wrap">
                    <table>
                        <thead><tr><th>{t("dashboard.product")}</th><th>{t("dashboard.licenseKey")}</th><th>{t("common.status")}</th><th>{t("common.createdAt")}</th></tr></thead>
                        <tbody>{recentLicenses.map((lic) => (<tr key={lic.id}><td>{lic.product}</td><td className="key-cell">{lic.key}</td><td>{t(`common.${lic.status}`) !== `common.${lic.status}` ? t(`common.${lic.status}`) : lic.status}</td><td className="nowrap">{formatDate(lic.created_at, lang)}</td></tr>))}</tbody>
                    </table>
                    </div>
                )}
                <p><Link to="/licenses">{t("dashboard.viewAll")} {t("nav.licenses")}</Link></p>
            </motion.div>
            )}
            {isVisible("recentApiKeys") && (
            <motion.div className="dashboard-section" {...cardMotion(0.1)}>
                <h2>{SECTION_ICONS.recentApiKeys}{t("dashboard.recentApiKeys")}</h2>
                {recentApiKeys.length === 0 ? <p className="dashboard-empty">{t("dashboard.noApiKeys")}</p> : (
                    <div className="table-wrap">
                    <table>
                        <thead><tr><th>{t("apikeys.key")}</th><th>{t("apikeys.accessRights")}</th></tr></thead>
                        <tbody>{recentApiKeys.map((key) => (<tr key={key.id}><td className="key-cell">{key.key}</td><td>{key.access_rights.join(", ")}</td></tr>))}</tbody>
                    </table>
                    </div>
                )}
                <p><Link to="/api-keys">{t("dashboard.viewAll")} {t("nav.apiKeys")}</Link></p>
            </motion.div>
            )}
            {isVisible("recentUsers") && (
            <motion.div className="dashboard-section" {...cardMotion(0.15)}>
                <h2>{SECTION_ICONS.recentUsers}{t("dashboard.recentUsers")}</h2>
                {recentUsers.length === 0 ? <p className="dashboard-empty">{t("dashboard.noUsers")}</p> : (
                    <div className="table-wrap">
                    <table>
                        <thead><tr><th>{t("common.email")}</th><th>{t("common.role")}</th></tr></thead>
                        <tbody>{recentUsers.map((user) => (<tr key={user.id}><td>{user.email}</td><td>{user.role}</td></tr>))}</tbody>
                    </table>
                    </div>
                )}
                <p><Link to="/users">{t("dashboard.viewAll")} {t("nav.users")}</Link></p>
            </motion.div>
            )}

            {/* Widget visibility popup (v3.0.4): every dashboard block —
                the 8 chart widgets plus the 7 sections (summary, quick
                actions, highlights, expiring, recent licenses, recent API
                keys, recent users) — with a quick on/off toggle; takes
                effect immediately and persists with the widget preferences. */}
            <Modal open={gearOpen} onClose={() => setGearOpen(false)} title={t("dashboard.widgetVisibility")}>
                <ul className="widget-visibility-list">
                    {[...WIDGET_IDS, ...SECTION_IDS].map((id) => (
                        <li key={id} className="widget-visibility-row">
                            <span>{WIDGET_IDS.includes(id) ? t(`dashboard.widgets.${id}`) : t(`dashboard.sections.${id}`)}</span>
                            <button
                                type="button"
                                className={isVisible(id) ? "widget-switch on" : "widget-switch"}
                                role="switch"
                                aria-checked={isVisible(id)}
                                aria-label={WIDGET_IDS.includes(id) ? t(`dashboard.widgets.${id}`) : t(`dashboard.sections.${id}`)}
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
