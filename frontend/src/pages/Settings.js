import React, {useState, useEffect, useCallback} from "react";
import {get, put, del} from "../utils/api";
import {useLanguage} from "../i18n";
import {useTheme, THEME_PRESETS, DEFAULT_CUSTOM} from "../theme";
import {useToast} from "../components/Toast";
import ConfirmModal from "../components/ConfirmModal";
import ToggleSwitch from "../components/ToggleSwitch";
import {DEMO_MODE} from "../config";
import {resetDemoData} from "../utils/demoData";
import "../styles/Settings.css";

const TABS = ["general", "language", "theme", "security", "advanced"];

// Raster magic bytes (v2.3 security): the logo must be a real PNG/JPEG/
// WebP file, never an SVG (it can carry scripts) and never just an
// extension claim. Same check as the Profile avatar upload.
const LOGO_MAX_BYTES = 2 * 1024 * 1024;
function logoFileIsRaster(file, bytes) {
    if (file.type === "image/png") return bytes[0] === 0x89 && bytes[1] === 0x50;
    if (file.type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8;
    if (file.type === "image/webp") {
        return bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[8] === 0x57 && bytes[9] === 0x45;
    }
    return false;
}

function Settings() {
    const {t, lang, setLang, available} = useLanguage();
    const {mode, setMode, preset, setPreset, custom, setCustom} = useTheme();
    const {toast} = useToast();
    const [tab, setTab] = useState("general");
    const [settings, setSettings] = useState({});
    const [newKey, setNewKey] = useState("");
    const [newValue, setNewValue] = useState("");
    const [pendingDelete, setPendingDelete] = useState(null);
    const [confirmReset, setConfirmReset] = useState(false);
    const [security, setSecurity] = useState(null);
    const [securityError, setSecurityError] = useState("");

    const fetchSettings = useCallback(async () => {
        try {
            const data = await get("/settings");
            setSettings(data);
        } catch (err) {
            console.error("Failed to fetch settings.");
        }
    }, []);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    useEffect(() => {
        if (tab !== "security" || security !== null) return;
        get("/api/settings/license-security")
            .then((data) => setSecurity(data))
            .catch((err) => setSecurityError(err.message || "Failed to load"));
    }, [tab, security]);

    const handleUpdate = async (key, value) => {
        try {
            await put(`/settings/${key}`, {key, value});
            setSettings((prev) => ({...prev, [key]: value}));
            toast.success(t("settings.updated"));
        } catch (err) {
            toast.error(err.message || t("settings.updateFailed"));
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        const key = newKey.trim();
        if (!key) {
            toast.error(t("settings.keyRequired"));
            return;
        }
        try {
            await put(`/settings/${key}`, {key, value: newValue});
            setSettings((prev) => ({...prev, [key]: newValue}));
            setNewKey("");
            setNewValue("");
            toast.success(t("settings.created"));
        } catch (err) {
            toast.error(err.message || t("settings.createFailed"));
        }
    };

    const handleDelete = async (key) => {
        try {
            await del(`/settings/${key}`);
            setSettings((prev) => {
                const next = {...prev};
                delete next[key];
                return next;
            });
            toast.success(t("settings.deleted"));
        } catch (err) {
            toast.error(err.message || t("settings.deleteFailed"));
        }
    };

    const handleResetDemo = () => {
        resetDemoData();
        window.location.reload();
    };

    const handleBrandingSave = async (key, value) => {
        try {
            await put(`/settings/${key}`, {key, value});
            setSettings((prev) => ({...prev, [key]: value}));
            toast.success(t("branding.saved"));
        } catch (err) {
            toast.error(err.message || t("settings.updateFailed"));
        }
    };

    const handleLogoUpload = async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (file.size > LOGO_MAX_BYTES) {
            toast.error(t("profile.avatarTooBig"));
            return;
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!logoFileIsRaster(file, bytes)) {
            toast.error(t("profile.avatarBadType"));
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = String(reader.result || "");
            if (dataUrl) handleBrandingSave("logo_url", dataUrl);
        };
        reader.readAsDataURL(file);
    };

    const handleSecuritySave = async () => {
        try {
            const saved = await put("/api/settings/license-security", security);
            setSecurity(saved);
            toast.success(t("security.saved"));
        } catch (err) {
            toast.error(err.message || t("settings.updateFailed"));
        }
    };

    const setCustomColor = (key, value) => {
        setPreset("custom");
        setCustom({[key]: value});
    };

    return (
        <div className="settings-container page-enter">
            <h1 className="gradient-text">{t("settings.title")}</h1>

            <div className="settings-tabs" role="tablist">
                {TABS.map((id) => (
                    <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={tab === id}
                        className={tab === id ? "settings-tab active" : "settings-tab"}
                        onClick={() => setTab(id)}
                    >
                        {t(`settings.tabs.${id}`)}
                    </button>
                ))}
            </div>

            {tab === "general" && (
                <div className="branding-card glass-card">
                    <h3>{t("branding.title")}</h3>
                    <div className="branding-row">
                        <img src={settings.logo_url || "./logo.svg"} alt={t("branding.logo")} className="branding-logo-preview" />
                        <div className="branding-fields">
                            <label>{t("branding.siteName")}
                                <input
                                    type="text"
                                    value={settings.site_name || ""}
                                    onChange={(e) => setSettings((prev) => ({...prev, site_name: e.target.value}))}
                                    onBlur={(e) => handleBrandingSave("site_name", e.target.value)}
                                />
                            </label>
                            <label>{t("branding.logoUrl")}
                                <input
                                    type="text"
                                    value={settings.logo_url || ""}
                                    onChange={(e) => setSettings((prev) => ({...prev, logo_url: e.target.value}))}
                                    onBlur={(e) => handleBrandingSave("logo_url", e.target.value)}
                                />
                            </label>
                            <p className="hint">{t("branding.logoHint")}</p>
                            <p className="hint">{t("profile.avatarHint")}</p>
                        </div>
                    </div>
                    <div className="row-actions">
                        <label className="btn-ghost branding-upload-label">
                            {t("branding.uploadLogo")}
                            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoUpload} hidden />
                        </label>
                        <button className="btn-ghost" onClick={() => handleBrandingSave("logo_url", "./logo.svg")}>
                            {t("branding.resetLogo")}
                        </button>
                    </div>
                </div>
            )}

            {tab === "language" && (
                <div className="glass-card settings-section">
                    <h3>{t("settings.language")}</h3>
                    <p className="hint">{t("settings.languageHint")}</p>
                    <div className="language-picker">
                        {available.map((l) => (
                            <button
                                key={l.code}
                                type="button"
                                className={lang === l.code ? "language-option active" : "language-option"}
                                onClick={() => setLang(l.code)}
                                aria-pressed={lang === l.code}
                            >
                                <span className="language-option-name">{l.name}</span>
                                <span className="language-option-check">{lang === l.code ? "✓" : ""}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {tab === "theme" && (
                <div className="glass-card settings-section">
                    <h3>{t("theme.presets")}</h3>
                    <div className="theme-mode-row">
                        <span className="theme-mode-label">{t("theme.mode")}</span>
                        <div className="segmented">
                            {["light", "dark", "auto"].map((m) => (
                                <button
                                    key={m}
                                    type="button"
                                    className={mode === m ? "segmented-btn active" : "segmented-btn"}
                                    aria-pressed={mode === m}
                                    onClick={() => setMode(m)}
                                >
                                    {t(`theme.${m}`)}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="theme-preset-grid">
                        {THEME_PRESETS.map((p) => (
                            <button
                                key={p.id}
                                type="button"
                                className={preset === p.id ? "theme-preset active" : "theme-preset"}
                                aria-pressed={preset === p.id}
                                onClick={() => setPreset(p.id)}
                            >
                                <span className="theme-preset-swatch" style={{background: p.light.gradient}} />
                                <span className="theme-preset-name">{t(`theme.preset.${p.id}`)}</span>
                                {preset === p.id && <span className="theme-preset-check">✓</span>}
                            </button>
                        ))}
                        <button
                            type="button"
                            className={preset === "custom" ? "theme-preset active" : "theme-preset"}
                            aria-pressed={preset === "custom"}
                            onClick={() => setPreset("custom")}
                        >
                            <span className="theme-preset-swatch" style={{background: `linear-gradient(135deg, ${custom.accent}, ${custom.accent2})`}} />
                            <span className="theme-preset-name">{t("theme.preset.custom")}</span>
                            {preset === "custom" && <span className="theme-preset-check">✓</span>}
                        </button>
                    </div>
                    {preset === "custom" && (
                        <div className="theme-custom">
                            <h4>{t("theme.custom")}</h4>
                            <div className="theme-custom-fields">
                                {[
                                    ["accent", "theme.customAccent"],
                                    ["accent2", "theme.customAccent2"],
                                    ["bg", "theme.customBg"],
                                    ["surface", "theme.customSurface"],
                                ].map(([key, labelKey]) => (
                                    <label key={key} className="theme-custom-field">
                                        {t(labelKey)}
                                        <input
                                            type="color"
                                            value={custom[key] || DEFAULT_CUSTOM[key]}
                                            onChange={(e) => setCustomColor(key, e.target.value)}
                                        />
                                        <span className="theme-custom-value">{custom[key] || DEFAULT_CUSTOM[key]}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {tab === "security" && (
                <div className="glass-card settings-section">
                    <h3>{t("security.title")}</h3>
                    {securityError ? (
                        <p className="hint">{securityError}</p>
                    ) : !security ? (
                        <p className="hint">{t("common.loading")}</p>
                    ) : (
                        <>
                            <label className="security-field">
                                {t("security.strictness")}
                                <select
                                    value={security.strictness}
                                    onChange={(e) => setSecurity({...security, strictness: e.target.value})}
                                >
                                    <option value="strict">{t("security.strict")}</option>
                                    <option value="lenient">{t("security.lenient")}</option>
                                </select>
                            </label>
                            <p className="hint">
                                {security.strictness === "strict" ? t("security.strictHint") : t("security.lenientHint")}
                            </p>
                            <div className="security-toggles">
                                <ToggleSwitch checked={!!security.enforce_domain_lock} onChange={(v) => setSecurity({...security, enforce_domain_lock: v})} label={t("security.enforceDomain")} />
                                <ToggleSwitch checked={!!security.enforce_ip_lock} onChange={(v) => setSecurity({...security, enforce_ip_lock: v})} label={t("security.enforceIp")} />
                                <ToggleSwitch checked={!!security.enforce_install_path_lock} onChange={(v) => setSecurity({...security, enforce_install_path_lock: v})} label={t("security.enforceInstallPath")} />
                                <ToggleSwitch checked={!!security.enforce_activation_limit} onChange={(v) => setSecurity({...security, enforce_activation_limit: v})} label={t("security.enforceActivationLimit")} />
                            </div>
                            <label className="security-field">
                                {t("security.missingLock")}
                                <select
                                    value={security.missing_lock_behavior}
                                    onChange={(e) => setSecurity({...security, missing_lock_behavior: e.target.value})}
                                >
                                    <option value="deny">{t("security.missingDeny")}</option>
                                    <option value="allow">{t("security.missingAllow")}</option>
                                </select>
                            </label>
                            <div className="row-actions">
                                <button type="button" onClick={handleSecuritySave}>{t("common.save")}</button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {tab === "advanced" && (
                <>
                    <form className="add-setting-form" onSubmit={handleCreate} style={{margin: "16px 0"}}>
                        <h3>{t("settings.create")}</h3>
                        <input
                            type="text"
                            placeholder={t("settings.keyPlaceholder")}
                            value={newKey}
                            onChange={(e) => setNewKey(e.target.value)}
                            required
                        />
                        <input
                            type="text"
                            placeholder={t("settings.valuePlaceholder")}
                            value={newValue}
                            onChange={(e) => setNewValue(e.target.value)}
                        />
                        <button type="submit">{t("settings.createButton")}</button>
                    </form>
                    <div className="table-wrap">
                    <table>
                        <thead>
                        <tr>
                            <th>{t("settings.setting")}</th>
                            <th>{t("settings.value")}</th>
                            <th>{t("common.actions")}</th>
                        </tr>
                        </thead>
                        <tbody>
                        {Object.keys(settings).map((key) => (
                            <tr key={key}>
                                <td>{key}</td>
                                <td>
                                    <input
                                        type="text"
                                        defaultValue={settings[key]}
                                        onBlur={(e) => handleUpdate(key, e.target.value)}
                                    />
                                </td>
                                <td>
                                    <button onClick={() => handleUpdate(key, settings[key])}>
                                        {t("common.update")}
                                    </button>{" "}
                                    <button className="delete-btn" onClick={() => setPendingDelete(key)}>
                                        {t("common.delete")}
                                    </button>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                    </div>
                    {DEMO_MODE && (
                        <div style={{marginTop: "24px", textAlign: "center"}}>
                            <button onClick={() => setConfirmReset(true)}>{t("settings.resetDemo")}</button>
                            <p>{t("settings.resetDemoHint")}</p>
                        </div>
                    )}
                </>
            )}
            <ConfirmModal
                open={pendingDelete !== null}
                message={t("common.confirmDelete")}
                onConfirm={() => { const key = pendingDelete; setPendingDelete(null); handleDelete(key); }}
                onCancel={() => setPendingDelete(null)}
            />
            <ConfirmModal
                open={confirmReset}
                message={t("settings.resetDemoHint")}
                confirmLabel={t("settings.resetDemo")}
                onConfirm={() => { setConfirmReset(false); handleResetDemo(); }}
                onCancel={() => setConfirmReset(false)}
            />
        </div>
    );
}

export default Settings;
