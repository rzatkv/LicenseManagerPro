import React, {useState, useEffect, useCallback} from "react";
import {get, put} from "../utils/api";
import "../styles/Settings.css";

function Settings() {
    const [settings, setSettings] = useState({});
    const [updateMessage, setUpdateMessage] = useState("");

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

    const handleUpdate = async (key, value) => {
        try {
            await put(`/settings/${key}`, {key, value});
            setSettings((prev) => ({...prev, [key]: value}));
            setUpdateMessage("Settings updated successfully!");
            setTimeout(() => setUpdateMessage(""), 3000);
        } catch (err) {
            console.error("Failed to update settings.");
        }
    };

    return (
        <div className="settings-container">
            <h1>System Settings</h1>
            {updateMessage && <p className="update-message">{updateMessage}</p>}
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
                            </button>
                        </td>
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    );
}

export default Settings;
