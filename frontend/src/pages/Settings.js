import React, {useState, useEffect, useCallback} from "react";
import {get, put, del} from "../utils/api";
import {useLanguage} from "../i18n";
import {useToast} from "../components/Toast";
import ConfirmModal from "../components/ConfirmModal";
import {DEMO_MODE} from "../config";
import {resetDemoData} from "../utils/demoData";
import "../styles/Settings.css";

function Settings() {
    const {t} = useLanguage();
    const {toast} = useToast();
    const [settings, setSettings] = useState({});
    const [newKey, setNewKey] = useState("");
    const [newValue, setNewValue] = useState("");
    const [pendingDelete, setPendingDelete] = useState(null);
    const [confirmReset, setConfirmReset] = useState(false);

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
            toast.success(t("settings.updated"));
        } catch (err) {
            toast.error(err.message || t("settings.updateFailed"));
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        const key = newKey.trim();
        if (!key) {
            toast.error(t("settings.keyRequired"));
            return;
        }
        try {
            await put(`/settings/${key}`, {key, value: newValue});
            setSettings((prev) => ({...prev, [key]: newValue}));
            setNewKey("");
            setNewValue("");
            toast.success(t("settings.created"));
        } catch (err) {
            toast.error(err.message || t("settings.createFailed"));
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
            toast.success(t("settings.deleted"));
        } catch (err) {
            toast.error(err.message || t("settings.deleteFailed"));
        }
    };

    const handleResetDemo = () => {
        resetDemoData();
        window.location.reload();
    };

    return (
        <div className="settings-container page-enter">
            <h1 className="gradient-text">{t("settings.title")}</h1>
            <form className="add-setting-form" onSubmit={handleCreate} style={{margin: "16px 0"}}>
                <h3>{t("settings.create")}</h3>
                <input
                    type="text"
                    placeholder={t("settings.keyPlaceholder")}
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    required
                />
                <input
                    type="text"
                    placeholder={t("settings.valuePlaceholder")}
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                />
                <button type="submit">{t("settings.createButton")}</button>
            </form>
            <div className="table-wrap">
            <table>
                <thead>
                <tr>
                    <th>{t("settings.setting")}</th>
                    <th>{t("settings.value")}</th>
                    <th>{t("common.actions")}</th>
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
                                {t("common.update")}
                            </button>{" "}
                            <button className="delete-btn" onClick={() => setPendingDelete(key)}>
                                {t("common.delete")}
                            </button>
                        </td>
                    </tr>
                ))}
                </tbody>
            </table>
            </div>
            {DEMO_MODE && (
                <div style={{marginTop: "24px", textAlign: "center"}}>
                    <button onClick={() => setConfirmReset(true)}>{t("settings.resetDemo")}</button>
                    <p>{t("settings.resetDemoHint")}</p>
                </div>
            )}
            <ConfirmModal
                open={pendingDelete !== null}
                message={t("common.confirmDelete")}
                onConfirm={() => { const key = pendingDelete; setPendingDelete(null); handleDelete(key); }}
                onCancel={() => setPendingDelete(null)}
            />
            <ConfirmModal
                open={confirmReset}
                message={t("settings.resetDemoHint")}
                confirmLabel={t("settings.resetDemo")}
                onConfirm={() => { setConfirmReset(false); handleResetDemo(); }}
                onCancel={() => setConfirmReset(false)}
            />
        </div>
    );
}

export default Settings;
