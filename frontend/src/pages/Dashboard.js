import React, {useEffect, useState, useCallback, useMemo} from "react";
import {Link, useNavigate} from "react-router-dom";
import {get, post} from "../utils/api";
import {formatDate, formatMonthShort} from "../utils/format";
import {useLanguage} from "../i18n";
import {useToast} from "../components/Toast";
import {SkeletonCard} from "../components/Skeleton";
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
    const height = 180;
    const barW = Math.min(40, (width - 20) / Math.max(1, data.length) - 8);
    return (
        <div className="chart-card">
            <h3>{title}</h3>
            <svg className="chart-anim" width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title} preserveAspectRatio="xMidYMid meet">
                {data.map((d, i) => {
                    const h = mounted ? (d.value / max) * (height - 50) : 0;
                    const x = 10 + i * ((width - 20) / Math.max(1, data.length)) + (((width - 20) / Math.max(1, data.length)) - barW) / 2;
                    return (
                        <g key={d.label}>
                            <rect x={x} y={height - 30 - h} width={barW} height={h} rx="3" fill={color} />
                            <text x={x + barW / 2} y={height - 34 - h} textAnchor="middle" fill="var(--text)" fontSize="11">{d.value}</text>
                            <text x={x + barW / 2} y={height - 12} textAnchor="middle" fill="var(--muted)" fontSize="10">{d.label}</text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

function Dashboard() {
    const {t, lang} = useLanguage();
    const {toast} = useToast();
    const [summary, setSummary] = useState(null);
    const [licenses, setLicenses] = useState([]);
    const [apiKeys, setApiKeys] = useState([]);
    const [users, setUsers] = useState([]);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [slide, setSlide] = useState(0);
    const [paused, setPaused] = useState(false);
    const navigate = useNavigate();

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
            const [summaryData, licensesData, keysData, usersData] = await Promise.all([
                get("/dashboard/summary"),
                get("/licenses?filter=all"),
                get("/api-keys"),
                get("/users"),
            ]);
            setSummary(summaryData);
            setLicenses(licensesData);
            setApiKeys(keysData.api_keys || []);
            setUsers(usersData);
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
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            const label = formatMonthShort(d, lang);
            const count = licenses.filter((l) => l.created_at && l.created_at.slice(0, 7) === key).length;
            months.push({label, value: count});
        }
        return months;
    }, [licenses, lang]);

    const byProduct = useMemo(() => {
        const map = {};
        for (const lic of licenses) {
            const name = lic.product || "-";
            map[name] = (map[name] || 0) + 1;
        }
        return Object.entries(map).map(([label, value]) => ({label: label.length > 12 ? label.slice(0, 12) + "…" : label, value}))
            .sort((a, b) => b.value - a.value).slice(0, 6);
    }, [licenses]);

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
    const recentLicenses = [...licenses].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
    const recentApiKeys = [...apiKeys].sort((a, b) => b.id - a.id).slice(0, 5);
    const recentUsers = [...users].sort((a, b) => b.id - a.id).slice(0, 5);

    return (
        <div className="dashboard-container page-enter">
            <h1 className="gradient-text">{t("dashboard.title")}</h1>

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

            <div className="charts-row">
                <DonutChart data={statusCounts} title={t("dashboard.byStatus")} t={t} />
                <BarChart data={perMonth} title={t("dashboard.createdPerMonth")} color="var(--accent)" />
                <BarChart data={byProduct} title={t("dashboard.byProduct")} color="var(--success)" />
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
        </div>
    );
}

export default Dashboard;
