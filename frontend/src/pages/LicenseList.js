import React, {useState, useEffect, useCallback} from "react";
import {get, post, del} from "../utils/api";
import "../styles/LicenseList.css";

function LicenseList() {
    const [licenses, setLicenses] = useState([]);
    const [filter, setFilter] = useState("all");
    const [error, setError] = useState("");
    const [selected, setSelected] = useState(null);
    const [newProduct, setNewProduct] = useState("");
    const [newOwnerEmail, setNewOwnerEmail] = useState("");
    const [newExpiresInDays, setNewExpiresInDays] = useState(365);
    const [newMaxActivations, setNewMaxActivations] = useState(1);

    const fetchLicenses = useCallback(async () => {
        try {
            const data = await get(`/licenses?filter=${filter}`);
            setLicenses(data);
            setError("");
        } catch (err) {
            setError(err.message || "Failed to fetch licenses.");
        }
    }, [filter]);

    useEffect(() => {
        fetchLicenses();
    }, [fetchLicenses]);

    const handleFilterChange = (e) => {
        setFilter(e.target.value);
    };

    const handleDelete = async (id) => {
        try {
            await del(`/licenses/${id}`);
            setLicenses(licenses.filter((license) => license.id !== id));
            if (selected && selected.id === id) {
                setSelected(null);
            }
        } catch (err) {
            setError(err.message || "Failed to delete license.");
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            const created = await post("/licenses", {
                product: newProduct,
                owner_email: newOwnerEmail || undefined,
                expires_in_days: Number(newExpiresInDays) || undefined,
                max_activations: Number(newMaxActivations) || 1,
            });
            setLicenses([created, ...licenses]);
            setNewProduct("");
            setNewOwnerEmail("");
            setNewExpiresInDays(365);
            setNewMaxActivations(1);
            setError("");
        } catch (err) {
            setError(err.message || "Failed to create license.");
        }
    };

    return (
        <div className="license-list-container">
            <h1>Licenses</h1>
            {error && <div className="error-message">{error}</div>}
            <div className="filter-container">
                <label htmlFor="filter">Filter:</label>
                <select id="filter" value={filter} onChange={handleFilterChange}>
                    <option value="all">All</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="daily">Created Today</option>
                    <option value="weekly">Created This Week</option>
                    <option value="monthly">Created This Month</option>
                </select>
            </div>
            <form className="add-license-form" onSubmit={handleCreate} style={{margin: "16px 0"}}>
                <h3>Create License</h3>
                <input
                    type="text"
                    placeholder="Product name"
                    value={newProduct}
                    onChange={(e) => setNewProduct(e.target.value)}
                    required
                />
                <input
                    type="email"
                    placeholder="Owner email (optional)"
                    value={newOwnerEmail}
                    onChange={(e) => setNewOwnerEmail(e.target.value)}
                />
                <input
                    type="number"
                    min="1"
                    placeholder="Expires in days"
                    value={newExpiresInDays}
                    onChange={(e) => setNewExpiresInDays(e.target.value)}
                />
                <input
                    type="number"
                    min="1"
                    placeholder="Max activations"
                    value={newMaxActivations}
                    onChange={(e) => setNewMaxActivations(e.target.value)}
                />
                <button type="submit">Create License</button>
            </form>
            <table>
                <thead>
                <tr>
                    <th>ID</th>
                    <th>License Key</th>
                    <th>Status</th>
                    <th>Created At</th>
                    <th>Actions</th>
                </tr>
                </thead>
                <tbody>
                {licenses.map((license) => (
                    <tr key={license.id}>
                        <td>{license.id}</td>
                        <td>{license.key}</td>
                        <td>{license.status}</td>
                        <td>{license.created_at}</td>
                        <td>
                            <button className="view-btn" onClick={() => setSelected(license)}>
                                View
                            </button>
                            <button className="delete-btn" onClick={() => handleDelete(license.id)}>
                                Delete
                            </button>
                        </td>
                    </tr>
                ))}
                </tbody>
            </table>
            {selected && (
                <div className="license-detail" style={{marginTop: "16px"}}>
                    <h3>License #{selected.id}</h3>
                    <p><strong>Key:</strong> {selected.key}</p>
                    <p><strong>Product:</strong> {selected.product}</p>
                    <p><strong>Owner:</strong> {selected.owner_email || "-"}</p>
                    <p><strong>Status:</strong> {selected.status}</p>
                    <p><strong>Expires At:</strong> {selected.expires_at || "Never"}</p>
                    <p><strong>Activations:</strong> {selected.activations} / {selected.max_activations}</p>
                    <p><strong>Created At:</strong> {selected.created_at}</p>
                    <p><strong>Updated At:</strong> {selected.updated_at}</p>
                    <button onClick={() => setSelected(null)}>Close</button>
                </div>
            )}
        </div>
    );
}

export default LicenseList;
