import React, {useEffect, useState, useCallback, useMemo} from "react";
import {Link, useNavigate} from "react-router-dom";
import {get, post} from "../utils/api";
import {useLanguage} from "../i18n";
import "../styles/Dashboard.css";

const daysLeft = (expiresAt) => {
    if (!expiresAt) return null;
    return Math.ceil((new Date(expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
};

const STATUS_COLORS = {active: "#28a745", inactive: "#6c757d", expired: "#dc3545", revoked: "#f59e0b"};

function DonutChart({data, title}) {
    const total = Object.values(data).reduce((a, b) => a + b, 0);
    const size = 180;
    const r = 70;
    const cx = size / 2;
    const cy = size / 2;
    let offset = 0;
    const segments = Object.entries(data).filter(([, v]) => v > 0).map(([key, value]) => {
        const frac = total ? value / total : 0;
        const dash = frac * 2 * Math.PI * r;
        const seg = {key, value, dash, offset};
        offset += dash;
        return seg;
    });
    return (
        <div className="chart-card">
            <h3>{title}</h3>
            {total === 0 ? <p className="dashboard-empty">—</p> : (
                <div className="chart-body">
                    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={title}>
                        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-2)" strokeWidth="28" />
                        {segments.map((s) => (
                            <circle key={s.key} cx={cx} cy={cy} r={r} fill="none"
                                stroke={STATUS_COLORS[s.key] || "#007bff"} strokeWidth="28"
                                strokeDasharray={`${s.dash} ${2 * Math.PI * r - s.dash}`}
                                strokeDashoffset={-s.offset}
                                transform={`rotate(-90 ${cx} ${cy})`} />
                        ))}
                        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fill="var(--text)" fontSize="22" fontWeight="bold">{total}</text>
                    </svg>
                    <ul className="chart-legend">
                        {segments.map((s) => (
                            <li key={s.key}>
                                <span className="legend-dot" style={{background: STATUS_COLORS[s.key] || "#007bff"}} />
                                {s.key}: {s.value}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}

function BarChart({data, title, color}) {
    const max = Math.max(1, ...data.map((d) => d.value));
    const width = 320;
    const height = 180;
    const barW = Math.min(40, (width - 20) / Math.max(1, data.length) - 8);
    return (
        <div className="chart-card">
            <h3>{title}</h3>
            <svg width="100%" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title} preserveAspectRatio="xMidYMid meet">
                {data.map((d, i) => {
                    const h = (d.value / max) * (height - 50);
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
    const {t} = useLanguage();
    const [summary, setSummary] = useState(null);
    const [licenses, setLicenses] = useState([]);
    const [apiKeys, setApiKeys] = useState([]);
    const [users, setUsers] = useState([]);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
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
        }
    }, [navigate, t]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const handleRenew = async (id) => {
        try {
            const renewed = await post(`/licenses/${id}/renew`, {});
            setLicenses((prev) => prev.map((lic) => (lic.id === id ? renewed : lic)));
            setNotice(t("dashboard.renewed"));
            setTimeout(() => setNotice(""), 3000);
            const summaryData = await get("/dashboard/summary");
            setSummary(summaryData);
        } catch (err) {
            setError(err.message || t("common.error"));
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
            const label = d.toLocaleDateString(undefined, {month: "short"});
            const count = licenses.filter((l) => l.created_at && l.created_at.slice(0, 7) === key).length;
            months.push({label, value: count});
        }
        return months;
    }, [licenses]);

    const byProduct = useMemo(() => {
        const map = {};
        for (const lic of licenses) {
            const name = lic.product || "-";
            map[name] = (map[name] || 0) + 1;
        }
        return Object.entries(map).map(([label, value]) => ({label: label.length > 12 ? label.slice(0, 12) + "…" : label, value}))
            .sort((a, b) => b.value - a.value).slice(0, 6);
    }, [licenses]);

    if (error) return <div className="dashboard-error">{error}</div>;
    if (!summary) return <div className="dashboard-loading">{t("common.loading")}</div>;

    const expiringSoon = licenses
        .filter((lic) => { const left = daysLeft(lic.expires_at); return lic.status === "active" && left !== null && left <= 30; })
        .sort((a, b) => daysLeft(a.expires_at) - daysLeft(b.expires_at));
    const recentLicenses = [...licenses].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5);
    const recentApiKeys = [...apiKeys].sort((a, b) => b.id - a.id).slice(0, 5);
    const recentUsers = [...users].sort((a, b) => b.id - a.id).slice(0, 5);

    return (
        <div className="dashboard-container">
            <h1>{t("dashboard.title")}</h1>
            {notice && <p className="dashboard-notice">{notice}</p>}

            <div className="highlights-slider" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
                <div className="slide">
                    <h3>{slides[slide].title}</h3>
                    <p>{slides[slide].text}</p>
                </div>
                <div className="slider-dots">
                    {slides.map((_, i) => (
                        <button key={i} className={`slider-dot${i === slide ? " active" : ""}`} aria-label={`Slide ${i + 1}`} onClick={() => setSlide(i)} />
                    ))}
                </div>
            </div>

            <div className="dashboard-summary">
                <div className="summary-box"><h2>{t("dashboard.apiKeys")}</h2><p>{summary.apiKeysCount}</p></div>
                <div className="summary-box"><h2>{t("dashboard.users")}</h2><p>{summary.usersCount}</p></div>
                <div className="summary-box"><h2>{t("dashboard.activeLicenses")}</h2><p>{summary.activeLicenses}</p></div>
                <div className="summary-box"><h2>{t("dashboard.inactiveLicenses")}</h2><p>{summary.inactiveLicenses}</p></div>
            </div>

            <div className="charts-row">
                <DonutChart data={statusCounts} title={t("dashboard.byStatus")} />
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
                    <table>
                        <thead><tr><th>{t("dashboard.product")}</th><th>{t("dashboard.licenseKey")}</th><th>{t("dashboard.daysLeft")}</th><th>{t("common.actions")}</th></tr></thead>
                        <tbody>
                        {expiringSoon.map((lic) => (
                            <tr key={lic.id}>
                                <td>{lic.product}</td>
                                <td>{lic.key}</td>
                                <td>{daysLeft(lic.expires_at)} {t("common.days")}</td>
                                <td><button onClick={() => handleRenew(lic.id)}>{t("common.renew")}</button></td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="dashboard-section">
                <h2>{t("dashboard.recentLicenses")}</h2>
                {recentLicenses.length === 0 ? <p className="dashboard-empty">{t("dashboard.noLicenses")}</p> : (
                    <table>
                        <thead><tr><th>{t("dashboard.product")}</th><th>{t("dashboard.licenseKey")}</th><th>{t("common.status")}</th><th>{t("common.createdAt")}</th></tr></thead>
                        <tbody>{recentLicenses.map((lic) => (<tr key={lic.id}><td>{lic.product}</td><td>{lic.key}</td><td>{lic.status}</td><td>{lic.created_at}</td></tr>))}</tbody>
                    </table>
                )}
                <p><Link to="/licenses">{t("dashboard.viewAll")} {t("nav.licenses")}</Link></p>
            </div>

            <div className="dashboard-section">
                <h2>{t("dashboard.recentApiKeys")}</h2>
                {recentApiKeys.length === 0 ? <p className="dashboard-empty">{t("dashboard.noApiKeys")}</p> : (
                    <table>
                        <thead><tr><th>{t("apikeys.key")}</th><th>{t("apikeys.accessRights")}</th></tr></thead>
                        <tbody>{recentApiKeys.map((key) => (<tr key={key.id}><td>{key.key}</td><td>{key.access_rights.join(", ")}</td></tr>))}</tbody>
                    </table>
                )}
                <p><Link to="/api-keys">{t("dashboard.viewAll")} {t("nav.apiKeys")}</Link></p>
            </div>

            <div className="dashboard-section">
                <h2>{t("dashboard.recentUsers")}</h2>
                {recentUsers.length === 0 ? <p className="dashboard-empty">{t("dashboard.noUsers")}</p> : (
                    <table>
                        <thead><tr><th>{t("common.email")}</th><th>{t("common.role")}</th></tr></thead>
                        <tbody>{recentUsers.map((user) => (<tr key={user.id}><td>{user.email}</td><td>{user.role}</td></tr>))}</tbody>
                    </table>
                )}
                <p><Link to="/users">{t("dashboard.viewAll")} {t("nav.users")}</Link></p>
            </div>
        </div>
    );
}

export default Dashboard;
