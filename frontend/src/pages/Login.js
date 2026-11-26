import React, {useState, useEffect, useRef, useCallback} from "react";
import {useNavigate} from "react-router-dom";
import {login as loginRequest} from "../utils/auth";
import {get, post} from "../utils/api";
import {API_BASE_URL, DEMO_MODE} from "../config";
import {useLanguage} from "../i18n";
import ThemeToggle from "../components/ThemeToggle";
import LanguageMenu from "../components/LanguageMenu";
import "../styles/Login.css";
import {LogIn, ShieldCheck} from "lucide-react";

function Login() {
    const {t} = useLanguage();
    const [email, setEmail] = useState(DEMO_MODE ? "demo@demo.com" : "");
    const [password, setPassword] = useState(DEMO_MODE ? "demo1234" : "");
    const [error, setError] = useState("");
    const [siteName, setSiteName] = useState("License Manager Pro");
    const [logoUrl, setLogoUrl] = useState("./logo.svg");
    // Second login step (TOTP 2FA): shown only when the backend answers
    // the first step with {requires_2fa: true, temp_token}.
    const [step, setStep] = useState("credentials");
    const [tempToken, setTempToken] = useState("");
    const [code, setCode] = useState("");
    // v3.0: the 2FA channel (totp/email/sms) comes back with requires_2fa;
    // the hint below the code box follows it. demoCode is demo-only: the
    // mock returns the demo 2FA code so the flow is testable (the Profile
    // page already publishes it).
    const [twofaChannel, setTwofaChannel] = useState("totp");
    const [demoCode, setDemoCode] = useState("");
    // v3.0 maintenance: public status; when on, visitors see the
    // maintenance page (custom message) and admins sign in via the form.
    const [maintenance, setMaintenance] = useState(null);
    const [showMaintenanceLogin, setShowMaintenanceLogin] = useState(false);
    // v3.0 captcha: public config + one single-use custom challenge.
    const [captchaConfig, setCaptchaConfig] = useState(null);
    const [challenge, setChallenge] = useState(null);
    const [captchaAnswer, setCaptchaAnswer] = useState("");
    const [recaptchaState, setRecaptchaState] = useState("idle");
    const recaptchaBoxRef = useRef(null);
    const recaptchaWidgetId = useRef(null);
    const navigate = useNavigate();

    // Hero slides (v2.3 flagship login): rotating feature lines with a
    // smooth crossfade. Pure CSS/JS animation — no video asset, so the
    // demo bundle stays small and the offline demo keeps working.
    // Auto-advance pauses on hover/focus and is disabled entirely when
    // the user prefers reduced motion.
    const heroSlides = ["login.hero.1", "login.hero.2", "login.hero.3", "login.hero.4"];
    const [slide, setSlide] = useState(0);
    const [heroPaused, setHeroPaused] = useState(false);
    useEffect(() => {
        if (heroPaused) return undefined;
        if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;
        const id = setInterval(() => setSlide((s) => (s + 1) % heroSlides.length), 5000);
        return () => clearInterval(id);
    }, [heroPaused, heroSlides.length]);

    // Branding: best-effort only — the settings endpoint needs auth, so
    // before login this fails quietly in real mode and the defaults render.
    // (In demo mode the mock answers without auth.)
    useEffect(() => {
        let cancelled = false;
        get("/settings")
            .then((data) => {
                if (cancelled || !data) return;
                if (data.site_name) setSiteName(data.site_name);
                if (data.logo_url) setLogoUrl(data.logo_url);
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, []);

    // Maintenance status (public, v3.0) + captcha config (public, v3.0).
    // Both fail quietly: no maintenance info means normal login, and no
    // captcha config means captcha off (the server is the authority —
    // the login still fails closed server-side if captcha is on).
    useEffect(() => {
        let cancelled = false;
        get("/system/maintenance")
            .then((data) => { if (!cancelled && data) setMaintenance(data); })
            .catch(() => {});
        get("/api/captcha/config")
            .then((data) => { if (!cancelled && data) setCaptchaConfig(data); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, []);

    const fetchChallenge = useCallback(() => {
        setChallenge(null);
        setCaptchaAnswer("");
        post("/api/captcha/challenge", {})
            .then((data) => { if (data) setChallenge(data); })
            .catch(() => {});
    }, []);

    // Custom captcha: mint one single-use challenge when the config says so.
    useEffect(() => {
        if (captchaConfig && captchaConfig.type === "custom") fetchChallenge();
    }, [captchaConfig, fetchChallenge]);

    // Google reCAPTCHA (v2 checkbox / v3 invisible): load the Google
    // script on demand. If it fails (offline, blocked, bad site key) the
    // page keeps working — the login attempt fails closed server-side
    // with a clear error instead of crashing the page.
    useEffect(() => {
        if (!captchaConfig || (captchaConfig.type !== "recaptcha-v2" && captchaConfig.type !== "recaptcha-v3")) return undefined;
        if (!captchaConfig.site_key) { setRecaptchaState("failed"); return undefined; }
        if (window.grecaptcha) { setRecaptchaState("ready"); return undefined; }
        setRecaptchaState("loading");
        const script = document.createElement("script");
        script.src = captchaConfig.type === "recaptcha-v3"
            ? `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(captchaConfig.site_key)}`
            : "https://www.google.com/recaptcha/api.js";
        script.async = true;
        script.defer = true;
        script.onload = () => setRecaptchaState("ready");
        script.onerror = () => setRecaptchaState("failed");
        document.head.appendChild(script);
        return () => { /* keep the script for the session: reCAPTCHA is global */ };
    }, [captchaConfig]);

    // reCAPTCHA v2 checkbox: render the widget once the script is ready.
    useEffect(() => {
        if (!captchaConfig || captchaConfig.type !== "recaptcha-v2") return undefined;
        if (recaptchaState !== "ready" || !window.grecaptcha || !recaptchaBoxRef.current) return undefined;
        if (recaptchaWidgetId.current !== null) return undefined;
        try {
            recaptchaWidgetId.current = window.grecaptcha.render(recaptchaBoxRef.current, {
                sitekey: captchaConfig.site_key,
            });
        } catch (e) {
            setRecaptchaState("failed");
        }
        return undefined;
    }, [captchaConfig, recaptchaState]);

    // Store the JWT and the user's email/role exactly as utils/auth.js
    // login() does (same localStorage keys), then enter the app.
    // Uses get() so it works in demo mode too (mock /users/me).
    const finishLogin = async (token) => {
        localStorage.setItem("token", token);
        try {
            const u = await get("/users/me");
            localStorage.setItem("lmp-user", JSON.stringify({email: u.email || email, role: u.role || "viewer"}));
        } catch (e) {
            localStorage.setItem("lmp-user", JSON.stringify({email, role: "viewer"}));
        }
        navigate("/dashboard");
    };

    // Captcha payload for the login request (v3.0): custom models send the
    // single-use challenge id + answer; reCAPTCHA sends the token. Returns
    // null when captcha is off. For v3 the token is minted here, at submit.
    const captchaPayload = async () => {
        if (!captchaConfig || captchaConfig.type === "off") return null;
        if (captchaConfig.type === "custom") {
            return {captcha_challenge_id: challenge ? challenge.challenge_id : null, captcha_answer: captchaAnswer};
        }
        if (captchaConfig.type === "recaptcha-v2") {
            let token = "";
            try { token = window.grecaptcha && recaptchaWidgetId.current !== null ? window.grecaptcha.getResponse(recaptchaWidgetId.current) : ""; } catch (e) {}
            return {captcha_token: token};
        }
        // reCAPTCHA v3: invisible, score-based; no token without the script.
        if (window.grecaptcha && recaptchaState === "ready") {
            try {
                const token = await window.grecaptcha.execute(captchaConfig.site_key, {action: "login"});
                return {captcha_token: token};
            } catch (e) { return {captcha_token: ""}; }
        }
        return {captcha_token: ""};
    };

    const refreshChallengeAfterFailure = () => {
        if (captchaConfig && captchaConfig.type === "custom") fetchChallenge();
        if (captchaConfig && captchaConfig.type === "recaptcha-v2" && window.grecaptcha && recaptchaWidgetId.current !== null) {
            try { window.grecaptcha.reset(recaptchaWidgetId.current); } catch (e) {}
        }
    };

    const enterTwofaStep = (temp_token, channel, demo_code) => {
        setTempToken(temp_token);
        setTwofaChannel(channel || "totp");
        setDemoCode(demo_code || "");
        setCode("");
        setStep("2fa");
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setError("");
        const captcha = await captchaPayload();
        // Demo mode: the mock login verifies the captcha server-side.
        if (DEMO_MODE) {
            try {
                await loginRequest(email, password, captcha);
                navigate("/dashboard");
            } catch (err) {
                if (err && err.requires2fa) {
                    enterTwofaStep(err.tempToken, err.twofaChannel, err.demoCode);
                    return;
                }
                setError(err && /captcha/i.test(err.message || "") ? t("captcha.failed") : t("login.invalid"));
                refreshChallengeAfterFailure();
            }
            return;
        }
        try {
            const response = await fetch(`${API_BASE_URL}/auth/login`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({email, password, ...(captcha || {})}),
            });
            if (!response.ok) {
                let detail = "";
                try { detail = (await response.json()).detail || ""; } catch (e) {}
                throw new Error(detail || "Invalid credentials");
            }
            const data = await response.json();
            if (data.requires_2fa) {
                // No access token yet: the temp token is exchanged for a
                // JWT at /auth/verify-2fa. No way to skip this step.
                enterTwofaStep(data.temp_token, data.twofa_channel, "");
                return;
            }
            await finishLogin(data.access_token);
        } catch (err) {
            setError(err && /captcha/i.test(err.message || "") ? t("captcha.failed") : t("login.invalid"));
            refreshChallengeAfterFailure();
        }
    };

    const handleVerify2fa = async (e) => {
        e.preventDefault();
        setError("");
        try {
            const data = await post("/auth/verify-2fa", {temp_token: tempToken, code: code.trim()});
            await finishLogin(data.access_token);
        } catch (err) {
            setError(t("twofa.invalidCode"));
        }
    };

    const backToCredentials = () => {
        setStep("credentials");
        setTempToken("");
        setCode("");
        setError("");
    };

    const twofaHintKey = twofaChannel === "email" ? "twofa.emailHint" : twofaChannel === "sms" ? "twofa.smsHint" : "twofa.loginHint";

    return (
        <div className="login-container">
            {/* Floating gradient orbs (decorative, GPU-friendly drift). */}
            <div className="login-orbs" aria-hidden="true">
                <span className="login-orb login-orb-1" />
                <span className="login-orb login-orb-2" />
                <span className="login-orb login-orb-3" />
            </div>
            {/* Same controls as the app header (ThemeToggle + LanguageMenu):
                the old native <select> pair looked nothing like the header
                and its wide pills overlapped the hero logo on short phone
                viewports (v2.3.1 defect). */}
            <div className="login-top-controls">
                <ThemeToggle />
                <LanguageMenu />
            </div>
            {maintenance && maintenance.enabled && !showMaintenanceLogin ? (
                <div className="login-layout">
                    <div className="login-form login-anim maintenance-card">
                        <img src={logoUrl} alt={siteName} className="login-logo" />
                        <h1>{t("maintenance.title")}</h1>
                        <p className="login-subtitle">{maintenance.message || t("maintenance.defaultMessage")}</p>
                        <button type="button" onClick={() => setShowMaintenanceLogin(true)}>{t("maintenance.adminLogin")}</button>
                    </div>
                </div>
            ) : (
            <div className="login-layout">
                <div
                    className="login-hero"
                    onMouseEnter={() => setHeroPaused(true)}
                    onMouseLeave={() => setHeroPaused(false)}
                    onFocus={() => setHeroPaused(true)}
                    onBlur={() => setHeroPaused(false)}
                >
                    <img src={logoUrl} alt="" className="login-hero-logo" />
                    <div className="login-hero-slides" aria-live="polite">
                        {heroSlides.map((key, i) => (
                            <p key={key} className={i === slide ? "login-hero-slide active" : "login-hero-slide"}>
                                {t(key)}
                            </p>
                        ))}
                    </div>
                    <div className="login-hero-dots">
                        {heroSlides.map((key, i) => (
                            <button
                                key={key}
                                type="button"
                                className={i === slide ? "login-hero-dot active" : "login-hero-dot"}
                                aria-label={`${i + 1} / ${heroSlides.length}`}
                                onClick={() => setSlide(i)}
                            />
                        ))}
                    </div>
                </div>
            {step === "2fa" ? (
                <form className="login-form login-anim" onSubmit={handleVerify2fa}>
                    <img src={logoUrl} alt={siteName} className="login-logo" />
                    <h1>{t("login.twoFactorTitle")}</h1>
                    <p className="login-subtitle">{t(twofaHintKey)}</p>
                    {demoCode && <p className="login-subtitle">{t("twofa.demoCode")}: {demoCode}</p>}
                    {error && <div className="error-message">{error}</div>}
                    <div className="form-group">
                        <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            pattern="[0-9]*"
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                            aria-label={t("twofa.loginHint")}
                            autoFocus
                            required
                        />
                    </div>
                    <button type="submit"><ShieldCheck size={18} />{t("twofa.verify")}</button>
                    <button type="button" style={{background: "none", backgroundColor: "transparent", boxShadow: "none", color: "var(--muted)", marginTop: 10, width: "100%"}} onClick={backToCredentials}>{t("common.back")}</button>
                </form>
            ) : (
                <form className="login-form login-anim" onSubmit={handleLogin}>
                    <img src={logoUrl} alt={siteName} className="login-logo" />
                    <h1>{siteName}</h1>
                    <p className="login-subtitle">{t("login.subtitle")}</p>
                    {DEMO_MODE && (
                        <div className="demo-notice" style={{marginBottom: 12}}>
                            {t("login.demoNotice")}
                        </div>
                    )}
                    {error && <div className="error-message">{error}</div>}
                    <div className="form-group">
                        <label>{t("login.email")}:</label>
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    </div>
                    <div className="form-group">
                        <label>{t("login.password")}:</label>
                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                    </div>
                    {captchaConfig && captchaConfig.type === "custom" && (
                        <div className="form-group captcha-box">
                            <label>{t("captcha.title")}:</label>
                            {challenge ? (
                                <>
                                    <p className="captcha-prompt">{t(`captcha.prompt.${challenge.model}`)}</p>
                                    <p className="captcha-display" aria-label={t(`captcha.prompt.${challenge.model}`)}>{challenge.display}</p>
                                    <div className="captcha-row">
                                        <input
                                            type="text"
                                            value={captchaAnswer}
                                            onChange={(e) => setCaptchaAnswer(e.target.value)}
                                            placeholder={t("captcha.answerPlaceholder")}
                                            autoComplete="off"
                                            required
                                        />
                                        <button type="button" className="btn-ghost" onClick={fetchChallenge}>{t("captcha.refresh")}</button>
                                    </div>
                                </>
                            ) : (
                                <p className="login-subtitle">{t("common.loading")}</p>
                            )}
                        </div>
                    )}
                    {captchaConfig && captchaConfig.type === "recaptcha-v2" && (
                        <div className="form-group captcha-box">
                            <label>{t("captcha.title")}:</label>
                            {recaptchaState === "failed" ? (
                                <p className="login-subtitle">{t("captcha.loadFailed")}</p>
                            ) : (
                                <>
                                    <div ref={recaptchaBoxRef} />
                                    <p className="login-subtitle">{t("captcha.v2hint")}</p>
                                </>
                            )}
                        </div>
                    )}
                    {captchaConfig && captchaConfig.type === "recaptcha-v3" && (
                        <div className="form-group captcha-box">
                            {recaptchaState === "failed" ? (
                                <p className="login-subtitle">{t("captcha.loadFailed")}</p>
                            ) : (
                                <p className="login-subtitle">{t("captcha.v3hint")}</p>
                            )}
                        </div>
                    )}
                    <button type="submit"><LogIn size={18} />{t("login.button")}</button>
                    {maintenance && maintenance.enabled && (
                        <button type="button" style={{background: "none", backgroundColor: "transparent", boxShadow: "none", color: "var(--muted)", marginTop: 10, width: "100%"}} onClick={() => setShowMaintenanceLogin(false)}>{t("maintenance.back")}</button>
                    )}
                </form>
            )}
            </div>
            )}
        </div>
    );
}

export default Login;
