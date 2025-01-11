import React, {useState} from "react";
import {useNavigate} from "react-router-dom";
import "../styles/Login.css"; // استایل اختصاصی صفحه ورود

function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setError(""); // پاک کردن خطای قبلی

        try {
            const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({email, password}),
            });

            if (response.ok) {
                const data = await response.json();
                localStorage.setItem("token", data.token); // ذخیره توکن در مرورگر
                navigate("/dashboard"); // انتقال به داشبورد
            } else {
                const err = await response.json();
                setError(err.detail || "Login failed. Please try again.");
            }
        } catch (err) {
            setError("An unexpected error occurred. Please try again later.");
        }
    };

    return (
        <div className="login-container">
            <form className="login-form" onSubmit={handleLogin}>
                <h1>Login</h1>
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