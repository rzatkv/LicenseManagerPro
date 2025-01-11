import React, {useState, useEffect} from "react";
import "../styles/APIKeyList.css";

function APIKeyList() {
    const [apiKeys, setApiKeys] = useState([]);
    const [error, setError] = useState("");

    useEffect(() => {
        const fetchApiKeys = async () => {
            try {
                const response = await fetch("/api/api-keys", {
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("token")}`,
                    },
                });

                if (response.ok) {
                    const data = await response.json();
                    setApiKeys(data.api_keys);
                } else {
                    setError("Failed to fetch API keys.");
                }
            } catch (err) {
                setError("An error occurred while fetching API keys.");
            }
        };

        fetchApiKeys();
    }, []);

    const handleDelete = async (id) => {
        try {
            const response = await fetch(`/api/api-keys/${id}`, {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
            });

            if (response.ok) {
                setApiKeys(apiKeys.filter((key) => key.id !== id));
            } else {
                setError("Failed to delete API key.");
            }
        } catch (err) {
            setError("An error occurred while deleting API key.");
        }
    };

    return (
        <div className="api-key-list-container">
            <h1>API Keys</h1>
            {error && <div className="error-message">{error}</div>}
            <table>
                <thead>
                <tr>
                    <th>ID</th>
                    <th>Key</th>
                    <th>Access Rights</th>
                    <th>Actions</th>
                </tr>
                </thead>
                <tbody>
                {apiKeys.map((key) => (
                    <tr key={key.id}>
                        <td>{key.id}</td>
                        <td>{key.key}</td>
                        <td>{key.access_rights.join(", ")}</td>
                        <td>
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