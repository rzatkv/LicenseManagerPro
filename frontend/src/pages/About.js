import React, {useState, useEffect} from "react";
import {Link} from "react-router-dom";
import {get} from "../utils/api";
import {formatDateTime} from "../utils/format";
import {useLanguage} from "../i18n";
import {useToast} from "../components/Toast";
import {API_BASE_URL, DEMO_MODE} from "../config";
import TabDropdown from "../components/TabDropdown";
import {Sparkles, Info, RefreshCw, Globe, Heart} from "lucide-react";
import "../styles/About.css";

const GITHUB_URL = "https://github.com/rzatkv/LicenseManagerPro";

// What's-new highlights (v3.0.0). Every bullet is an existing i18n key —
// no new keys, no hard-coded user-visible strings.
const WHATS_NEW_KEYS = [
    "login.twoFactorTitle",
    "roles.title",
    "theme.presets",
    "search.placeholder",
    "security.title",
];

// About (v3.0): hero card on top + the five cards behind tabs — one card
// at a time, so the page never scrolls at any width. The update check
// only *checks* (GET /api/system/update-check); an available update
// links to /settings, where the admin stages it (POST /api/system/update,
// ConfirmModal + admin role). No update is ever triggered from this page.
// "Last updated" shows the date AND time the last update was installed
// (GET /api/system/info lastUpdated, formatDateTime for fa/en digits).
const TABS = ["whatsNew", "systemInfo", "updateCheck", "links", "credits"];
const TAB_TITLES = {
    whatsNew: "about.whatsNew",
    systemInfo: "about.systemInfo",
    updateCheck: "about.updateCheck",
    links: "about.links",
    credits: "about.credits",
};
const ABOUT_TAB_ICONS = {
    whatsNew: <Sparkles size={16} />,
    systemInfo: <Info size={16} />,
    updateCheck: <RefreshCw size={16} />,
    links: <Globe size={16} />,
    credits: <Heart size={16} />,
};

