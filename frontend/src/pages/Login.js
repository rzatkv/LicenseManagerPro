import React, {useState, useEffect} from "react";
import {useNavigate} from "react-router-dom";
import {login as loginRequest} from "../utils/auth";
import {get} from "../utils/api";
import {API_BASE_URL, DEMO_MODE} from "../config";
import {useLanguage} from "../i18n";
import ThemeToggle from "../components/ThemeToggle";
import LanguageMenu from "../components/LanguageMenu";
import "../styles/Login.css";

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

    // Store the JWT and the user's email/role exactly as utils/auth.js
    // login() does (same localStorage keys), then enter the app.
    const finishLogin = async (token) => {
        localStorage.setItem("token", token);
        try {
            const me = await fetch(`${API_BASE_URL}/users/me`, {
                headers: {Authorization: `Bearer ${token}`},
            });
            if (me.ok) {
                const u = await me.json();
                localStorage.setItem("lmp-user", JSON.stringify({email: u.email || email, role: u.role || "viewer"}));
            } else {
                localStorage.setItem("lmp-user", JSON.stringify({email, role: "viewer"}));
            }
        } catch (e) {
            localStorage.setItem("lmp-user", JSON.stringify({email, role: "viewer"}));
        }
        navigate("/dashboard");
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setError("");
        // Demo mode: the mock login never requires 2FA.
        if (DEMO_MODE) {
            try {
                await loginRequest(email, password);
                navigate("/dashboard");
            } catch (err) {
                setError(t("login.invalid"));
            }
            return;
        }
        try {
            const response = await fetch(`${API_BASE_URL}/auth/login`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({email, password}),
            });
            if (!response.ok) throw new Error("Invalid credentials");
            const data = await response.json();
            if (data.requires_2fa) {
                // No access token yet: the temp token is exchanged for a
                // JWT at /auth/verify-2fa. No way to skip this step.
                setTempToken(data.temp_token);
                setCode("");
                setStep("2fa");
                return;
            }
            await finishLogin(data.access_token);
        } catch (err) {
            setError(t("login.invalid"));
        }
    };

    const handleVerify2fa = async (e) => {
        e.preventDefault();
        setError("");
        try {
            const response = await fetch(`${API_BASE_URL}/auth/verify-2fa`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({temp_token: tempToken, code: code.trim()}),
            });
            if (response.status === 401) {
                setError(t("twofa.invalidCode"));
                return;
            }
            if (!response.ok) throw new Error("2FA verification failed");
            const data = await response.json();
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
                    <p className="login-subtitle">{t("login.twoFactorHint")}</p>
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
                    <button type="submit">{t("twofa.verify")}</button>
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
                    <button type="submit">{t("login.button")}</button>
                </form>
            )}
            </div>
        </div>
    );
}

export default Login;
