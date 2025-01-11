import React, {useState, useEffect} from "react";
import "../styles/Settings.css";

function Settings() {
    const [settings, setSettings] = useState({});
    const [updateMessage, setUpdateMessage] = useState("");

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                const response = await fetch("/api/settings", {
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("token")}`,
                    },
                });

                if (response.ok) {
                    const data = await response.json();
                    setSettings(data);
                } else {
                    console.error("Failed to fetch settings.");
                }
            } catch (err) {
                console.error("An error occurred while fetching settings.");
            }
        };

        fetchSettings();
    }, []);

    const handleUpdate = async (key, value) => {
        try {
            const response = await fetch(`/api/settings/${key}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
                body: JSON.stringify({key, value}),
            });

            if (response.ok) {
                setUpdateMessage("Settings updated successfully!");
                setTimeout(() => setUpdateMessage(""), 3000);
            } else {
                console.error("Failed to update settings.");
            }
        } catch (err) {
            console.error("An error occurred while updating settings.");
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