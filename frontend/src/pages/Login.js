import React, {useState} from "react";
import {useNavigate} from "react-router-dom";
import {login as loginRequest} from "../utils/auth";
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
    const navigate = useNavigate();

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
                <h1>{t("login.title")}</h1>
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
