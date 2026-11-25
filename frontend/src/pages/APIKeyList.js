import React, {useState, useEffect, useCallback} from "react";
import {get, post, put, del} from "../utils/api";
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

    const fetchApiKeys = useCallback(async () => {
        try {
            const data = await get("/api-keys");
            setApiKeys(data.api_keys);
            setError("");
        } catch (err) {
            setError(err.message || "Failed to fetch API keys.");
        }
    }, []);

    useEffect(() => {
        fetchApiKeys();
    }, [fetchApiKeys]);

    const handleDelete = async (id) => {
        try {
            await del(`/api-keys/${id}`);
            setApiKeys(apiKeys.filter((key) => key.id !== id));
        } catch (err) {
            setError(err.message || "Failed to delete API key.");
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
            setError(err.message || (editingId !== null ? "Failed to update API key." : "Failed to create API key."));
        }
    };

    return (
        <div className="api-key-list-container">
            <h1>API Keys</h1>
            {error && <div className="error-message">{error}</div>}
            <form className="add-api-key-form" onSubmit={handleCreate} style={{margin: "16px 0"}}>
                <h3>{editingId !== null ? `Edit API Key #${editingId}` : "Create API Key"}</h3>
                <input
                    type="text"
                    placeholder={editingId !== null ? "Key cannot be changed" : "Key value (leave empty to auto-generate)"}
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
                    placeholder={editingId !== null ? "Expires in days (empty = no change)" : "Expires in days (optional)"}
                    value={newExpiresInDays}
                    onChange={(e) => setNewExpiresInDays(e.target.value)}
                />
                <input
                    type="text"
                    placeholder="Restrict to IP (optional)"
                    value={newIp}
                    onChange={(e) => setNewIp(e.target.value)}
                />
                <input
                    type="text"
                    placeholder="Restrict to domain (optional)"
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                />
                <input
                    type="text"
                    placeholder="Restrict to directory (optional)"
                    value={newDirectory}
                    onChange={(e) => setNewDirectory(e.target.value)}
                />
                <label>
                    <input
                        type="checkbox"
                        checked={newSingleUse}
                        onChange={(e) => setNewSingleUse(e.target.checked)}
                    />{" "}
                    Single-use key
                </label>
                <button type="submit">{editingId !== null ? "Save Changes" : "Create API Key"}</button>
                {editingId !== null && (
                    <button type="button" onClick={resetForm} style={{marginLeft: "8px"}}>
                        Cancel
                    </button>
                )}
            </form>
            <table>
                <thead>
                <tr>
                    <th>ID</th>
                    <th>Key</th>
                    <th>Access Rights</th>
                    <th>Expires</th>
                    <th>Single-use</th>
                    <th>Actions</th>
                </tr>
                </thead>
                <tbody>
                {apiKeys.map((key) => (
                    <tr key={key.id}>
                        <td>{key.id}</td>
                        <td>{key.key}</td>
                        <td>{key.access_rights.join(", ")}</td>
                        <td>{key.expires_at ? new Date(key.expires_at).toLocaleDateString() : "Never"}</td>
                        <td>{key.single_use ? "Yes" : "No"}</td>
                        <td>
                            <button className="edit-btn" onClick={() => handleEdit(key)}>
                                Edit
                            </button>{" "}
                            <button className="delete-btn" onClick={() => handleDelete(key.id)}>
                                Delete
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
