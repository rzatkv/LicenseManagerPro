import React, {useState, useEffect, useCallback} from "react";
import {get, post, put, del} from "../utils/api";
import {useLanguage} from "../i18n";
import "../styles/APIKeyList.css";

const ALL_ACCESS_RIGHTS = [
    "create_license",
    "edit_license",
    "delete_license",
    "get_license_info",
    "renew_license",
    "remove_access",
    "add_access",
    "change_access_key",
    "create_temporary_access_key",
];

function APIKeyList() {
    const {t} = useLanguage();
    const [apiKeys, setApiKeys] = useState([]);
    const [error, setError] = useState("");
    const [newKey, setNewKey] = useState("");
    const [newRights, setNewRights] = useState(["get_license_info"]);
    const [newExpiresInDays, setNewExpiresInDays] = useState("");
    const [newIp, setNewIp] = useState("");
    const [newDomain, setNewDomain] = useState("");
    const [newDirectory, setNewDirectory] = useState("");
    const [newSingleUse, setNewSingleUse] = useState(false);
    const [editingId, setEditingId] = useState(null);

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const fetchApiKeys = useCallback(async () => {
        try {
            const data = await get("/api-keys");
            setApiKeys(data.api_keys);
            setError("");
        } catch (err) {
            setError(err.message || t("common.failedFetch"));
        }
    }, [t]);

    useEffect(() => {
        fetchApiKeys();
    }, [fetchApiKeys]);

    const handleDelete = async (id) => {
        try {
            await del(`/api-keys/${id}`);
            setApiKeys(apiKeys.filter((key) => key.id !== id));
        } catch (err) {
            setError(err.message || t("common.error"));
        }
    };

    const toggleRight = (right) => {
        setNewRights((prev) =>
            prev.includes(right) ? prev.filter((r) => r !== right) : [...prev, right]
        );
    };

    const resetForm = () => {
        setNewKey("");
        setNewRights(["get_license_info"]);
        setNewExpiresInDays("");
        setNewIp("");
        setNewDomain("");
        setNewDirectory("");
        setNewSingleUse(false);
        setEditingId(null);
    };

    const handleEdit = (key) => {
        setEditingId(key.id);
        setNewKey(key.key);
        setNewRights([...key.access_rights]);
        // Leave expiry empty: an empty value means "do not change".
        setNewExpiresInDays("");
        setNewIp(key.associated_ip || "");
        setNewDomain(key.associated_domain || "");
        setNewDirectory(key.associated_directory || "");
        setNewSingleUse(!!key.single_use);
        setError("");
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            if (editingId !== null) {
                const updated = await put(`/api-keys/${editingId}`, {
                    access_rights: newRights,
                    expires_in_days: newExpiresInDays ? Number(newExpiresInDays) : undefined,
                    associated_ip: newIp || undefined,
                    associated_domain: newDomain || undefined,
                    associated_directory: newDirectory || undefined,
                    single_use: newSingleUse,
                });
                setApiKeys(apiKeys.map((key) => (key.id === editingId ? updated : key)));
                resetForm();
                setError("");
                return;
            }
            const created = await post("/api-keys", {
                key: newKey || undefined,
                access_rights: newRights,
                expires_in_days: newExpiresInDays ? Number(newExpiresInDays) : undefined,
                associated_ip: newIp || undefined,
                associated_domain: newDomain || undefined,
                associated_directory: newDirectory || undefined,
                single_use: newSingleUse,
            });
            setApiKeys([created, ...apiKeys]);
            resetForm();
            setError("");
        } catch (err) {
            setError(err.message || t("common.error"));
        }
    };

    return (
        <div className="api-key-list-container">
            <h1>{t("apikeys.title")}</h1>
            {error && <div className="error-message">{error}</div>}
            <form className="add-api-key-form" onSubmit={handleCreate} style={{margin: "16px 0"}}>
                <h3>{editingId !== null ? `${t("apikeys.edit")} #${editingId}` : t("apikeys.create")}</h3>
                <input
                    type="text"
                    placeholder={editingId !== null ? t("apikeys.keyLocked") : t("apikeys.keyPlaceholder")}
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    disabled={editingId !== null}
                />
                <div>
                    {ALL_ACCESS_RIGHTS.map((right) => (
                        <label key={right} style={{display: "inline-block", marginRight: "12px"}}>
                            <input
                                type="checkbox"
                                checked={newRights.includes(right)}
                                onChange={() => toggleRight(right)}
                            />{" "}
                            {right}
                        </label>
                    ))}
                </div>
                <input
                    type="number"
                    min="1"
                    placeholder={editingId !== null ? t("apikeys.expiresEdit") : t("apikeys.expiresPlaceholder")}
                    value={newExpiresInDays}
                    onChange={(e) => setNewExpiresInDays(e.target.value)}
                />
                <input
                    type="text"
                    placeholder={t("apikeys.restrictIp")}
                    value={newIp}
                    onChange={(e) => setNewIp(e.target.value)}
                />
                <input
                    type="text"
                    placeholder={t("apikeys.restrictDomain")}
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                />
                <input
                    type="text"
                    placeholder={t("apikeys.restrictDirectory")}
                    value={newDirectory}
                    onChange={(e) => setNewDirectory(e.target.value)}
                />
                <label>
                    <input
                        type="checkbox"
                        checked={newSingleUse}
                        onChange={(e) => setNewSingleUse(e.target.checked)}
                    />{" "}
                    {t("apikeys.singleUseLabel")}
                </label>
                <button type="submit">{editingId !== null ? t("apikeys.saveChanges") : t("apikeys.create")}</button>
                {editingId !== null && (
                    <button type="button" onClick={resetForm} style={{marginLeft: "8px"}}>
                        {t("common.cancel")}
                    </button>
                )}
            </form>
            <table>
                <thead>
                <tr>
                    <th>ID</th>
                    <th>{t("apikeys.key")}</th>
                    <th>{t("apikeys.accessRights")}</th>
                    <th>{t("apikeys.expires")}</th>
                    <th>{t("apikeys.singleUse")}</th>
                    <th>{t("common.actions")}</th>
                </tr>
                </thead>
                <tbody>
                {apiKeys.map((key) => (
                    <tr key={key.id}>
                        <td>{key.id}</td>
                        <td>{key.key}</td>
                        <td>{key.access_rights.join(", ")}</td>
                        <td>{key.expires_at ? new Date(key.expires_at).toLocaleDateString() : t("common.never")}</td>
                        <td>{key.single_use ? t("common.yes") : t("common.no")}</td>
                        <td>
                            <button className="edit-btn" onClick={() => handleEdit(key)}>
                                {t("common.edit")}
                            </button>{" "}
                            <button className="delete-btn" onClick={() => handleDelete(key.id)}>
                                {t("common.delete")}
                            </button>
                        </td>
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    );
}

export default APIKeyList;
