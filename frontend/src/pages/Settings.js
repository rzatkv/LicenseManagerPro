import React, {useState, useEffect, useCallback} from "react";
import {useSearchParams} from "react-router-dom";
import {get, put, post} from "../utils/api";
import {useLanguage} from "../i18n";
import {useTheme, THEME_PRESETS, DEFAULT_CUSTOM} from "../theme";
import {useToast} from "../components/Toast";
import ConfirmModal from "../components/ConfirmModal";
import ToggleSwitch from "../components/ToggleSwitch";
import {DEMO_MODE} from "../config";
import {resetDemoData} from "../utils/demoData";
import {LanguagesPanel} from "./Languages";
import "../styles/Settings.css";

// Settings tabs (v3.0): general, language picker, language management,
// theme, security (with sub-tabs), SMS, Email, Telegram. The old
// "advanced" tab (generic key/value table + add-setting form + delete
// buttons) is GONE: settings are predefined, never created or deleted,
// and version / last-updated are not shown here at all (About only).
const TABS = ["general", "language", "languages", "theme", "security", "sms", "email", "telegram"];
const SECURITY_SUBTABS = ["license", "rate", "captcha", "maintenance", "twofa", "strip"];
const SMS_PROVIDERS = ["ippanel", "kavenegar", "faraz"];
const SMS_PROVIDER_FIELDS = {
    ippanel: ["api_key", "sender"],
    kavenegar: ["api_key", "sender"],
    faraz: ["username", "password", "sender"],
};
const NOTIFY_EVENTS = ["license_created", "license_reissued", "license_expiring", "license_expired", "webhook_failed", "webhook_blocked", "user_created", "api_key_expiring"];
const TEMPLATE_NAMES = ["twofa_code", "license_created", "license_renewed", "license_expiring", "license_expired", "user_created"];
const TEMPLATE_VARIABLES = {
    twofa_code: ["code"],
    license_created: ["license_key", "product_name", "expiry_date"],
    license_renewed: ["license_key", "product_name", "expiry_date"],
    license_expiring: ["license_key", "product_name", "expiry_date", "days_left"],
    license_expired: ["license_key", "product_name", "expiry_date"],
    user_created: ["site_name", "user_email", "role"],
};
const TEMPLATE_SAMPLES = {
    code: "123456",
    license_key: "LIC-DEMO-1234-5678",
    product_name: "CloudPanel Pro",
    expiry_date: "2026-12-31",
    days_left: "7",
    site_name: "License Manager Pro",
    user_email: "customer@example.com",
    role: "viewer",
};

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

// Frontend mirror of the backend hostname check (settings.py):
// labels of alphanumerics/hyphens, no scheme/port/path/underscore;
// empty means "use the request host".
function isValidHostname(v) {
    if (!v) return true;
    if (v.length > 253) return false;
    return /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*$/.test(v);
}