function About() {
    const {t, lang} = useLanguage();
    const {toast} = useToast();
    const [version, setVersion] = useState("");
    const [lastUpdated, setLastUpdated] = useState("");
    const [systemInfo, setSystemInfo] = useState(null);
    const [check, setCheck] = useState(null);
    const [checking, setChecking] = useState(false);
    const [tab, setTab] = useState("whatsNew");

    useEffect(() => {
        const fetchAppInfo = async () => {
            try {
                const data = await get("/system/info");
                setVersion(data.version);
                setLastUpdated(data.lastUpdated);
                setSystemInfo(data);
            } catch (err) {
                console.error("Failed to fetch application info.");
            }
        };
        fetchAppInfo();
    }, []);

    const handleCheck = async () => {
        setChecking(true);
        try {
            const data = await get("/system/update-check");
            setCheck(data);
            if (data.error) toast.error(data.error);
        } catch (err) {
            toast.error(err.message || t("updates.failed"));
        } finally {
            setChecking(false);
        }
    };

    return (
        <div className="about-container page-enter">
            <section className="about-hero glass-card">
                <img src="./logo.svg" alt={t("common.appName")} className="about-logo" />
                <div className="about-hero-text">
                    <h1 className="gradient-text">{t("common.appName")}</h1>
                    <p className="about-version">
                        {t("about.version")} {version || "-"}
                        {DEMO_MODE && <span className="badge badge-accent">{t("common.demo")}</span>}
                    </p>
                    <p className="about-tagline">{t("about.builtWith")}</p>
                </div>
            </section>

            <TabDropdown
              ariaLabel={t("nav.about")}
              value={tab}
              onChange={setTab}
              options={TABS.map((id) => ({value: id, label: t(TAB_TITLES[id]), icon: ABOUT_TAB_ICONS[id]}))}
            />

            <div className="about-tab-panel" key={tab}>
                {tab === "whatsNew" && (
                    <section className="about-card glass-card">
                        <h2>{t("about.whatsNew")}</h2>
                        <ul className="about-whats-new">
                            {WHATS_NEW_KEYS.map((key) => (
                                <li key={key}>{t(key)}</li>
                            ))}
                        </ul>
                    </section>
                )}

                {tab === "systemInfo" && (
                    <section className="about-card glass-card">
                        <h2>{t("about.systemInfo")}</h2>
                        <dl className="about-info-list">
                            <div>
                                <dt>{t("about.version")}</dt>
                                <dd>{version || "-"}</dd>
                            </div>
                            <div>
                                <dt>{t("about.pythonVersion")}</dt>
                                <dd>{systemInfo?.python_version || "-"}</dd>
                            </div>
                            <div>
                                <dt>{t("about.fastapiVersion")}</dt>
                                <dd>{systemInfo?.fastapi_version || "-"}</dd>
                            </div>
                            <div>
                                <dt>{t("about.sqlalchemyVersion")}</dt>
                                <dd>{systemInfo?.sqlalchemy_version || "-"}</dd>
                            </div>
                            <div>
                                <dt>{t("about.pydanticVersion")}</dt>
                                <dd>{systemInfo?.pydantic_version || "-"}</dd>
                            </div>
                            <div>
                                <dt>{t("about.databaseEngine")}</dt>
                                <dd>{systemInfo?.database_engine || "-"}</dd>
                            </div>
                            <div>
                                <dt>{t("about.databaseVersion")}</dt>
                                <dd>{systemInfo?.database_version || "-"}</dd>
                            </div>
                            <div>
                                <dt>{t("about.os")}</dt>
                                <dd>{systemInfo?.os || "-"}</dd>
                            </div>
                            <div>
                                <dt>API</dt>
                                <dd className="about-api-url">{API_BASE_URL}</dd>
                            </div>
                            <div>
                                <dt>{t("about.lastUpdated")}</dt>
                                <dd>{lastUpdated ? formatDateTime(lastUpdated, lang) : "-"}</dd>
                            </div>
                        </dl>
                    </section>
                )}

                {tab === "updateCheck" && (
                    <section className="about-card glass-card">
                        <h2>{t("about.updateCheck")}</h2>
                        <p><strong>{t("updates.current")}:</strong> {version || "-"}</p>
                        {check && (
                            <>
                                <p><strong>{t("updates.latest")}:</strong> {check.latest_version || "-"}</p>
                                {check.update_available ? (
                                    <p>{t("updates.available")}</p>
                                ) : (
                                    <p>{t("updates.upToDate")}</p>
                                )}
                                {check.release_notes && (
                                    <details>
                                        <summary>{t("updates.releaseNotes")}</summary>
                                        <pre>{check.release_notes}</pre>
                                    </details>
                                )}
                                {check.release_url && (
                                    <p><a href={check.release_url} target="_blank" rel="noopener noreferrer">{check.release_url}</a></p>
                                )}
                            </>
                        )}
                        <div className="row-actions">
                            <button onClick={handleCheck} disabled={checking}>
                                {checking ? t("updates.checking") : t("updates.check")}
                            </button>
                            {check && check.update_available && (
                                <Link className="btn-ghost" to="/settings">{t("nav.settings")}</Link>
                            )}
                        </div>
                    </section>
                )}

                {tab === "links" && (
                    <section className="about-card glass-card">
                        <h2>{t("about.links")}</h2>
                        <ul className="about-links">
                            <li><Link to="/docs">{t("nav.apiDocs")}</Link></li>
                            <li><Link to="/downloads">{t("nav.downloads")}</Link></li>
                            <li><Link to="/settings">{t("nav.settings")}</Link></li>
                            <li><a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">GitHub</a></li>
                            <li><a href={`${GITHUB_URL}/releases`} target="_blank" rel="noopener noreferrer">{t("about.changelog")}</a></li>
                        </ul>
                    </section>
                )}

                {tab === "credits" && (
                    <section className="about-card glass-card">
                        <h2>{t("about.credits")}</h2>
                        <p>{t("about.builtWith")}</p>
                        <p>{t("about.versionNotes")}</p>
                    </section>
                )}
            </div>
        </div>
    );
}

export default About;
