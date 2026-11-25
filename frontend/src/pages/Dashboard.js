import React, {useEffect, useState, useCallback} from "react";
import {Link, useNavigate} from "react-router-dom";
import {get, post} from "../utils/api";
import "../styles/Dashboard.css";

const daysLeft = (expiresAt) => {
    if (!expiresAt) return null;
    return Math.ceil((new Date(expiresAt) - new Date()) / (1000 * 60 * 60 * 24));
};

function Dashboard() {
    const [summary, setSummary] = useState(null);
    const [licenses, setLicenses] = useState([]);
    const [apiKeys, setApiKeys] = useState([]);
    const [users, setUsers] = useState([]);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const navigate = useNavigate();

    const fetchAll = useCallback(async () => {
        try {
            const [summaryData, licensesData, keysData, usersData] = await Promise.all([
                get("/dashboard/summary"),
                get("/licenses?filter=all"),
                get("/api-keys"),
                get("/users"),
            ]);
            setSummary(summaryData);
            setLicenses(licensesData);
            setApiKeys(keysData.api_keys || []);
            setUsers(usersData);
            setError("");
        } catch (err) {
            if (err.status === 401) {
                navigate("/");
                return;
            }
            setError(err.message || "Failed to fetch dashboard data.");
        }
    }, [navigate]);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    const handleRenew = async (id) => {
        try {
            const renewed = await post(`/licenses/${id}/renew`, {extend_days: 365});
            setLicenses((prev) => prev.map((lic) => (lic.id === id ? renewed : lic)));
            setNotice(`License #${id} renewed for 365 days.`);
            setTimeout(() => setNotice(""), 3000);
            // Renewing can flip a license back to active, so refresh the counts.
            const summaryData = await get("/dashboard/summary");
            setSummary(summaryData);
        } catch (err) {
            setError(err.message || "Failed to renew license.");
        }
    };

    if (error) {
        return <div className="dashboard-error">{error}</div>;
    }

    if (!summary) {
        return <div className="dashboard-loading">Loading...</div>;
    }

    const expiringSoon = licenses
        .filter((lic) => {
            const left = daysLeft(lic.expires_at);
            return lic.status === "active" && left !== null && left <= 30;
        })
        .sort((a, b) => daysLeft(a.expires_at) - daysLeft(b.expires_at));

    const recentLicenses = [...licenses]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 5);
    const recentApiKeys = [...apiKeys].sort((a, b) => b.id - a.id).slice(0, 5);
    const recentUsers = [...users].sort((a, b) => b.id - a.id).slice(0, 5);

    return (
        <div className="dashboard-container">
            <h1>Admin Dashboard</h1>
            {notice && <p className="dashboard-notice">{notice}</p>}
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

            <div className="dashboard-actions">
                <h2>Quick Actions</h2>
                <div className="action-buttons">
                    <Link className="action-btn" to="/licenses">Create License</Link>
                    <Link className="action-btn" to="/api-keys">Create API Key</Link>
                    <Link className="action-btn" to="/users">Add User</Link>
                    <Link className="action-btn" to="/settings">Settings</Link>
                </div>
            </div>

            <div className="dashboard-section">
                <h2>Expiring Soon (within 30 days)</h2>
                {expiringSoon.length === 0 ? (
                    <p className="dashboard-empty">No licenses expiring in the next 30 days.</p>
                ) : (
                    <table>
                        <thead>
                        <tr>
                            <th>Product</th>
                            <th>License Key</th>
                            <th>Days Left</th>
                            <th>Actions</th>
                        </tr>
                        </thead>
                        <tbody>
                        {expiringSoon.map((lic) => (
                            <tr key={lic.id}>
                                <td>{lic.product}</td>
                                <td>{lic.key}</td>
                                <td>{daysLeft(lic.expires_at)} days</td>
                                <td>
                                    <button onClick={() => handleRenew(lic.id)}>
                                        Renew +365 days
                                    </button>
                                </td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="dashboard-section">
                <h2>Recent Licenses</h2>
                {recentLicenses.length === 0 ? (
                    <p className="dashboard-empty">No licenses yet.</p>
                ) : (
                    <table>
                        <thead>
                        <tr>
                            <th>Product</th>
                            <th>License Key</th>
                            <th>Status</th>
                            <th>Created At</th>
                        </tr>
                        </thead>
                        <tbody>
                        {recentLicenses.map((lic) => (
                            <tr key={lic.id}>
                                <td>{lic.product}</td>
                                <td>{lic.key}</td>
                                <td>{lic.status}</td>
                                <td>{lic.created_at}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                )}
                <p><Link to="/licenses">View all licenses</Link></p>
            </div>

            <div className="dashboard-section">
                <h2>Recent API Keys</h2>
                {recentApiKeys.length === 0 ? (
                    <p className="dashboard-empty">No API keys yet.</p>
                ) : (
                    <table>
                        <thead>
                        <tr>
                            <th>Key</th>
                            <th>Access Rights</th>
                        </tr>
                        </thead>
                        <tbody>
                        {recentApiKeys.map((key) => (
                            <tr key={key.id}>
                                <td>{key.key}</td>
                                <td>{key.access_rights.join(", ")}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                )}
                <p><Link to="/api-keys">View all API keys</Link></p>
            </div>

            <div className="dashboard-section">
                <h2>Recent Users</h2>
                {recentUsers.length === 0 ? (
                    <p className="dashboard-empty">No users yet.</p>
                ) : (
                    <table>
                        <thead>
                        <tr>
                            <th>Email</th>
                            <th>Role</th>
                        </tr>
                        </thead>
                        <tbody>
                        {recentUsers.map((user) => (
                            <tr key={user.id}>
                                <td>{user.email}</td>
                                <td>{user.role}</td>
                            </tr>
                        ))}
                        </tbody>
                    </table>
                )}
                <p><Link to="/users">View all users</Link></p>
            </div>
        </div>
    );
}

export default Dashboard;