function Settings() {
    const {t, lang, setLang, available} = useLanguage();
    const {mode, setMode, preset, setPreset, custom, setCustom} = useTheme();
    const {toast} = useToast();
    const [searchParams] = useSearchParams();
    const [tab, setTab] = useState(() => {
        const q = searchParams.get("tab");
        return TABS.includes(q) ? q : "general";
    });
    const [securityTab, setSecurityTab] = useState("license");
    const [settings, setSettings] = useState({});
    const [loaded, setLoaded] = useState(false);

    // --- General form (local state; ONE save button persists all) -------
    const [general, setGeneral] = useState({
        site_name: "", logo_url: "", panel_domain: "",
        date_calendar: "gregorian", system_encoding: "utf-8", product_notes_enabled: "on",
    });
    // --- Security form ---------------------------------------------------
    const [security, setSecurity] = useState(null);
    const [securityError, setSecurityError] = useState("");
    const [rateLimit, setRateLimit] = useState("1000");
    const [captcha, setCaptcha] = useState({type: "off", model: "math", site_key: "", secret_key: "", v3_threshold: 0.5, secret_configured: false});
    const [maintenance, setMaintenance] = useState({mode: "off", message: ""});
    const [twofaChannel, setTwofaChannel] = useState("totp");
    const [strip4byte, setStrip4byte] = useState("on");
    // --- SMS / Email / Telegram forms ------------------------------------
    const [sms, setSms] = useState({active_provider: "", providers: {}});
    const [email, setEmail] = useState({smtp_host: "", smtp_port: 587, encryption: "tls", username: "", password: "", from_address: "", from_name: "", signature: "", templates: {}});
    const [telegram, setTelegram] = useState({bot_token: "", chat_ids: "", token_configured: false});
    const [channels, setChannels] = useState({});
    const [telegramTest, setTelegramTest] = useState(null);
    // SMS test-send (v3.0): a REAL send via POST /api/sms/test to the
    // number typed here, using the single active provider.
    const [smsTest, setSmsTest] = useState(null);
    const [smsTestNumber, setSmsTestNumber] = useState("");
    const [saving, setSaving] = useState(false);
    const [confirmReset, setConfirmReset] = useState(false);

    const applySettingsMap = useCallback((data) => {
        setSettings(data);
        setGeneral({
            site_name: data.site_name ?? "",
            logo_url: data.logo_url ?? "",
            panel_domain: data.panel_domain ?? "",
            date_calendar: data.date_calendar ?? "gregorian",
            system_encoding: data.system_encoding ?? "utf-8",
            product_notes_enabled: data.product_notes_enabled ?? "on",
        });
        setRateLimit(String(data.daily_request_limit ?? "1000"));
        setMaintenance({mode: data.maintenance_mode ?? "off", message: data.maintenance_message ?? ""});
        setTwofaChannel(data.twofa_channel ?? "totp");
        setStrip4byte(data.strip_4byte ?? "on");
    }, []);

    useEffect(() => {
        (async () => {
            try {
                const data = await get("/settings");
                applySettingsMap(data);
            } catch (err) { /* settings load failure: forms stay empty */ }
            try {
                const sec = await get("/api/settings/license-security");
                setSecurity(sec);
            } catch (err) { setSecurityError(err.message || "Failed to load"); }
            try {
                const cap = await get("/api/settings/captcha-config");
                setCaptcha((prev) => ({...prev, ...cap, secret_key: ""}));
            } catch (err) { /* captcha stays off by default */ }
            try {
                const s = await get("/api/settings/sms-config");
                setSms({active_provider: s.active_provider || "", providers: s.providers || {}});
            } catch (err) { /* sms stays unconfigured */ }
            try {
                const e = await get("/api/settings/email-config");
                setEmail((prev) => ({...prev, ...e, password: ""}));
            } catch (err) { /* email stays unconfigured */ }
            try {
                const tg = await get("/api/settings/telegram-config");
                setTelegram({bot_token: "", chat_ids: (tg.chat_ids || []).join(", "), token_configured: !!tg.token_configured});
            } catch (err) { /* telegram stays unconfigured */ }
            try {
                const ch = await get("/api/settings/notification-channels");
                setChannels(ch || {});
            } catch (err) { /* channels stay at defaults */ }
            setLoaded(true);
        })();
    }, [applySettingsMap]);

    const saveSetting = async (key, value) => {
        await put(`/settings/${key}`, {key, value});
    };

    // --- General: one save button, whole form, toast ---------------------
    const handleSaveGeneral = async () => {
        if (!isValidHostname(general.panel_domain.trim())) {
            toast.error(t("settings.panelDomainInvalid"));
            return;
        }
        if (!general.site_name.trim() || general.site_name.trim().length > 100) {
            toast.error(t("settings.siteNameInvalid"));
            return;
        }
        setSaving(true);
        try {
            for (const [key, value] of Object.entries(general)) {
                await saveSetting(key, key === "panel_domain" ? value.trim() : value);
            }
            // The date calendar takes effect immediately (format.js reads
            // this key on every call — no reload needed).
            try { localStorage.setItem("lmp-calendar", general.date_calendar); } catch (e) {}
            setSettings((prev) => ({...prev, ...general}));
            toast.success(t("settings.saved"));
        } catch (err) {
            toast.error(err.message || t("settings.updateFailed"));
        } finally {
            setSaving(false);
        }
    };

    // --- Security: one save button for ALL sub-tabs ----------------------
    const handleSaveSecurity = async () => {
        const limit = Number(rateLimit);
        if (!Number.isInteger(limit) || limit < 1 || limit > 1000000) {
            toast.error(t("settings.rateLimitInvalid"));
            return;
        }
        if (captcha.type === "recaptcha-v3" && (Number.isNaN(Number(captcha.v3_threshold)) || Number(captcha.v3_threshold) < 0 || Number(captcha.v3_threshold) > 1)) {
            toast.error(t("settings.captchaThresholdInvalid"));
            return;
        }
        if (maintenance.message.length > 500) {
            toast.error(t("settings.maintenanceMessageTooLong"));
            return;
        }
        setSaving(true);
        try {
            await put("/api/settings/license-security", security);
            await saveSetting("daily_request_limit", String(limit));
            const captchaPayload = {type: captcha.type, model: captcha.model, site_key: captcha.site_key, v3_threshold: Number(captcha.v3_threshold)};
            if (captcha.secret_key) captchaPayload.secret_key = captcha.secret_key;
            await put("/api/settings/captcha-config", captchaPayload);
            await saveSetting("maintenance_mode", maintenance.mode);
            await saveSetting("maintenance_message", maintenance.message);
            await saveSetting("twofa_channel", twofaChannel);
            await saveSetting("strip_4byte", strip4byte);
            setCaptcha((prev) => ({...prev, secret_key: "", secret_configured: prev.secret_configured || !!captcha.secret_key}));
            toast.success(t("settings.saved"));
        } catch (err) {
            toast.error(err.message || t("settings.updateFailed"));
        } finally {
            setSaving(false);
        }
    };

    // --- SMS: one save button (provider config + SMS channel toggles) ----
    const handleSaveSms = async () => {
        setSaving(true);
        try {
            const providers = {};
            for (const name of SMS_PROVIDERS) {
                providers[name] = {...(sms.providers[name] || {})};
            }
            await put("/api/settings/sms-config", {active_provider: sms.active_provider || null, providers});
            await put("/api/settings/notification-channels", channels);
            toast.success(t("settings.saved"));
        } catch (err) {
            toast.error(err.message || t("settings.updateFailed"));
        } finally {
            setSaving(false);
        }
    };

    // --- Email: one save button (SMTP + templates + signature + toggles) -
    const handleSaveEmail = async () => {
        setSaving(true);
        try {
            const payload = {
                smtp_host: email.smtp_host, smtp_port: Number(email.smtp_port) || 587,
                encryption: email.encryption, username: email.username,
                from_address: email.from_address, from_name: email.from_name,
                signature: email.signature, templates: email.templates,
            };
            if (email.password) payload.password = email.password;
            await put("/api/settings/email-config", payload);
            await put("/api/settings/notification-channels", channels);
            setEmail((prev) => ({...prev, password: ""}));
            toast.success(t("settings.saved"));
        } catch (err) {
            toast.error(err.message || t("settings.updateFailed"));
        } finally {
            setSaving(false);
        }
    };

    const handleResetTemplates = async () => {
        try {
            const saved = await put("/api/settings/email-config", {reset_templates: true});
            setEmail((prev) => ({...prev, templates: saved.templates || {}, signature: saved.signature || ""}));
            toast.success(t("settings.saved"));
        } catch (err) {
            toast.error(err.message || t("settings.updateFailed"));
        }
    };

    // --- Telegram: one save button (token + chats + toggles) -------------
    const handleSaveTelegram = async () => {
        setSaving(true);
        try {
            const payload = {chat_ids: telegram.chat_ids.split(",").map((s) => s.trim()).filter(Boolean)};
            if (telegram.bot_token) payload.bot_token = telegram.bot_token;
            await put("/api/settings/telegram-config", payload);
            await put("/api/settings/notification-channels", channels);
            setTelegram((prev) => ({...prev, bot_token: "", token_configured: prev.token_configured || !!telegram.bot_token}));
            toast.success(t("settings.saved"));
        } catch (err) {
            toast.error(err.message || t("settings.updateFailed"));
        } finally {
            setSaving(false);
        }
    };

    const handleTelegramTest = async () => {
        setTelegramTest({sending: true, ok: null});
        try {
            const res = await post("/api/settings/telegram-config/test", {});
            setTelegramTest({sending: false, ok: !!res.sent});
            if (res.sent) toast.success(t("settings.testSendOk"));
            else toast.error(t("settings.testSendFail"));
        } catch (err) {
            setTelegramTest({sending: false, ok: false});
            toast.error(err.message || t("settings.testSendFail"));
        }
    };

    // SMS test-send (v3.0): REALLY sends via the active provider —
    // POST /api/sms/test returns sent:false (never a fake "sent") when
    // no provider is active or the provider rejects the call.
    const handleSmsTest = async () => {
        setSmsTest({sending: true, ok: null});
        try {
            const res = await post("/api/sms/test", {to: smsTestNumber.trim()});
            setSmsTest({sending: false, ok: !!res.sent});
            if (res.sent) toast.success(t("settings.testSendOk"));
            else toast.error(t("settings.testSendFail"));
        } catch (err) {
            setSmsTest({sending: false, ok: false});
            toast.error(err.message || t("settings.testSendFail"));
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
            if (dataUrl) setGeneral((prev) => ({...prev, logo_url: dataUrl}));
        };
        reader.readAsDataURL(file);
    };

    const handleResetDemo = () => {
        resetDemoData();
        window.location.reload();
    };

    const setCustomColor = (key, value) => {
        setPreset("custom");
        setCustom({[key]: value});
    };

    const setSmsField = (provider, field, value) => {
        setSms((prev) => ({
            ...prev,
            providers: {...prev.providers, [provider]: {...(prev.providers[provider] || {}), [field]: value}},
        }));
    };

    const setChannel = (event, channel, value) => {
        setChannels((prev) => ({
            ...prev,
            [event]: {...(prev[event] || {email: true, sms: false, telegram: false}), [channel]: value},
        }));
    };

    const renderTemplatePreview = (tpl) => {
        let text = `${tpl.subject || ""}\n\n${tpl.body || ""}`;
        for (const [k, v] of Object.entries(TEMPLATE_SAMPLES)) {
            text = text.split(`{{${k}}}`).join(v);
        }
        return text;
    };

    const channelToggles = (channel) => (
        <div className="glass-card settings-section">
            <h3>{t(`settings.notifyChannels.${channel}`)}</h3>
            <p className="hint">{t("settings.notifyChannelsHint")}</p>
            <div className="notify-toggle-list">
                {NOTIFY_EVENTS.map((event) => (
                    <div key={event} className="notify-toggle-row">
                        <span>{t(`settings.notifyEvents.${event}`)}</span>
                        <ToggleSwitch
                            checked={!!(channels[event] && channels[event][channel])}
                            onChange={(v) => setChannel(event, channel, v)}
                            ariaLabel={t(`settings.notifyEvents.${event}`)}
                        />
                    </div>
                ))}
            </div>
        </div>
    );

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

            {/* Zero-scroll (v3.0.0): the tab panels live in one scrollable
                region; the title + tabs above stay fixed. */}
            <div className="settings-tabpanel">
            {tab === "general" && (
                <>
                    <div className="branding-card glass-card">
                        <h3>{t("branding.title")}</h3>
                        <div className="branding-row">
                            <img src={general.logo_url || "./logo.svg"} alt={t("branding.logo")} className="branding-logo-preview" />
                            <div className="branding-fields">
                                <label>{t("branding.siteName")}
                                    <input
                                        type="text"
                                        value={general.site_name}
                                        onChange={(e) => setGeneral((prev) => ({...prev, site_name: e.target.value}))}
                                    />
                                </label>
                                <label>{t("branding.logoUrl")}
                                    <input
                                        type="text"
                                        value={general.logo_url}
                                        onChange={(e) => setGeneral((prev) => ({...prev, logo_url: e.target.value}))}
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
                            <button className="btn-ghost" onClick={() => setGeneral((prev) => ({...prev, logo_url: "./logo.svg"}))}>
                                {t("branding.resetLogo")}
                            </button>
                        </div>
                    </div>
                    <div className="glass-card settings-section">
                        <label className="settings-field">
                            {t("settings.panelDomain")}
                            <input
                                type="text"
                                placeholder="panel.example.com"
                                value={general.panel_domain}
                                onChange={(e) => setGeneral((prev) => ({...prev, panel_domain: e.target.value}))}
                            />
                        </label>
                        <p className="hint">{t("settings.panelDomainHint")}</p>
                        <label className="settings-field">
                            {t("settings.dateCalendar")}
                            <select
                                value={general.date_calendar}
                                onChange={(e) => setGeneral((prev) => ({...prev, date_calendar: e.target.value}))}
                            >
                                <option value="gregorian">{t("settings.calendar.gregorian")}</option>
                                <option value="jalali">{t("settings.calendar.jalali")}</option>
                                <option value="hijri">{t("settings.calendar.hijri")}</option>
                            </select>
                        </label>
                        <p className="hint">{t("settings.dateCalendarHint")}</p>
                        <label className="settings-field">
                            {t("settings.systemEncoding")}
                            <select
                                value={general.system_encoding}
                                onChange={(e) => setGeneral((prev) => ({...prev, system_encoding: e.target.value}))}
                            >
                                <option value="utf-8">UTF-8</option>
                                <option value="windows-1256">windows-1256</option>
                                <option value="iso-8859-1">ISO-8859-1</option>
                            </select>
                        </label>
                        <p className="hint">{t("settings.systemEncodingHint")}</p>
                        <div className="settings-toggle-row">
                            <span>{t("settings.notesToggle")}</span>
                            <ToggleSwitch
                                checked={general.product_notes_enabled === "on"}
                                onChange={(v) => setGeneral((prev) => ({...prev, product_notes_enabled: v ? "on" : "off"}))}
                                ariaLabel={t("settings.notesToggle")}
                            />
                        </div>
                        <p className="hint">{t("settings.notesHint")}</p>
                    </div>
                    <div className="settings-save-row">
                        <button type="button" onClick={handleSaveGeneral} disabled={saving || !loaded}>{t("common.save")}</button>
                    </div>
                    {DEMO_MODE && (
                        <div style={{marginTop: "24px", textAlign: "center"}}>
                            <button onClick={() => setConfirmReset(true)}>{t("settings.resetDemo")}</button>
                            <p>{t("settings.resetDemoHint")}</p>
                        </div>
                    )}
                </>
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

            {tab === "languages" && (
                <div className="glass-card settings-section">
                    <LanguagesPanel />
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
                <>
                    <div className="mini-tabs" role="tablist" aria-label={t("settings.tabs.security")}>
                        {SECURITY_SUBTABS.map((s) => (
                            <button
                                key={s}
                                type="button"
                                role="tab"
                                aria-selected={securityTab === s}
                                className={securityTab === s ? "mini-tab active" : "mini-tab"}
                                onClick={() => setSecurityTab(s)}
                            >
                                {t(`settings.securitySubtabs.${s}`)}
                            </button>
                        ))}
                    </div>

                    {securityTab === "license" && (
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
                                </>
                            )}
                        </div>
                    )}

                    {securityTab === "rate" && (
                        <div className="glass-card settings-section">
                            <h3>{t("settings.dailyRequestLimit")}</h3>
                            <p className="hint">{t("settings.dailyRequestLimitHint")}</p>
                            <label className="settings-field">
                                {t("settings.dailyRequestLimit")}
                                <input
                                    type="number"
                                    min="1"
                                    max="1000000"
                                    value={rateLimit}
                                    onChange={(e) => setRateLimit(e.target.value)}
                                />
                            </label>
                        </div>
                    )}

                    {securityTab === "captcha" && (
                        <div className="glass-card settings-section">
                            <h3>{t("settings.captchaTitle")}</h3>
                            <p className="hint">{t("settings.captchaHint")}</p>
                            <label className="settings-field">
                                {t("settings.captchaType")}
                                <select value={captcha.type} onChange={(e) => setCaptcha((prev) => ({...prev, type: e.target.value}))}>
                                    <option value="off">{t("settings.captchaOff")}</option>
                                    <option value="custom">{t("settings.captchaCustom")}</option>
                                    <option value="recaptcha-v2">{t("settings.captchaV2")}</option>
                                    <option value="recaptcha-v3">{t("settings.captchaV3")}</option>
                                </select>
                            </label>
                            {captcha.type === "custom" && (
                                <label className="settings-field">
                                    {t("settings.captchaModel")}
                                    <select value={captcha.model} onChange={(e) => setCaptcha((prev) => ({...prev, model: e.target.value}))}>
                                        <option value="math">{t("settings.captchaModelMath")}</option>
                                        <option value="text">{t("settings.captchaModelText")}</option>
                                        <option value="reverse">{t("settings.captchaModelReverse")}</option>
                                    </select>
                                </label>
                            )}
                            {(captcha.type === "recaptcha-v2" || captcha.type === "recaptcha-v3") && (
                                <>
                                    <label className="settings-field">
                                        {t("settings.captchaSiteKey")}
                                        <input type="text" value={captcha.site_key} onChange={(e) => setCaptcha((prev) => ({...prev, site_key: e.target.value}))} />
                                    </label>
                                    <label className="settings-field">
                                        {t("settings.captchaSecretKey")}
                                        <input
                                            type="password"
                                            placeholder={captcha.secret_configured ? "••••••••" : ""}
                                            value={captcha.secret_key}
                                            onChange={(e) => setCaptcha((prev) => ({...prev, secret_key: e.target.value}))}
                                        />
                                    </label>
                                    <p className="hint">{t("settings.captchaSecretHint")}</p>
                                </>
                            )}
                            {captcha.type === "recaptcha-v3" && (
                                <label className="settings-field">
                                    {t("settings.captchaThreshold")}
                                    <input type="number" min="0" max="1" step="0.1" value={captcha.v3_threshold} onChange={(e) => setCaptcha((prev) => ({...prev, v3_threshold: e.target.value}))} />
                                </label>
                            )}
                        </div>
                    )}

                    {securityTab === "maintenance" && (
                        <div className="glass-card settings-section">
                            <h3>{t("settings.maintenanceTitle")}</h3>
                            <p className="hint">{t("settings.maintenanceHint")}</p>
                            <div className="settings-toggle-row">
                                <span>{t("settings.maintenanceMode")}</span>
                                <ToggleSwitch
                                    checked={maintenance.mode === "on"}
                                    onChange={(v) => setMaintenance((prev) => ({...prev, mode: v ? "on" : "off"}))}
                                    ariaLabel={t("settings.maintenanceMode")}
                                />
                            </div>
                            <label className="settings-field">
                                {t("settings.maintenanceMessage")}
                                <textarea
                                    rows={3}
                                    maxLength={500}
                                    value={maintenance.message}
                                    onChange={(e) => setMaintenance((prev) => ({...prev, message: e.target.value}))}
                                />
                            </label>
                        </div>
                    )}

                    {securityTab === "twofa" && (
                        <div className="glass-card settings-section">
                            <h3>{t("settings.twofaTitle")}</h3>
                            <p className="hint">{t("settings.twofaHint")}</p>
                            <label className="settings-field">
                                {t("settings.twofaChannel")}
                                <select value={twofaChannel} onChange={(e) => setTwofaChannel(e.target.value)}>
                                    <option value="totp">{t("settings.twofaTotp")}</option>
                                    <option value="email">{t("settings.twofaEmail")}</option>
                                    <option value="sms">{t("settings.twofaSms")}</option>
                                </select>
                            </label>
                        </div>
                    )}

                    {securityTab === "strip" && (
                        <div className="glass-card settings-section">
                            <h3>{t("settings.stripTitle")}</h3>
                            <p className="hint">{t("settings.stripHint")}</p>
                            <div className="settings-toggle-row">
                                <span>{t("settings.strip4byte")}</span>
                                <ToggleSwitch
                                    checked={strip4byte === "on"}
                                    onChange={(v) => setStrip4byte(v ? "on" : "off")}
                                    ariaLabel={t("settings.strip4byte")}
                                />
                            </div>
                        </div>
                    )}

                    <div className="settings-save-row">
                        <button type="button" onClick={handleSaveSecurity} disabled={saving || !loaded}>{t("common.save")}</button>
                    </div>
                </>
            )}

            {tab === "sms" && (
                <>
                    <div className="glass-card settings-section">
                        <h3>{t("settings.smsTitle")}</h3>
                        <p className="hint">{t("settings.smsHint")}</p>
                        {SMS_PROVIDERS.map((name) => {
                            const active = sms.active_provider === name;
                            const configured = !!(sms.providers[name] && sms.providers[name].configured);
                            return (
                                <div key={name} className={`sms-provider-card${active ? " active" : ""}`}>
                                    <div className="sms-provider-head">
                                        <strong>{t(`settings.smsProviders.${name}`)}</strong>
                                        <span className="badge">{configured ? t("settings.configured") : t("settings.notConfigured")}</span>
                                        {active ? (
                                            <span className="badge badge-accent">{t("settings.active")}</span>
                                        ) : (
                                            <button type="button" className="btn-ghost" onClick={() => setSms((prev) => ({...prev, active_provider: name}))}>
                                                {t("settings.activate")}
                                            </button>
                                        )}
                                    </div>
                                    {active && SMS_PROVIDER_FIELDS[name].map((field) => (
                                        <label key={field} className="settings-field">
                                            {t(`settings.smsFields.${field}`)}
                                            <input
                                                type={field === "password" || field === "api_key" ? "password" : "text"}
                                                placeholder={field === "sender" ? (sms.providers[name] && sms.providers[name].sender) || "" : ""}
                                                value={(sms.providers[name] && sms.providers[name][field]) || ""}
                                                onChange={(e) => setSmsField(name, field, e.target.value)}
                                            />
                                        </label>
                                    ))}
                                </div>
                            );
                        })}
                        <div className="row-actions">
                            <label className="settings-field sms-test-field">
                                {t("settings.smsTestNumber")}
                                <input
                                    type="tel"
                                    placeholder={t("settings.smsTestNumberPlaceholder")}
                                    value={smsTestNumber}
                                    onChange={(e) => setSmsTestNumber(e.target.value)}
                                />
                            </label>
                            <button type="button" className="btn-ghost" onClick={handleSmsTest} disabled={(smsTest && smsTest.sending) || !smsTestNumber.trim() || !sms.active_provider}>
                                {t("settings.smsTestSend")}
                            </button>
                            {smsTest && !smsTest.sending && (
                                <span className={smsTest.ok ? "test-ok" : "test-fail"}>
                                    {smsTest.ok ? t("settings.testSendOk") : t("settings.testSendFail")}
                                </span>
                            )}
                        </div>
                    </div>
                    {channelToggles("sms")}
                    <div className="settings-save-row">
                        <button type="button" onClick={handleSaveSms} disabled={saving || !loaded}>{t("common.save")}</button>
                    </div>
                </>
            )}

            {tab === "email" && (
                <>
                    <div className="glass-card settings-section">
                        <h3>{t("settings.emailTitle")}</h3>
                        <label className="settings-field">
                            {t("settings.smtpHost")}
                            <input type="text" value={email.smtp_host} onChange={(e) => setEmail((prev) => ({...prev, smtp_host: e.target.value}))} />
                        </label>
                        <div className="settings-field-row">
                            <label className="settings-field">
                                {t("settings.smtpPort")}
                                <input type="number" min="1" max="65535" value={email.smtp_port} onChange={(e) => setEmail((prev) => ({...prev, smtp_port: e.target.value}))} />
                            </label>
                            <label className="settings-field">
                                {t("settings.smtpEncryption")}
                                <select value={email.encryption} onChange={(e) => setEmail((prev) => ({...prev, encryption: e.target.value}))}>
                                    <option value="none">{t("settings.encryptionNone")}</option>
                                    <option value="tls">TLS</option>
                                    <option value="ssl">SSL</option>
                                </select>
                            </label>
                        </div>
                        <label className="settings-field">
                            {t("settings.smtpUsername")}
                            <input type="text" value={email.username} onChange={(e) => setEmail((prev) => ({...prev, username: e.target.value}))} />
                        </label>
                        <label className="settings-field">
                            {t("settings.smtpPassword")}
                            <input
                                type="password"
                                placeholder={email.password_configured ? "••••••••" : ""}
                                value={email.password}
                                onChange={(e) => setEmail((prev) => ({...prev, password: e.target.value}))}
                            />
                        </label>
                        <p className="hint">{t("settings.smtpPasswordHint")}</p>
                        <label className="settings-field">
                            {t("settings.emailFromAddress")}
                            <input type="email" value={email.from_address} onChange={(e) => setEmail((prev) => ({...prev, from_address: e.target.value}))} />
                        </label>
                        <label className="settings-field">
                            {t("settings.emailFromName")}
                            <input type="text" value={email.from_name} onChange={(e) => setEmail((prev) => ({...prev, from_name: e.target.value}))} />
                        </label>
                    </div>
                    <div className="glass-card settings-section">
                        <h3>{t("settings.emailTemplatesTitle")}</h3>
                        <p className="hint">{t("settings.emailTemplatesHint")}</p>
                        {TEMPLATE_NAMES.map((name) => {
                            const tpl = (email.templates && email.templates[name]) || {subject: "", body: ""};
                            return (
                                <div key={name} className="email-template-card">
                                    <h4>{t(`settings.emailTemplates.${name}`)}</h4>
                                    <p className="hint">{t("settings.emailTemplateVars")}: {(TEMPLATE_VARIABLES[name] || []).map((v) => `{{${v}}}`).join(" ")}</p>
                                    <label className="settings-field">
                                        {t("settings.emailTemplateSubject")}
                                        <input
                                            type="text"
                                            value={tpl.subject || ""}
                                            onChange={(e) => setEmail((prev) => ({
                                                ...prev,
                                                templates: {...prev.templates, [name]: {...tpl, subject: e.target.value}},
                                            }))}
                                        />
                                    </label>
                                    <label className="settings-field">
                                        {t("settings.emailTemplateBody")}
                                        <textarea
                                            rows={4}
                                            value={tpl.body || ""}
                                            onChange={(e) => setEmail((prev) => ({
                                                ...prev,
                                                templates: {...prev.templates, [name]: {...tpl, body: e.target.value}},
                                            }))}
                                        />
                                    </label>
                                    <details className="email-template-preview">
                                        <summary>{t("settings.emailTemplatePreview")}</summary>
                                        <pre>{renderTemplatePreview(tpl)}</pre>
                                    </details>
                                </div>
                            );
                        })}
                        <label className="settings-field">
                            {t("settings.emailSignature")}
                            <textarea
                                rows={2}
                                value={email.signature}
                                onChange={(e) => setEmail((prev) => ({...prev, signature: e.target.value}))}
                            />
                        </label>
                        <div className="row-actions">
                            <button type="button" className="btn-ghost" onClick={handleResetTemplates}>{t("settings.emailTemplatesReset")}</button>
                        </div>
                    </div>
                    {channelToggles("email")}
                    <div className="settings-save-row">
                        <button type="button" onClick={handleSaveEmail} disabled={saving || !loaded}>{t("common.save")}</button>
                    </div>
                </>
            )}

            {tab === "telegram" && (
                <>
                    <div className="glass-card settings-section">
                        <h3>{t("settings.telegramTitle")}</h3>
                        <p className="hint">{t("settings.telegramHint")}</p>
                        <label className="settings-field">
                            {t("settings.telegramBotToken")}
                            <input
                                type="password"
                                placeholder={telegram.token_configured ? "••••••••" : ""}
                                value={telegram.bot_token}
                                onChange={(e) => setTelegram((prev) => ({...prev, bot_token: e.target.value}))}
                            />
                        </label>
                        <p className="hint">{t("settings.telegramTokenHint")}</p>
                        <label className="settings-field">
                            {t("settings.telegramChatIds")}
                            <input
                                type="text"
                                placeholder="123456789, 987654321"
                                value={telegram.chat_ids}
                                onChange={(e) => setTelegram((prev) => ({...prev, chat_ids: e.target.value}))}
                            />
                        </label>
                        <div className="row-actions">
                            <button type="button" className="btn-ghost" onClick={handleTelegramTest} disabled={telegramTest && telegramTest.sending}>
                                {t("settings.telegramTestSend")}
                            </button>
                            {telegramTest && !telegramTest.sending && (
                                <span className={telegramTest.ok ? "test-ok" : "test-fail"}>
                                    {telegramTest.ok ? t("settings.testSendOk") : t("settings.testSendFail")}
                                </span>
                            )}
                        </div>
                    </div>
                    {channelToggles("telegram")}
                    <div className="settings-save-row">
                        <button type="button" onClick={handleSaveTelegram} disabled={saving || !loaded}>{t("common.save")}</button>
                    </div>
                </>
            )}
            </div>

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
