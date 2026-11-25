import React, {useState, useEffect, useCallback, useRef} from "react";
import {get, post, put} from "../utils/api";
import {formatDateTime} from "../utils/format";
import {useLanguage} from "../i18n";
import {useToast} from "../components/Toast";
import CopyButton from "../components/CopyButton";
import "../styles/Profile.css";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

function initialsFor(name) {
    return (name || "?")
        .split(/[@\s._-]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0].toUpperCase())
        .join("");
}

/** Current user's profile: display name + avatar, and TOTP 2FA setup. */
function Profile() {
    const {t, lang} = useLanguage();
    const {toast} = useToast();
    const [me, setMe] = useState(null);
    const [loading, setLoading] = useState(true);
    const [displayName, setDisplayName] = useState("");
    const [avatarUrl, setAvatarUrl] = useState(null);
    const [saving, setSaving] = useState(false);
    const fileInputRef = useRef(null);

    // 2FA state. Backup codes live in component state only, never in storage.
    const [twofa, setTwofa] = useState(null);
    const [setup, setSetup] = useState(null);
    const [verifyCode, setVerifyCode] = useState("");
    const [backupCodes, setBackupCodes] = useState([]);
    const [busy2fa, setBusy2fa] = useState(false);
    const [showDisable, setShowDisable] = useState(false);
    const [disablePassword, setDisablePassword] = useState("");
    const [disableCode, setDisableCode] = useState("");

    const fetchMe = useCallback(async () => {
        setLoading(true);
        try {
            const data = await get("/users/me");
            setMe(data);
            setDisplayName(data.display_name || "");
            setAvatarUrl(data.avatar_url || null);
        } catch (err) {
            toast.error(err.message || t("common.failedFetch"));
            setMe(null);
        } finally {
            setLoading(false);
        }
    }, [toast, t]);

    const fetchTwofaStatus = useCallback(async () => {
        try {
            const data = await get("/auth/2fa/status");
            setTwofa(data);
        } catch (err) {
            // Demo mock has no 2FA routes yet: stay in the disabled state
            // and let the setup button surface the error if pressed.
            setTwofa(null);
        }
    }, []);

    useEffect(() => {
        fetchMe();
        fetchTwofaStatus();
    }, [fetchMe, fetchTwofaStatus]);

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const updated = await put("/users/me", {
                display_name: displayName,
                avatar_url: avatarUrl || "",
            });
            setMe(updated);
            setDisplayName(updated.display_name || "");
            setAvatarUrl(updated.avatar_url || null);
            toast.success(t("profile.saved"));
        } catch (err) {
            toast.error(err.message || t("common.error"));
        } finally {
            setSaving(false);
        }
    };

    /** Validate magic bytes (never trust extension or MIME alone), then
     * read the file as a data URL for the avatar preview / save. */
    const handleAvatarFile = async (file) => {
        if (!file) return;
        if (file.size > MAX_AVATAR_BYTES) {
            toast.error(t("profile.avatarTooBig"));
            return;
        }
        let buffer;
        try {
            buffer = await file.arrayBuffer();
        } catch (err) {
            toast.error(t("common.error"));
            return;
        }
        const b = new Uint8Array(buffer);
        const isPng = b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
        const isJpeg = b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
        const isWebp =
            b.length >= 12 &&
            b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
            b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
        if (!isPng && !isJpeg && !isWebp) {
            toast.error(t("profile.avatarBadType"));
            return;
        }
        const reader = new FileReader();
        reader.onload = () => setAvatarUrl(String(reader.result));
        reader.onerror = () => toast.error(t("common.error"));
        reader.readAsDataURL(new Blob([buffer]));
    };

    const handleRemoveAvatar = async () => {
        // Backend clears the avatar on an empty avatar_url.
        setAvatarUrl("");
        if (fileInputRef.current) fileInputRef.current.value = "";
        try {
            const updated = await put("/users/me", {avatar_url: ""});
            setMe(updated);
            setAvatarUrl(updated.avatar_url || null);
            toast.success(t("profile.saved"));
        } catch (err) {
            setAvatarUrl(me.avatar_url || null);
            toast.error(err.message || t("common.error"));
        }
    };

    const handleSetup2fa = async () => {
        setBusy2fa(true);
        try {
            const data = await post("/auth/2fa/setup", {});
            setSetup(data);
            setBackupCodes([]);
            setVerifyCode("");
        } catch (err) {
            toast.error(err.message || t("common.error"));
        } finally {
            setBusy2fa(false);
        }
    };

    const handleVerify2fa = async () => {
        const code = verifyCode.trim();
        if (code.length < 6) {
            toast.error(t("twofa.invalidCode"));
            return;
        }
        setBusy2fa(true);
        try {
            const data = await post("/auth/2fa/verify", {code});
            setBackupCodes(Array.isArray(data.backup_codes) ? data.backup_codes : []);
            setSetup(null);
            setVerifyCode("");
            await fetchTwofaStatus();
            toast.success(t("profile.enabled"));
        } catch (err) {
            toast.error(err.message || t("twofa.invalidCode"));
        } finally {
            setBusy2fa(false);
        }
    };

    const handleDisable2fa = async () => {
        const code = disableCode.trim();
        if (!disablePassword || code.length < 6) {
            toast.error(t("twofa.invalidCode"));
            return;
        }
        setBusy2fa(true);
        try {
            await post("/auth/2fa/disable", {password: disablePassword, code});
            setTwofa({enabled: false, backup_codes_remaining: 0});
            setShowDisable(false);
            setDisablePassword("");
            setDisableCode("");
            setBackupCodes([]);
            toast.success(t("profile.disabled"));
        } catch (err) {
            toast.error(err.message || t("twofa.invalidCode"));
        } finally {
            setBusy2fa(false);
        }
    };

    const name = displayName || (me && me.email) || "";
    const roleLabel = me && me.role ? t(`roles.${me.role}`) : "";
    const twofaEnabled = !!(twofa && twofa.enabled);

    return (
        <div className="profile-container page-enter">
            <h1 className="gradient-text">{t("profile.title")}</h1>

            {loading ? (
                <p className="profile-loading">{t("common.loading")}</p>
            ) : !me ? (
                <p className="profile-loading">{t("common.failedFetch")}</p>
            ) : (
                <div className="profile-cards">
                    <section className="glass-card profile-card" aria-label={t("profile.title")}>
                        <h2>{t("profile.account")}</h2>

                        <div className="avatar-row">
                            <button
                                type="button"
                                className="avatar-preview"
                                onClick={() => fileInputRef.current && fileInputRef.current.click()}
                                aria-label={t("profile.avatar")}
                                title={t("profile.avatar")}
                            >
                                {avatarUrl ? (
                                    <img src={avatarUrl} alt="" />
                                ) : (
                                    <span className="avatar-initials" aria-hidden="true">
                                        {initialsFor(name)}
                                    </span>
                                )}
                            </button>
                            <div className="avatar-actions">
                                <button
                                    type="button"
                                    className="btn-ghost"
                                    onClick={() => fileInputRef.current && fileInputRef.current.click()}
                                >
                                    {t("profile.avatar")}
                                </button>
                                {avatarUrl && (
                                    <button type="button" className="btn-ghost" onClick={handleRemoveAvatar}>
                                        {t("profile.avatarRemove")}
                                    </button>
                                )}
                            </div>
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="avatar-file-input"
                            onChange={(e) => {
                                handleAvatarFile(e.target.files && e.target.files[0]);
                                e.target.value = "";
                            }}
                        />
                        <p className="hint">{t("profile.avatarHint")}</p>

                        <form className="profile-form" onSubmit={handleSave}>
                            <label className="field-label" htmlFor="profile-display-name">
                                {t("profile.displayName")}
                            </label>
                            <input
                                id="profile-display-name"
                                type="text"
                                placeholder={t("profile.displayNamePlaceholder")}
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                            />
                            <label className="field-label" htmlFor="profile-email">
                                {t("profile.email")}
                            </label>
                            <input id="profile-email" type="email" value={me.email || ""} readOnly />
                            <label className="field-label" htmlFor="profile-role">
                                {t("profile.role")}
                            </label>
                            <input
                                id="profile-role"
                                type="text"
                                value={roleLabel === `roles.${me.role}` ? me.role : roleLabel}
                                readOnly
                            />
                            <div className="readonly-row">
                                <span className="field-label">{t("profile.lastLogin")}</span>
                                <span>
                                    {me.last_login_at
                                        ? formatDateTime(me.last_login_at, lang)
                                        : t("common.never")}
                                </span>
                            </div>
                            <div className="form-row">
                                <button type="submit" disabled={saving}>
                                    {t("common.save")}
                                </button>
                            </div>
                        </form>
                    </section>

                    <section className="glass-card profile-card" aria-label={t("profile.twoFactor")}>
                        <h2>{t("profile.twoFactor")}</h2>
                        <p className="twofa-status">
                            <span className={`twofa-badge ${twofaEnabled ? "twofa-badge-on" : "twofa-badge-off"}`}>
                                {twofaEnabled ? t("profile.twoFactorEnabled") : t("profile.twoFactorDisabled")}
                            </span>
                            <span>{twofaEnabled ? t("profile.enabled") : t("profile.disabled")}</span>
                        </p>

                        {!twofaEnabled && !setup && backupCodes.length === 0 && (
                            <button type="button" onClick={handleSetup2fa} disabled={busy2fa}>
                                {t("profile.twoFactorSetup")}
                            </button>
                        )}

                        {!twofaEnabled && setup && (
                            <div className="twofa-setup">
                                <p>{t("profile.scanQr")}</p>
                                {setup.qr_data_url && (
                                    <img className="twofa-qr" src={setup.qr_data_url} alt="QR" />
                                )}
                                <p>{t("profile.manualKey")}</p>
                                <p className="twofa-secret">
                                    <code>{setup.secret}</code>
                                    <CopyButton text={setup.secret} />
                                </p>
                                {setup.secret === "DEMO2FASECRET" && (
                                    <p className="hint-box">{t("profile.demo2faNote")}</p>
                                )}
                                <p>{t("profile.enterCode")}</p>
                                <input
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    placeholder={t("profile.codePlaceholder")}
                                    value={verifyCode}
                                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                />
                                <div className="form-row">
                                    <button type="button" onClick={handleVerify2fa} disabled={busy2fa}>
                                        {t("profile.verifyEnable")}
                                    </button>
                                    <button
                                        type="button"
                                        className="btn-ghost"
                                        onClick={() => {
                                            setSetup(null);
                                            setVerifyCode("");
                                        }}
                                    >
                                        {t("common.cancel")}
                                    </button>
                                </div>
                            </div>
                        )}

                        {!twofaEnabled && backupCodes.length > 0 && (
                            <div className="backup-codes-box">
                                <h3>{t("profile.backupCodes")}</h3>
                                <p className="hint">{t("profile.backupCodesHint")}</p>
                                <ul className="backup-codes-list">
                                    {backupCodes.map((code) => (
                                        <li key={code}>
                                            <code>{code}</code>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {twofaEnabled && (
                            <div className="twofa-enabled">
                                <p>
                                    {t("profile.backupCodes")}: {twofa.backup_codes_remaining ?? 0}
                                </p>
                                {!showDisable ? (
                                    <button type="button" className="btn-danger" onClick={() => setShowDisable(true)}>
                                        {t("profile.disable2fa")}
                                    </button>
                                ) : (
                                    <div className="twofa-disable">
                                        <label className="field-label" htmlFor="disable-password">
                                            {t("profile.currentPassword")}
                                        </label>
                                        <input
                                            id="disable-password"
                                            type="password"
                                            autoComplete="current-password"
                                            value={disablePassword}
                                            onChange={(e) => setDisablePassword(e.target.value)}
                                        />
                                        <label className="field-label" htmlFor="disable-code">
                                            {t("profile.twoFactor")}
                                        </label>
                                        <input
                                            id="disable-code"
                                            type="text"
                                            inputMode="numeric"
                                            autoComplete="one-time-code"
                                            placeholder={t("profile.codePlaceholder")}
                                            value={disableCode}
                                            onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                                        />
                                        <div className="form-row">
                                            <button type="button" className="btn-danger" onClick={handleDisable2fa} disabled={busy2fa}>
                                                {t("profile.disable2fa")}
                                            </button>
                                            <button
                                                type="button"
                                                className="btn-ghost"
                                                onClick={() => {
                                                    setShowDisable(false);
                                                    setDisablePassword("");
                                                    setDisableCode("");
                                                }}
                                            >
                                                {t("common.cancel")}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </section>
                </div>
            )}
        </div>
    );
}

export default Profile;
