import React, {useState, useEffect, useCallback} from "react";
import {get, put, del} from "../utils/api";
import {DEMO_MODE} from "../config";
import {resetDemoData} from "../utils/demoData";
import "../styles/Settings.css";

function Settings() {
    const [settings, setSettings] = useState({});
    const [updateMessage, setUpdateMessage] = useState("");
    const [error, setError] = useState("");
    const [newKey, setNewKey] = useState("");
    const [newValue, setNewValue] = useState("");

    const fetchSettings = useCallback(async () => {
        try {
            const data = await get("/settings");
            setSettings(data);
        } catch (err) {
            console.error("Failed to fetch settings.");
        }
    }, []);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    const flash = (message) => {
        setUpdateMessage(message);
        setTimeout(() => setUpdateMessage(""), 3000);
    };

    const handleUpdate = async (key, value) => {
        try {
            await put(`/settings/${key}`, {key, value});
            setSettings((prev) => ({...prev, [key]: value}));
            flash("Settings updated successfully!");
        } catch (err) {
            console.error("Failed to update settings.");
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        const key = newKey.trim();
        if (!key) {
            setError("Setting key is required.");
            return;
        }
        try {
            await put(`/settings/${key}`, {key, value: newValue});
            setSettings((prev) => ({...prev, [key]: newValue}));
            setNewKey("");
            setNewValue("");
            setError("");
            flash(`Setting '${key}' created successfully!`);
        } catch (err) {
            setError(err.message || "Failed to create setting.");
        }
    };

    const handleDelete = async (key) => {
        try {
            await del(`/settings/${key}`);
            setSettings((prev) => {
                const next = {...prev};
                delete next[key];
                return next;
            });
            setError("");
            flash(`Setting '${key}' deleted successfully!`);
        } catch (err) {
            setError(err.message || "Failed to delete setting.");
        }
    };

    const handleResetDemo = () => {
        resetDemoData();
        window.location.reload();
    };

    return (
        <div className="settings-container">
            <h1>System Settings</h1>
            {updateMessage && <p className="update-message">{updateMessage}</p>}
            {error && <div className="error-message">{error}</div>}
            <form className="add-setting-form" onSubmit={handleCreate} style={{margin: "16px 0"}}>
                <h3>Create Setting</h3>
                <input
                    type="text"
                    placeholder="Setting key"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    required
                />
                <input
                    type="text"
                    placeholder="Setting value"
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                />
                <button type="submit">Create Setting</button>
            </form>
            <table>
                <thead>
                <tr>
                    <th>Setting</th>
                    <th>Value</th>
                    <th>Action</th>
                </tr>
                </thead>
                <tbody>
                {Object.keys(settings).map((key) => (
                    <tr key={key}>
                        <td>{key}</td>
                        <td>
                            <input
                                type="text"
                                defaultValue={settings[key]}
                                onBlur={(e) => handleUpdate(key, e.target.value)}
                            />
                        </td>
                        <td>
                            <button onClick={() => handleUpdate(key, settings[key])}>
                                Update
                            </button>{" "}
                            <button className="delete-btn" onClick={() => handleDelete(key)}>
                                Delete
                            </button>
                        </td>
                    </tr>
                ))}
                </tbody>
            </table>
            {DEMO_MODE && (
                <div style={{marginTop: "24px", textAlign: "center"}}>
                    <button onClick={handleResetDemo}>Reset demo data</button>
                    <p>Restores the original sample licenses, API keys, users and settings.</p>
                </div>
            )}
        </div>
    );
}

export default Settings;
