import React, {useState} from "react";
import {useNavigate} from "react-router-dom";
import {login as loginRequest} from "../utils/auth";
import {DEMO_MODE} from "../config";
import "../styles/Login.css"; // استایل اختصاصی صفحه ورود

function Login() {
    // In demo mode the form is prefilled; any credentials work.
    const [email, setEmail] = useState(DEMO_MODE ? "demo@demo.com" : "");
    const [password, setPassword] = useState(DEMO_MODE ? "demo1234" : "");
    const [error, setError] = useState("");
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setError(""); // پاک کردن خطای قبلی

        try {
            await loginRequest(email, password);
            navigate("/dashboard"); // انتقال به داشبورد
        } catch (err) {
            setError(err.message || "Login failed. Please try again.");
        }
    };

    return (
        <div className="login-container">
            <form className="login-form" onSubmit={handleLogin}>
                <h1>Login</h1>
                {DEMO_MODE && (
                    <div className="demo-notice" style={{marginBottom: 12}}>
                        Demo mode — sample data, no real backend. Any email
                        and password works; the form is already filled in.
                    </div>
                )}
                {error && <div className="error-message">{error}</div>}
                <div className="form-group">
                    <label>Email:</label>
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </div>
                <div className="form-group">
                    <label>Password:</label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                </div>
                <button type="submit">Login</button>
            </form>
        </div>
    );
}

export default Login;
