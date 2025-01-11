import React, {useState, useEffect} from "react";
import "../styles/LicenseList.css";

function LicenseList() {
    const [licenses, setLicenses] = useState([]);
    const [filter, setFilter] = useState("all");
    const [error, setError] = useState("");

    useEffect(() => {
        const fetchLicenses = async () => {
            try {
                const response = await fetch(`/api/licenses?filter=${filter}`, {
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("token")}`,
                    },
                });

                if (response.ok) {
                    const data = await response.json();
                    setLicenses(data);
                } else {
                    setError("Failed to fetch licenses.");
                }
            } catch (err) {
                setError("An error occurred while fetching licenses.");
            }
        };

        fetchLicenses();
    }, [filter]);

    const handleFilterChange = (e) => {
        setFilter(e.target.value);
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
                        <td>{license.createdAt}</td>
                        <td>
                            <button className="view-btn">View</button>
                            <button className="delete-btn">Delete</button>
                        </td>
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    );
}

export default LicenseList;