import React, {useEffect, useState} from "react";
import {useNavigate} from "react-router-dom";
import "../styles/Dashboard.css";

function Dashboard() {
    const [summary, setSummary] = useState(null);
    const [error, setError] = useState("");
    const navigate = useNavigate();

    useEffect(() => {
        const token = localStorage.getItem("token");
        if (!token) {
            navigate("/");
            return;
        }

        const fetchSummary = async () => {
            try {
                const response = await fetch("/api/dashboard/summary", {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                if (response.ok) {
                    const data = await response.json();
                    setSummary(data);
                } else {
                    const err = await response.json();
                    setError(err.detail || "Failed to fetch summary.");
                }
            } catch (err) {
                setError("An unexpected error occurred.");
            }
        };

        fetchSummary();
    }, [navigate]);

    if (error) {
        return <div className="dashboard-error">{error}</div>;
    }

    if (!summary) {
        return <div className="dashboard-loading">Loading...</div>;
    }

    return (
        <div className="dashboard-container">
            <h1>Admin Dashboard</h1>
            <div className="dashboard-summary">
                <div className="summary-box">
                    <h2>API Keys</h2>
                    <p>{summary.apiKeysCount}</p>
                </div>
                <div className="summary-box">
                    <h2>Users</h2>
                    <p>{summary.usersCount}</p>
                </div>
                <div className="summary-box">
                    <h2>Active Licenses</h2>
                    <p>{summary.activeLicenses}</p>
                </div>
                <div className="summary-box">
                    <h2>Inactive Licenses</h2>
                    <p>{summary.inactiveLicenses}</p>
                </div>
            </div>
        </div>
    );
}

export default Dashboard;