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
    GripVertical, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, RefreshCw, Check, X, BookOpen,
    Newspaper, ExternalLink, LayoutDashboard,
} from "lucide-react";
import {DEMO_MODE} from "../config";
import {APP_VERSION} from "../version";
import {get, post, put} from "../utils/api";
import {getCurrentUser} from "../utils/auth";
import {formatDate, formatDateTime, formatDayShort, formatMonthShort} from "../utils/format";
import {useLanguage} from "../i18n";
import {useToast} from "../components/Toast";
import {useLiveRefresh} from "../utils/useLiveRefresh";
import LiveIndicator from "../components/LiveIndicator";
import {SkeletonCard} from "../components/Skeleton";
import Modal from "../components/Modal";
import CopyButton from "../components/CopyButton";
import "../styles/Dashboard.css";

// v3.0.6 (security, L10): news items come from news.json, which is
// operator-controlled — but a javascript: (or data:) link would execute
// on click if it ever slipped in. Only http(s) links are rendered.
const isSafeHttpUrl = (url) =>
    typeof url === "string" && /^(https?:\/\/)/i.test(url.trim());

const daysLeft = (expiresAt) => {
    if (!expiresAt) return null;
    return Math.ceil((new Date(expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
};

const STATUS_COLORS = {active: "var(--success)", inactive: "var(--muted-2)", expired: "var(--danger)", revoked: "var(--warning)"};
// v3.0.5: pie-slice palette for the byProduct pie/donut types (BarChart
// renders those types now — before, pie/donut silently fell through to
// bars because BarChart only handled line/area/bar).
const PIE_COLORS = ["#6D5DF6", "#10B981", "#F59E0B", "#EC4899", "#06B6D4", "#F43F5E", "#84CC16", "#F97316"];

// v3.0.3: chart height per widget size — S/M/L must render visibly
// different chart sizes, not just different frame widths. Recharts
// draws into a ResponsiveContainer with an explicit pixel height per
// size (v3.0.4), so the svg's rendered height grows with the size at
// every viewport, including 360px.
const CHART_HEIGHT = {S: 150, M: 200, L: 280};
const BAR_HEIGHT = {S: 140, M: 190, L: 250};
const DONUT_SIZE = {S: 120, M: 180, L: 240};
// v3.0.10: webhook chart height per size — the widget took no size
// prop and rendered a fixed 150px chart, so S/M/L changed nothing
// below 1024px and M/L were identical at 1024px (measured).
const WEBHOOK_HEIGHT = {S: 110, M: 150, L: 200};

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

/** Chart header: icon + centered title. With `action` (v3.0.6, the widget
 * collapse button) the header becomes the same 1fr/auto/1fr grid the
 * Services header already uses, so the title stays centered and the
 * action sits at the end — never overlapping the title.
 * v3.0.12: the title text lives in its own `.chart-title-label` span:
 * a bare text node inside the inline-flex title became one anonymous
 * flex item that never wrapped, and the old `auto` centre column sized
 * to max-content, so long Persian titles overflowed the card and
 * clipped at the edge in RTL. The centre column is minmax(0, auto)
 * now and the third column has a 70px floor (refresh 32 + collapse 32
 * + 6 gap), so the action always fits its track instead of spilling
 * over the title; the label wraps to at most two lines (ellipsis +
 * full text in the `title` attribute past that). */
function ChartTitle({icon, title, action}) {
    const label = typeof title === "string" ? title : "";
    return (
        <h3 className={`chart-title-with-action${action ? "" : " chart-title-no-action"}`}>
            <span className="chart-title-text">
                {icon ? <span className="chart-title-icon">{icon}</span> : null}
                <span className="chart-title-label" title={label || undefined}>{title}</span>
            </span>
            {action ? <span className="chart-title-action">{action}</span> : null}
        </h3>
    );
}

/** Donut / pie / bar breakdown of licenses by status (Recharts, v3.0.4). */
function DonutChart({data, title, t, size = "M", type = "donut", icon, action}) {
    const total = Object.values(data).reduce((a, b) => a + b, 0);
    const entries = Object.entries(data).filter(([, v]) => v > 0).map(([key, value]) => ({key, value}));
    const donutPx = DONUT_SIZE[size] || 180;
    return (
        <div className="chart-card">
            <ChartTitle icon={icon} title={title} action={action} />
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
function BarChart({data, title, color, size = "M", type = "bar", icon, action}) {
    const height = BAR_HEIGHT[size] || 190;
    const donutPx = DONUT_SIZE[size] || 180;
    return (
        <div className="chart-card">
            <ChartTitle icon={icon} title={title} action={action} />
            {data.length === 0 ? <p className="dashboard-empty">—</p> : type === "pie" || type === "donut" ? (
                <div className="chart-body">
                    <div className="donut-wrap" style={{width: donutPx, height: donutPx}}>
                        <ResponsiveContainer width="100%" height="100%">
                            <RPieChart>
                                <Pie data={data} dataKey="value" nameKey="label"
                                    innerRadius={type === "pie" ? 0 : "62%"} outerRadius="85%"
                                    paddingAngle={2} stroke="var(--surface)" strokeWidth={2}>
                                    {data.map((d, i) => (
                                        <Cell key={d.label} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={TOOLTIP_STYLE} />
                            </RPieChart>
                        </ResponsiveContainer>
                        {type === "donut" && <span className="donut-center">{data.reduce((a, d) => a + d.value, 0)}</span>}
                    </div>
                    <ul className="chart-legend">
                        {data.map((d, i) => (
                            <li key={d.label}>
                                <span className="legend-dot" style={{background: PIE_COLORS[i % PIE_COLORS.length]}} />
                                {d.label}: {d.value}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : (
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
function TrendChart({points, title, lang, size = "M", type = "line", icon, widgetId = "trend", action}) {
    const height = CHART_HEIGHT[size] || 200;
    const gradId = `trend-fill-${widgetId}`;
    return (
        <div className="chart-card chart-card-wide">
            <ChartTitle icon={icon} title={title} action={action} />
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
function WebhookStatsWidget({stats, title, t, size = "M", type = "bar", icon, action}) {
    const height = WEBHOOK_HEIGHT[size] || 150;
    if (!stats) return (
        <div className="chart-card">
            <ChartTitle icon={icon} title={title} action={action} />
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
            <ChartTitle icon={icon} title={title} action={action} />
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
                <ResponsiveContainer width="100%" height={height}>
                    <RLineChart data={lineData} margin={{top: 8, right: 8, bottom: 4, left: 0}}>
                        <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="event" interval={0} tickLine={false} axisLine={false} tick={{fontSize: 9, fill: "var(--muted)"}} />
                        <YAxis domain={[0, 100]} width={28} tickLine={false} axisLine={false} tick={AXIS_TICK} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}%`, t("dashboard.webhookSuccessRate")]} />
                        <Line type="monotone" dataKey="pct" stroke="var(--accent)" strokeWidth={2} dot={{r: 3, fill: "var(--accent)"}} />
                    </RLineChart>
                </ResponsiveContainer>
            ) : (
                <ResponsiveContainer width="100%" height={height}>
                    <RBarChart data={lineData} layout="vertical" margin={{top: 4, right: 12, bottom: 4, left: 4}}>
                        <XAxis type="number" domain={[0, 100]} hide />
                        <YAxis type="category" dataKey="event" width={110} tickLine={false} axisLine={false}
                            tick={{fontSize: 10, fill: "var(--text)"}} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v}%`, t("dashboard.webhookSuccessRate")]} />
                        <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                            {lineData.map((d) => (
                                <Cell key={d.event} fill={d.pct >= 90 ? "var(--success)" : d.pct >= 70 ? "var(--accent)" : "var(--danger)"} />
                            ))}
                        </Bar>
                    </RBarChart>
                </ResponsiveContainer>
            )}
        </div>
    );
}

/** Sending activity chart (v3.0, Recharts v3.0.4): per-day sent (green)
 * + failed (red) bars / lines / areas for one channel (or all). */
function SendingChart({series, title, t, size = "M", type = "bar", icon, action}) {
    const height = CHART_HEIGHT[size] || 200;
    const total = series.reduce((a, d) => a + d.sent + d.failed, 0);
    const interval = Math.max(0, Math.ceil(series.length / 7) - 1);
    return (
        <div className="chart-card chart-card-wide">
            <ChartTitle icon={icon} title={title} action={action} />
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
// (user decision, 2026-11-26). Every block renders on the page in
// layout.order, in one unified grid (the summary renders above it,
// pinned, full-width, always open).
const WIDGET_IDS = ["trend", "status", "perMonth", "byProduct", "activations", "webhooks", "services", "sending"];
// v3.0.11: EVERY dashboard block except the summary is a real widget
// now — the 8 sections join the same unified layout.order, the same
// S/M/L grid, the same ↑/↓/←/→ reorder and the same per-widget refresh
// as the chart widgets. The v3.0.4/v3.0.5 claim that sections "never
// get the full widget S/M/L width" is REVERSED by the user (2026-11-28):
// the 4 table sections were dry empty tables, stuck mid-page, never
// resizable and not movable — so they become widgets in the current
// glass style (not a copy of the WHMCS screenshot he sent). The
// summary stays pinned at the top, full-width, always open, with NO
// size / reorder / refresh / collapse controls (v3.0.10 rule stands;
// its density control stays as-is).
const SECTION_IDS = ["summary", "actions", "highlights", "news", "expiring", "recentLicenses", "recentApiKeys", "recentUsers"];
const ALL_BLOCK_IDS = ["summary", "actions", "highlights", "news", "trend", "status", "perMonth", "byProduct", "activations", "webhooks", "services", "sending", "expiring", "recentLicenses", "recentApiKeys", "recentUsers"];
const SECTION_SIZES = ["compact", "normal", "roomy"];
const DEFAULT_SECTION_SIZES = {summary: "normal", actions: "normal", highlights: "normal", news: "normal", expiring: "normal", recentLicenses: "normal", recentApiKeys: "normal", recentUsers: "normal"};
// v3.0.11: default S/M/L per block — tables need width (expiring and
// recentLicenses default L = full row; recentApiKeys/recentUsers M),
// the highlights slider and quick actions read best full-width (L),
// news M. The user can change any of them in Customize.
const DEFAULT_BLOCK_SIZES = {trend: "L", status: "M", perMonth: "M", byProduct: "M", activations: "L", webhooks: "M", services: "L", sending: "L", actions: "L", highlights: "L", news: "M", expiring: "L", recentLicenses: "L", recentApiKeys: "M", recentUsers: "M"};
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
    order: [...ALL_BLOCK_IDS],
    sizes: {...DEFAULT_BLOCK_SIZES},
    ranges: {trend: 14, activations: 14, perMonth: 6, byProduct: 90, sending: 14},
    hidden: {},
    types: {...DEFAULT_TYPES},
    // v3.0.5: bounded section density (compact/normal/roomy) — the
    // inner-spacing control that STAYS alongside S/M/L in v3.0.11
    // (density changes padding/row height, S/M/L changes the grid
    // footprint; both persist per admin).
    sectionSizes: {...DEFAULT_SECTION_SIZES},
    // v3.0.6: collapsed widgets (id -> true) — a folded widget shows
    // only its header in place; expanded is the default (no key).
    collapsed: {},
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
    // v3.0.5: bounded section density — unknown ids/values fall back to
    // normal, so layouts saved before v3.0.5 keep working unchanged.
    const sectionSizes = {...DEFAULT_SECTION_SIZES};
    for (const [id, sz] of Object.entries(saved.sectionSizes || {})) {
        if (SECTION_IDS.includes(id) && SECTION_SIZES.includes(sz)) sectionSizes[id] = sz;
    }
    // v3.0.6: collapsed widgets — unknown ids are dropped, non-boolean
    // values ignored, so layouts saved before v3.0.6 keep working.
    // v3.0.9: sections collapse too — the same filter covers them.
    // v3.0.10: the SUMMARY section never collapses — a stale
    // collapsed.summary=true from v3.0.9 is dropped here on load and
    // never re-saved, so the summary is always expanded.
    const collapsed = {};
    for (const [id, v] of Object.entries(saved.collapsed || {})) {
        if (id === "summary") continue;
        if ((WIDGET_IDS.includes(id) || SECTION_IDS.includes(id)) && v === true) collapsed[id] = true;
    }
    // v3.0.11: the order holds ALL 16 blocks now. Layouts saved before
    // v3.0.11 hold only the 8 chart widgets — the sections are appended
    // in their current fixed order (summary first, pinned at the top
    // of the page), so an old layout loads as the full order with no
    // crash and no visible change. Unknown ids are dropped.
    const order = [...new Set(saved.order)].filter((id) => ALL_BLOCK_IDS.includes(id));
    for (const id of ALL_BLOCK_IDS) if (!order.includes(id)) order.push(id);
    const pinnedOrder = ["summary", ...order.filter((id) => id !== "summary")];
    // v3.0.11: S/M/L covers every block now (sections join the same
    // map); unknown ids/values fall back to the per-block defaults.
    const sizes = {...DEFAULT_BLOCK_SIZES};
    for (const [id, sz] of Object.entries(saved.sizes || {})) {
        if (ALL_BLOCK_IDS.includes(id) && ["S", "M", "L"].includes(sz)) sizes[id] = sz;
    }
    return {
        order: pinnedOrder,
        sizes,
        ranges: {...DEFAULT_LAYOUT.ranges, ...(saved.ranges || {})},
        hidden: {...(saved.hidden || {})},
        types,
        sectionSizes,
        collapsed,
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
    news: <Newspaper size={16} />,
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
    // Live auto-refresh (v3.0.11): time of the last successful fetchAll.
    const [lastUpdated, setLastUpdated] = useState(null);
    const [slide, setSlide] = useState(0);
    const [paused, setPaused] = useState(false);
    // Panel news (v3.0.5): items from GET /api/news (the repo-root
    // news.json). Never breaks the dashboard when the call fails.
    const [newsItems, setNewsItems] = useState([]);
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
    // v3.0.11: per-widget refresh — refreshing[id] spins ONLY that
    // block's refresh icon; refreshError[id] shows a brief error state
    // on that block (cleared after 4s), never a page crash. The ref
    // guards double-clicks without re-creating the refresh callback.
    const [refreshing, setRefreshing] = useState({});
    const [refreshError, setRefreshError] = useState({});
    const refreshingRef = useRef({});
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
    // v3.0.11: the unified grid list — every visible non-summary
    // block in layout.order (chart widgets AND sections). The summary
    // is pinned above the grid and never appears here.
    const gridBlocks = useMemo(() => layout.order.filter((id) => id !== "summary" && !layout.hidden[id]), [layout]);

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
    // v3.0.11: returns false on failure and, in quiet mode, skips the
    // global toast — the per-widget refresh shows the error on the
    // block instead.
    const fetchServiceStatus = useCallback(async ({quiet = false} = {}) => {
        setServiceLoading(true);
        try {
            const data = await get("/system/service-status");
            setServiceStatus(Array.isArray(data.services) ? data.services : []);
            setServiceCheckedAt(data.checked_at || new Date().toISOString());
            setServiceCountdown(SERVICE_REFRESH_SECONDS);
            return true;
        } catch (err) {
            setServiceStatus([]);
            if (!quiet) toast.error(err.message || t("common.error"));
            return false;
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
    // channel switch is client-side only). v3.0.11: extracted to a
    // callback so the per-widget refresh button can re-fetch it;
    // returns false on failure so refreshBlock can show the block
    // error state.
    const fetchSendingStats = useCallback(async () => {
        setSendingLoading(true);
        try {
            const d = await get(`/system/sending-stats?days=${layout.ranges.sending}`);
            setSendingStats(d && d.series ? d.series : null);
            return true;
        } catch (e) {
            setSendingStats(null);
            return false;
        } finally {
            setSendingLoading(false);
        }
    }, [layout.ranges.sending]);
    useEffect(() => { fetchSendingStats(); }, [fetchSendingStats]);

    const slides = useMemo(() => [
        // v3.0.5: slide 1 renders the CURRENT version from the shared
        // constant (frontend/src/version.js) — the old hard-coded
        // "New in v2.3" text in the translation string could never go
        // stale again; the {version} placeholder is filled here.
        {title: t("dashboard.slide1Title").replace("{version}", APP_VERSION), text: t("dashboard.slide1Text").replace("{version}", APP_VERSION)},
        {title: t("dashboard.slide2Title"), text: t("dashboard.slide2Text")},
        {title: t("dashboard.slide3Title"), text: t("dashboard.slide3Text")},
    ], [t]);

    useEffect(() => {
        if (paused) return;
        const id = setInterval(() => setSlide((s) => (s + 1) % slides.length), 5000);
        return () => clearInterval(id);
    }, [paused, slides.length]);

    // v3.0.11: quiet mode is the per-widget refresh path — it reloads
    // the same data without the page-level skeleton and without the
    // global error toast; the caller shows the error on the block
    // instead (refreshBlock rethrows). A 401 still navigates away.
    const fetchAll = useCallback(async ({quiet = false} = {}) => {
        if (!quiet) setLoading(true);
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
            setLastUpdated(new Date());
        } catch (err) {
            if (err.status === 401) { navigate("/"); return; }
            if (quiet) throw err;
            setError(err.message || t("common.failedFetch"));
            toast.error(err.message || t("common.failedFetch"));
        } finally {
            if (!quiet) setLoading(false);
        }
    }, [navigate, t, toast]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    // Live auto-refresh (v3.0.11): re-run fetchAll quietly every 60s
    // while the dashboard is mounted; pauses while the tab is hidden.
    // fetchAll({quiet: true}) never shows a skeleton, never toasts on a
    // failed tick, and never touches modals, filters or layout state.
    useLiveRefresh(() => fetchAll({quiet: true}));

    // Panel news (v3.0.5): in demo mode the live news.json is read
    // straight from GitHub, so editing the file publishes news to demo
    // users too; any failure falls back to the mock (seeded items that
    // mirror the file). The real backend reads the same file from the
    // repo root. News must never break the dashboard.
    // v3.0.11: extracted to a callback so the per-widget refresh
    // button can re-fetch it.
    const fetchNews = useCallback(async () => {
        if (DEMO_MODE) {
            try {
                const ctrl = new AbortController();
                const timer = setTimeout(() => ctrl.abort(), 4000);
                const res = await fetch("https://raw.githubusercontent.com/rzatkv/LicenseManagerPro/main/news.json", {signal: ctrl.signal});
                clearTimeout(timer);
                if (res.ok) {
                    const data = await res.json();
                    if (data && Array.isArray(data.items)) { setNewsItems(data.items); return; }
                }
            } catch (e) { /* fall through to the mock */ }
        }
        try {
            const data = await get("/news");
            if (data && Array.isArray(data.items)) setNewsItems(data.items);
        } catch (e) { /* news must never break the dashboard */ }
    }, []);
    useEffect(() => { fetchNews(); }, [fetchNews]);

    // v3.0.11: per-widget refresh — one block's icon spins while its
    // data reloads; only that block's icon, never the page skeleton.
    // In demo mode the mock returns the same static data, so refresh
    // spins and re-renders with unchanged data (honest: the mock has
    // no live data to change). Highlights/actions have no data source —
    // the button spins briefly and settles. Errors show on the block
    // only, never as a page crash or a global toast.
    const refreshBlock = useCallback(async (id) => {
        if (refreshingRef.current[id]) return;
        refreshingRef.current[id] = true;
        setRefreshing((p) => ({...p, [id]: true}));
        setRefreshError((p) => ({...p, [id]: ""}));
        try {
            if (id === "services") {
                const ok = await fetchServiceStatus({quiet: true});
                await fetchSmsBalance(true);
                if (!ok) throw new Error(t("common.failedFetch"));
            } else if (id === "sending") {
                const ok = await fetchSendingStats();
                if (!ok) throw new Error(t("common.failedFetch"));
            } else if (id === "news") {
                await fetchNews();
            } else if (id === "highlights" || id === "actions") {
                await new Promise((r) => setTimeout(r, 600));
            } else {
                await fetchAll({quiet: true});
            }
        } catch (e) {
            setRefreshError((p) => ({...p, [id]: e.message || t("common.failedFetch")}));
            setTimeout(() => setRefreshError((p) => ({...p, [id]: ""})), 4000);
        } finally {
            refreshingRef.current[id] = false;
            setRefreshing((p) => ({...p, [id]: false}));
        }
    }, [fetchServiceStatus, fetchSmsBalance, fetchSendingStats, fetchNews, fetchAll, t]);

    // The refresh button itself: visible always (not only in customize
    // mode), next to the collapse chevron in every non-summary block
    // header. data-refresh-block is the verify script's hook.
    const refreshBtnFor = (id) => (
        <button
            type="button"
            className={`widget-refresh-btn${refreshing[id] ? " spinning" : ""}`}
            aria-label={t("dashboard.refresh")}
            title={t("dashboard.refresh")}
            data-refresh-block={id}
            disabled={!!refreshing[id]}
            onClick={() => refreshBlock(id)}
        >
            <RefreshCw size={16} />
        </button>
    );

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

    // v3.0.5: bounded section size (density) — shown on each section while
    // customizing. Density only changes padding/row height, never the
    // section width: sections are not widgets, so they never get S/M/L.
    const sectionDensityClass = (id) => `section-density-${(layout.sectionSizes && layout.sectionSizes[id]) || "normal"}`;
    // v3.0.9: collapse for EVERY dashboard block — the same 32px
    // chevron + per-admin persisted layout.collapsed[id] the chart
    // widgets got in v3.0.6, extended to the 8 sections (summary,
    // actions, highlights, news, expiring, recent licenses/API keys/
    // users). Sections stay visibility-only for S/M/L (v3.0.4 rule);
    // collapse is separate from visibility and from size. A collapsed
    // block shows only its title row + expand chevron; the state
    // persists like any other layout field (localStorage +
    // /users/me/preferences) and survives a reload.
    // v3.0.10: the summary never collapses — isCollapsed("summary")
    // is always false even if a stale flag somehow reaches state.
    const isCollapsed = (id) => id !== "summary" && !!(layout.collapsed && layout.collapsed[id]);
    const toggleCollapse = (id) => setLayout((prev) => ({...prev, collapsed: {...(prev.collapsed || {}), [id]: !prev.collapsed[id]}}));
    const collapseBtnFor = (id, extraClass) => {
        const collapsed = isCollapsed(id);
        return (
            <button
                type="button"
                className={`widget-collapse-btn${extraClass ? ` ${extraClass}` : ""}${collapsed ? " collapsed" : ""}`}
                aria-expanded={!collapsed}
                aria-label={collapsed ? t("dashboard.expand") : t("dashboard.collapse")}
                title={collapsed ? t("dashboard.expand") : t("dashboard.collapse")}
                data-collapse-section={id}
                onClick={() => toggleCollapse(id)}
            >
                <ChevronDown size={16} />
            </button>
        );
    };
    const sectionDensityControl = (id) => {
        if (!customizing || isCollapsed(id)) return null;
        const current = (layout.sectionSizes && layout.sectionSizes[id]) || "normal";
        // v3.0.12: every body control sits in a raised card — the
        // density pills are a per-block setting, so they get one.
        // The summary never collapses, so its card stays visible;
        // for sections the caller renders this inside the
        // collapsible body, so collapsing hides it with the block.
        return (
            <div className="widget-controls-card section-density-card">
            <div className="section-density-control" role="group" aria-label={t("dashboard.sectionSize")}>
                <span className="widget-control-label">{t("dashboard.sectionSize")}</span>
                {SECTION_SIZES.map((sz) => (
                    <button
                        key={sz}
                        type="button"
                        className={current === sz ? "widget-size-btn active" : "widget-size-btn"}
                        aria-pressed={current === sz}
                        data-size-value={sz}
                        onClick={() => setLayout((prev) => ({...prev, sectionSizes: {...(prev.sectionSizes || {}), [id]: sz}}))}
                    >
                        {t(`dashboard.sectionSize${sz === "compact" ? "Compact" : sz === "roomy" ? "Roomy" : "Normal"}`)}
                    </button>
                ))}
            </div>
            </div>
        );
    };

    // v3.0.11: shared block helpers — one title, one move and one drag
    // implementation for chart widgets AND sections (they are all
    // widgets now). The summary is never passed here: it is pinned,
    // has no size/reorder/refresh/collapse controls.
    const blockTitle = (id) => {
        switch (id) {
            case "trend": return t("dashboard.trendTitle");
            case "status": return t("dashboard.byStatus");
            case "perMonth": return t("dashboard.createdPerMonth");
            case "byProduct": return t("dashboard.byProduct");
            case "activations": return t("dashboard.activationsTrend");
            case "webhooks": return t("dashboard.webhookStats");
            case "services": return t("dashboard.serviceStatusTitle");
            case "sending": return t(`dashboard.sendingChannel.${sendingChannel}`);
            case "actions": return t("dashboard.quickActions");
            case "highlights": return t("dashboard.sections.highlights");
            case "news": return t("news.title");
            case "expiring": return t("dashboard.expiringSoon");
            case "recentLicenses": return t("dashboard.recentLicenses");
            case "recentApiKeys": return t("dashboard.recentApiKeys");
            case "recentUsers": return t("dashboard.recentUsers");
            default: return id;
        }
    };
    // Visible non-summary blocks in grid order — the list every move
    // operates on (the summary is pinned above the grid, hidden blocks
    // are not on screen).
    const gridBlockIds = () => layout.order.filter((x) => x !== "summary" && !layout.hidden[x]);
    // Grid columns at click time (same breakpoints as Dashboard.css):
    // 1 column below 1024px, 2 at >=1024px, 3 at >=1440px.
    const gridColumns = () => (typeof window === "undefined" ? 1 : window.innerWidth >= 1440 ? 3 : window.innerWidth >= 1024 ? 2 : 1);
    // Four-directional move (v3.0.11, user 2026-11-28 09:03): ←/→ swap
    // with the adjacent block in the row, ↑/↓ with the block one row
    // above/below (offset = column count). Edge moves are no-ops; the
    // buttons disable themselves there (see moveEnabled).
    const moveBlock = (id, dir) => {
        const ids = gridBlockIds();
        const pos = ids.indexOf(id);
        if (pos < 0) return;
        const cols = gridColumns();
        let target = -1;
        if (dir === "left" && pos % cols !== 0) target = pos - 1;
        if (dir === "right" && (pos + 1) % cols !== 0 && pos + 1 < ids.length) target = pos + 1;
        if (dir === "up" && pos >= cols) target = pos - cols;
        if (dir === "down" && pos + cols < ids.length) target = pos + cols;
        if (target < 0) return;
        setLayout((prev) => {
            const order = [...prev.order];
            const a = order.indexOf(ids[pos]);
            const b = order.indexOf(ids[target]);
            if (a < 0 || b < 0) return prev;
            [order[a], order[b]] = [order[b], order[a]];
            return {...prev, order};
        });
    };
    const moveEnabled = (id, dir) => {
        const ids = gridBlockIds();
        const pos = ids.indexOf(id);
        if (pos < 0) return false;
        const cols = gridColumns();
        if (dir === "left") return pos % cols !== 0;
        if (dir === "right") return (pos + 1) % cols !== 0 && pos + 1 < ids.length;
        if (dir === "up") return pos >= cols;
        if (dir === "down") return pos + cols < ids.length;
        return false;
    };
    // v3.0.11 scope addition #2 (user 2026-11-28 09:07): mouse
    // drag-and-drop — ONLY the grip handle is a drag source (the
    // wrapper is a drop target only). Dragging from anywhere else —
    // text, buttons, charts — never starts a drag, so refresh,
    // collapse, size and direction buttons keep working and text
    // selection/scrolling are untouched. Drag exists only in
    // customize mode (the handle renders only there).
    const blockDragProps = (id) => ({
        onDragOver: (e) => { if (customizing) e.preventDefault(); },
        onDrop: (e) => {
            e.preventDefault();
            const dragged = e.dataTransfer.getData("text/plain");
            if (!dragged || dragged === id || dragged === "summary") return;
            setLayout((prev) => {
                const order = prev.order.filter((x) => x !== dragged);
                order.splice(order.indexOf(id), 0, dragged);
                return {...prev, order};
            });
        },
    });
    const dragHandleProps = (id) => ({
        draggable: customizing,
        onDragStart: (e) => {
            e.dataTransfer.setData("text/plain", id);
            e.dataTransfer.effectAllowed = "move";
            // Drag the whole block card as the ghost image, not the
            // tiny grip (guarded: setDragImage throws in some heads).
            try {
                const card = e.currentTarget.closest("[data-block]");
                if (card) e.dataTransfer.setDragImage(card, 20, 20);
            } catch (err) { /* default ghost image */ }
        },
    });
    // Customize-mode controls shared by every non-summary block: the
    // S/M/L size pills + the four move buttons (← → ↑ ↓) + the drag
    // grip. Density stays as the separate inner-spacing control
    // (sectionDensityControl). data-size-block / data-move-block are
    // the verify script's hooks.
    // v3.0.12: the bar lives INSIDE the collapsible body, in its own
    // raised card — it is NOT available on a collapsed widget (user
    // 2026-11-28 12:13, reversing the v3.0.6 exception): expand the
    // widget first, then resize/move it. The caller renders this
    // inside the expanded branch / block-body only.
    const blockControls = (id) => {
        if (!customizing) return null;
        const size = layout.sizes[id] || "M";
        const dirIcon = {left: <ChevronLeft size={16} />, right: <ChevronRight size={16} />, up: <ChevronUp size={16} />, down: <ChevronDown size={16} />};
        const dirLabel = {left: t("dashboard.moveLeft"), right: t("dashboard.moveRight"), up: t("dashboard.moveUp"), down: t("dashboard.moveDown")};
        return (
            <div className="widget-controls-card widget-customize-card">
            <div className="widget-controls">
                <span className="widget-drag-handle" title={t("dashboard.customize")} data-drag-handle={id} {...dragHandleProps(id)}><GripVertical size={16} /></span>
                <span className="widget-control-group">
                    <span className="widget-control-label">{t("dashboard.size")}</span>
                    {["S", "M", "L"].map((s) => (
                        <button
                            key={s}
                            type="button"
                            className={size === s ? "widget-size-btn active" : "widget-size-btn"}
                            aria-pressed={size === s}
                            data-size-block={id}
                            data-size-value={s}
                            onClick={() => setLayout((prev) => ({...prev, sizes: {...prev.sizes, [id]: s}}))}
                        >
                            {t(`dashboard.size${s}`)}
                        </button>
                    ))}
                </span>
                <span className="widget-control-group">
                    {["left", "right", "up", "down"].map((dir) => (
                        <button
                            key={dir}
                            type="button"
                            className="widget-move-btn"
                            disabled={!moveEnabled(id, dir)}
                            onClick={() => moveBlock(id, dir)}
                            title={dirLabel[dir]}
                            aria-label={dirLabel[dir]}
                            data-move-block={id}
                            data-move-dir={dir}
                        >
                            {dirIcon[dir]}
                        </button>
                    ))}
                </span>
            </div>
            </div>
        );
    };

    // One widget card, with its own range control directly underneath the
    // chart (v3.0: per-chart ranges, independent, persisted in the layout).
    const renderWidget = (id, index) => {
        const size = layout.sizes[id] || "M";
        const chartType = layout.types[id] || DEFAULT_TYPES[id];
        // v3.0.6: collapsible widgets — each widget folds to its header
        // in place. The state lives in the layout like size/order/type,
        // so it persists per admin (localStorage + /users/me/preferences)
        // and survives a reload.
        // v3.0.12: the size/reorder bar (blockControls) and the
        // chart-type/range controls all live INSIDE the collapsible
        // body, each in a raised card — collapsing the widget hides
        // them with it. Only refresh + collapse stay in the header.
        // v3.0.9: the chevron + toggle live in the shared collapseBtnFor
        // helper above (sections use it too).
        const collapsed = isCollapsed(id);
        // v3.0.11: title, move and drag live in the shared block
        // helpers above — widgets and sections move the same way now.
        // Refresh + collapse sit together in the chart header action
        // slot (the title stays exactly centered — see
        // .chart-title-action in Dashboard.css).
        const collapseBtn = collapseBtnFor(id);
        const headerAction = (
            <span className="widget-header-actions">
                {refreshBtnFor(id)}
                {collapseBtn}
            </span>
        );
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
                className={`dashboard-widget widget-size-${size.toLowerCase()}${customizing ? " widget-customizing" : ""}${collapsed ? " widget-collapsed" : ""}`}
                data-block={id}
                {...blockDragProps(id)}
                {...cardMotion(Math.min(index * 0.05, 0.4))}
            >
                {refreshError[id] && <p className="block-refresh-error">{refreshError[id]}</p>}
                {collapsed ? (
                    <div className="widget-collapsed-head">
                        <span className="chart-title-icon">{WIDGET_ICONS[id]}</span>
                        <span className="widget-collapsed-title" title={blockTitle(id)}>{blockTitle(id)}</span>
                        {refreshBtnFor(id)}
                        {collapseBtn}
                    </div>
                ) : (
                <>
                {/* v3.0.12: customize bar inside the body — hidden while
                    collapsed; expand first, then resize/move. */}
                {blockControls(id)}
                {id === "trend" && (
                    <>
                        <TrendChart points={trend} title={`${t("dashboard.trendTitle")} · ${layout.ranges.trend} ${t("common.days")}`} lang={lang} size={size} type={chartType} icon={WIDGET_ICONS.trend} widgetId="trend" action={headerAction} />
                        <div className="widget-controls-card">
                        {typeControl("trend")}
                        {rangeControl("trend", RANGE_OPTIONS, "common.days")}
                        </div>
                    </>
                )}
                {id === "status" && (
                    <>
                        <DonutChart data={statusCounts} title={t("dashboard.byStatus")} t={t} size={size} type={chartType} icon={WIDGET_ICONS.status} action={headerAction} />
                        <div className="widget-controls-card">
                        {typeControl("status")}
                        </div>
                    </>
                )}
                {id === "perMonth" && (
                    <>
                        <BarChart data={perMonth} title={t("dashboard.createdPerMonth")} color="var(--accent)" size={size} type={chartType} icon={WIDGET_ICONS.perMonth} action={headerAction} />
                        <div className="widget-controls-card">
                        {typeControl("perMonth")}
                        {rangeControl("perMonth", MONTH_OPTIONS, "common.months")}
                        </div>
                    </>
                )}
                {id === "byProduct" && (
                    <>
                        <BarChart data={byProduct} title={t("dashboard.byProduct")} color="var(--success)" size={size} type={chartType} icon={WIDGET_ICONS.byProduct} action={headerAction} />
                        <div className="widget-controls-card">
                        {typeControl("byProduct")}
                        {rangeControl("byProduct", RANGE_OPTIONS, "common.days")}
                        </div>
                    </>
                )}
                {id === "activations" && (
                    <>
                        <TrendChart points={activations} title={`${t("dashboard.activationsTrend")} · ${layout.ranges.activations} ${t("common.days")}`} lang={lang} size={size} type={chartType} icon={WIDGET_ICONS.activations} widgetId="activations" action={headerAction} />
                        <div className="widget-controls-card">
                        {typeControl("activations")}
                        {rangeControl("activations", RANGE_OPTIONS, "common.days")}
                        </div>
                    </>
                )}
                {id === "webhooks" && (
                    <>
                        <WebhookStatsWidget stats={webhookStats} title={t("dashboard.webhookStats")} t={t} size={size} type={chartType} icon={WIDGET_ICONS.webhooks} action={headerAction} />
                        <div className="widget-controls-card">
                        {typeControl("webhooks")}
                        </div>
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
                            <h3><span className="chart-title-icon">{WIDGET_ICONS.services}</span><span className="chart-title-label" title={t("dashboard.serviceStatusTitle")}>{t("dashboard.serviceStatusTitle")}</span></h3>
                            <div className="service-status-actions">
                                {/* v3.0.11: the Services re-check IS this widget's
                                    per-widget refresh — same handler, spinner
                                    and data-refresh-block hook as every other
                                    block (it also re-checks the SMS balance). */}
                                <button type="button" className={`btn-ghost btn-icon${refreshing[id] ? " spinning" : ""}`} aria-label={t("dashboard.refresh")} title={t("dashboard.refresh")} data-refresh-block={id} onClick={() => refreshBlock(id)} disabled={serviceLoading || !!refreshing[id]}>
                                    <RefreshCw size={16} />
                                </button>
                                {collapseBtn}
                            </div>
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
                        {/* v3.0.12: the channel switcher is a body control —
                            it gets its own raised card like type/range. */}
                        <div className="widget-controls-card">
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
                                    action={headerAction}
                                />
                                <div className="widget-controls-card">
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
                                </div>
                            </>
                        )}
                    </div>
                )}
                </>
                )}
            </motion.div>
        );
    };

    // v3.0.11: sections render as real widgets now — the same glass
    // card, header chrome (icon + centered title + count badge +
    // refresh + collapse), S/M/L + ↑/↓/←/→ controls and drag handle
    // as the chart widgets, in the current dashboard style. The 4
    // table sections get rich rows (copy buttons, coloured chips and
    // pills, avatars) instead of dry plain tables. Same data, richer
    // rows — every field below comes from the real /api/dashboard
    // response or the demo mock; nothing is invented.
    const userInitials = (user) => {
        const name = String((user && (user.display_name || user.email)) || "?").trim();
        const parts = name.split(/[\s@._-]+/).filter(Boolean);
        return (parts.slice(0, 2).map((p) => p[0]).join("") || "?").toUpperCase();
    };
    const renderSection = (id, index) => {
        const size = layout.sizes[id] || "M";
        const collapsed = isCollapsed(id);
        const collapseBtn = collapseBtnFor(id, "section-collapse-btn");
        // Header count badge for the blocks that have a meaningful
        // count (the 4 tables + news).
        const countFor = {expiring: expiringSoon.length, recentLicenses: recentLicenses.length, recentApiKeys: recentApiKeys.length, recentUsers: recentUsers.length, news: newsItems.length};
        const count = countFor[id];
        const iconFor = {actions: <Zap size={16} />, highlights: <Sparkles size={16} />, news: SECTION_ICONS.news, expiring: SECTION_ICONS.expiring, recentLicenses: SECTION_ICONS.recentLicenses, recentApiKeys: SECTION_ICONS.recentApiKeys, recentUsers: SECTION_ICONS.recentUsers};
        const emptyIconFor = {expiring: <CalendarClock size={28} />, recentLicenses: <FileText size={28} />, recentApiKeys: <KeyRound size={28} />, recentUsers: <Users size={28} />};
        const emptyTextFor = {expiring: t("dashboard.noExpiring"), recentLicenses: t("dashboard.noLicenses"), recentApiKeys: t("dashboard.noApiKeys"), recentUsers: t("dashboard.noUsers")};
        return (
            <motion.div
                key={id}
                className={`dashboard-block widget-size-${size.toLowerCase()} ${sectionDensityClass(id)}${customizing ? " widget-customizing" : ""}${collapsed ? " widget-collapsed" : ""}`}
                data-block={id}
                {...blockDragProps(id)}
                {...cardMotion(Math.min(index * 0.05, 0.4))}
            >
                <div className="block-head">
                    <span className="block-head-title">
                        <span className="chart-title-icon">{iconFor[id]}</span>
                        <span className="chart-title-label" title={blockTitle(id)}>{blockTitle(id)}</span>
                        {count !== undefined && <span className="count-badge" data-count-badge={id}>{count}</span>}
                    </span>
                    <span className="block-head-actions">
                        {refreshBtnFor(id)}
                        {collapseBtn}
                    </span>
                </div>
                {refreshError[id] && <p className="block-refresh-error">{refreshError[id]}</p>}
                {!collapsed && (
                <div className="block-body">
                {/* v3.0.12: customize bar + density control inside the
                    body, each in a raised card — hidden while collapsed;
                    expand first, then resize/move. */}
                {blockControls(id)}
                {sectionDensityControl(id)}
                {id === "actions" && (
                    <div className="action-buttons">
                        <Link className="action-btn" to="/licenses"><Plus size={16} />{t("dashboard.createLicense")}</Link>
                        <Link className="action-btn" to="/api-keys"><KeyRound size={16} />{t("dashboard.createApiKey")}</Link>
                        <Link className="action-btn" to="/users"><UserPlus size={16} />{t("dashboard.addUser")}</Link>
                        <Link className="action-btn" to="/products"><Boxes size={16} />{t("nav.products")}</Link>
                        <Link className="action-btn" to="/docs"><BookOpen size={16} />{t("nav.apiDocs")}</Link>
                        <Link className="action-btn" to="/settings"><SettingsIcon size={16} />{t("dashboard.settings")}</Link>
                    </div>
                )}
                {id === "highlights" && (
                    <div className="highlights-slider" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
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
                {id === "news" && (
                    <>
                    {newsItems.length === 0 ? (
                        <p className="dashboard-empty table-empty"><Newspaper size={28} />{t("news.empty")}</p>
                    ) : (
                        <ul className="news-list">
                            {newsItems.map((item) => {
                                const title = (lang === "fa" ? item.title?.fa : item.title?.en) || item.title?.en || item.title?.fa || "";
                                const body = (lang === "fa" ? item.body?.fa : item.body?.en) || item.body?.en || item.body?.fa || "";
                                return (
                                    <li key={item.id} className="news-item">
                                        <div className="news-item-head">
                                            <span className="news-item-title">{title}</span>
                                            {item.date ? <span className="news-item-date">{formatDate(item.date, lang)}</span> : null}
                                        </div>
                                        {body ? <p className="news-item-body">{body}</p> : null}
                                        {isSafeHttpUrl(item.link) ? <a className="news-item-link" href={item.link} target="_blank" rel="noreferrer">{t("news.readMore")} <ExternalLink size={14} /></a> : null}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    </>
                )}
                {id === "expiring" && (
                    <>
                    {expiringSoon.length === 0 ? (
                        <p className="dashboard-empty table-empty">{emptyIconFor.expiring}{emptyTextFor.expiring}</p>
                    ) : (
                        <div className="table-wrap">
                        <table className="rich-table">
                            <thead><tr><th className="col-product">{t("dashboard.product")}</th><th>{t("dashboard.licenseKey")}</th><th>{t("dashboard.daysLeft")}</th><th>{t("common.actions")}</th></tr></thead>
                            <tbody>
                            {expiringSoon.map((lic) => {
                                const left = daysLeft(lic.expires_at);
                                return (
                                <tr key={lic.id}>
                                    <td className="col-product rich-product">{lic.product}</td>
                                    <td><span className="key-cell-wrap"><span className="key-cell">{lic.key}</span><CopyButton text={lic.key} /></span></td>
                                    <td className="nowrap"><span className={`days-chip${left <= 7 ? " days-urgent" : " days-soon"}`}>{left} {t("common.days")}</span></td>
                                    <td><button className="rich-renew-btn" onClick={() => handleRenew(lic.id)}>{t("common.renew")}</button></td>
                                </tr>
                                );
                            })}
                            </tbody>
                        </table>
                        </div>
                    )}
                    <p className="block-view-all"><Link className="action-btn block-view-all-btn" to="/licenses">{t("dashboard.viewAll")} {t("nav.licenses")}</Link></p>
                    </>
                )}
                {id === "recentLicenses" && (
                    <>
                    {recentLicenses.length === 0 ? (
                        <p className="dashboard-empty table-empty">{emptyIconFor.recentLicenses}{emptyTextFor.recentLicenses}</p>
                    ) : (
                        <div className="table-wrap">
                        <table className="rich-table">
                            <thead><tr><th className="col-product">{t("dashboard.product")}</th><th>{t("dashboard.licenseKey")}</th><th>{t("common.status")}</th><th className="col-created">{t("common.createdAt")}</th></tr></thead>
                            <tbody>{recentLicenses.map((lic) => (
                                <tr key={lic.id}>
                                    <td className="col-product rich-product">{lic.product}</td>
                                    <td><span className="key-cell-wrap"><span className="key-cell">{lic.key}</span><CopyButton text={lic.key} /></span></td>
                                    <td><span className={`status-pill status-${lic.status}`}>{t(`common.${lic.status}`) !== `common.${lic.status}` ? t(`common.${lic.status}`) : lic.status}</span></td>
                                    <td className="col-created nowrap">{formatDate(lic.created_at, lang)}</td>
                                </tr>
                            ))}</tbody>
                        </table>
                        </div>
                    )}
                    <p className="block-view-all"><Link className="action-btn block-view-all-btn" to="/licenses">{t("dashboard.viewAll")} {t("nav.licenses")}</Link></p>
                    </>
                )}
                {id === "recentApiKeys" && (
                    <>
                    {recentApiKeys.length === 0 ? (
                        <p className="dashboard-empty table-empty">{emptyIconFor.recentApiKeys}{emptyTextFor.recentApiKeys}</p>
                    ) : (
                        <div className="table-wrap">
                        <table className="rich-table">
                            <thead><tr><th>{t("apikeys.key")}</th><th>{t("apikeys.accessRights")}</th></tr></thead>
                            <tbody>{recentApiKeys.map((key) => (
                                <tr key={key.id}>
                                    <td><span className="key-cell-wrap"><span className="key-cell">{key.key}</span><CopyButton text={key.key} /></span></td>
                                    <td className="rights-cell">{(key.access_rights || []).map((r) => (<span key={r} className="rights-chip">{r}</span>))}</td>
                                </tr>
                            ))}</tbody>
                        </table>
                        </div>
                    )}
                    <p className="block-view-all"><Link className="action-btn block-view-all-btn" to="/api-keys">{t("dashboard.viewAll")} {t("nav.apiKeys")}</Link></p>
                    </>
                )}
                {id === "recentUsers" && (
                    <>
                    {recentUsers.length === 0 ? (
                        <p className="dashboard-empty table-empty">{emptyIconFor.recentUsers}{emptyTextFor.recentUsers}</p>
                    ) : (
                        <div className="table-wrap">
                        <table className="rich-table">
                            <thead><tr><th>{t("common.email")}</th><th>{t("common.role")}</th></tr></thead>
                            <tbody>{recentUsers.map((user) => (
                                <tr key={user.id}>
                                    <td><span className="user-cell"><span className="user-avatar">{userInitials(user)}</span><span className="user-email">{user.email}</span></span></td>
                                    <td><span className={`role-chip role-${user.role}`}>{user.role}</span></td>
                                </tr>
                            ))}</tbody>
                        </table>
                        </div>
                    )}
                    <p className="block-view-all"><Link className="action-btn block-view-all-btn" to="/users">{t("dashboard.viewAll")} {t("nav.users")}</Link></p>
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
                    <LiveIndicator lastUpdated={lastUpdated} />
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
            <>
            {sectionDensityControl("summary")}
            {/* v3.0.10: no collapse chevron on the summary — it is always
                expanded. The other 15 blocks keep theirs. */}
            <div className="section-head">
                <span className="section-head-title"><LayoutDashboard size={16} />{t("dashboard.sections.summary")}</span>
            </div>
            <div className={`dashboard-summary ${sectionDensityClass("summary")}`}>
                {[
                    {label: t("dashboard.apiKeys"), value: summary.apiKeysCount, variant: "violet", to: "/api-keys", card: "apiKeys"},
                    {label: t("dashboard.users"), value: summary.usersCount, variant: "blue", to: "/users", card: "users"},
                    {label: t("dashboard.activeLicenses"), value: summary.activeLicenses, variant: "green", to: "/licenses", card: "active"},
                    {label: t("dashboard.inactiveLicenses"), value: summary.inactiveLicenses, variant: "rose", to: "/licenses", card: "inactive"},
                ].map((box, i) => (
                    <Link key={box.label} to={box.to} className="summary-box-link" data-summary-card={box.card} aria-label={`${box.label}: ${box.value}`}>
                        <motion.div className={`summary-box glass-card summary-box--${box.variant}`} {...cardMotion(i * 0.07)}>
                            <span className="summary-icon">{SUMMARY_ICONS[i]}</span>
                            <span className="summary-text"><h2>{box.label}</h2><p>{box.value}</p></span>
                            <span className="summary-deco" aria-hidden="true">{SUMMARY_ICONS[i]}</span>
                        </motion.div>
                    </Link>
                ))}
            </div>
            </>
            )}
            {/* v3.0.11: ONE unified grid in layout.order — chart widgets
                and sections are all widgets now (the summary renders
                above, pinned). */}
            {gridBlocks.length > 0 && (
            <div className="charts-row">
                {gridBlocks.map((id, i) => WIDGET_IDS.includes(id) ? renderWidget(id, i) : renderSection(id, i))}
            </div>
            )}

            {/* Widget visibility popup (v3.0.4): every dashboard block —
                the 8 chart widgets plus the 8 sections — with a quick
                on/off toggle; takes effect immediately and persists
                with the widget preferences. v3.0.11: listed in the
                unified layout order (summary first, pinned). */}
            <Modal open={gearOpen} onClose={() => setGearOpen(false)} title={t("dashboard.widgetVisibility")}>
                <ul className="widget-visibility-list">
                    {ALL_BLOCK_IDS.map((id) => (
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
