import React, {useState, useEffect} from "react";
import {useNavigate} from "react-router-dom";
import {login as loginRequest} from "../utils/auth";
import {get} from "../utils/api";
import {DEMO_MODE} from "../config";
import {useLanguage} from "../i18n";
import {useTheme} from "../theme";
import "../styles/Login.css";

function Login() {
    const {t, lang, setLang, available} = useLanguage();
    const {mode, setMode} = useTheme();
    const [email, setEmail] = useState(DEMO_MODE ? "demo@demo.com" : "");
    const [password, setPassword] = useState(DEMO_MODE ? "demo1234" : "");
    const [error, setError] = useState("");
    const [siteName, setSiteName] = useState("License Manager Pro");
    const [logoUrl, setLogoUrl] = useState("./logo.svg");
    const navigate = useNavigate();

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

    const handleLogin = async (e) => {
        e.preventDefault();
        setError("");
        try {
            await loginRequest(email, password);
            navigate("/dashboard");
        } catch (err) {
            setError(t("login.invalid"));
        }
    };

    return (
        <div className="login-container">
            <div className="login-top-controls">
                <select aria-label={t("common.theme")} value={mode} onChange={(e) => setMode(e.target.value)}>
                    <option value="light">{t("theme.light")}</option>
                    <option value="dark">{t("theme.dark")}</option>
                    <option value="auto">{t("theme.auto")}</option>
                </select>
                <select aria-label={t("common.language")} value={lang} onChange={(e) => setLang(e.target.value)}>
                    {available.map((l) => (
                        <option key={l.code} value={l.code}>{l.name}</option>
                    ))}
                </select>
            </div>
            <form className="login-form" onSubmit={handleLogin}>
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
        </div>
    );
}

export default Login;
