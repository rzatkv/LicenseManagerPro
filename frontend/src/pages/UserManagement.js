import React, {useState, useEffect, useCallback} from "react";
import {get, post, put, del} from "../utils/api";
import {useLanguage} from "../i18n";
import "../styles/UserManagement.css";

function UserManagement() {
    const {t} = useLanguage();
    const [users, setUsers] = useState([]);
    const [error, setError] = useState("");
    const [newUserEmail, setNewUserEmail] = useState("");
    const [newUserPassword, setNewUserPassword] = useState("");
    const [newUserRole, setNewUserRole] = useState("manager");

    // eslint-disable-next-line react-hooks/exhaustive-deps
    const fetchUsers = useCallback(async () => {
        try {
            const data = await get("/users");
            setUsers(data);
            setError("");
        } catch (err) {
            setError(err.message || t("common.failedFetch"));
        }
    }, [t]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    const handleAddUser = async () => {
        try {
            const newUser = await post("/users", {
                email: newUserEmail,
                password: newUserPassword,
                role: newUserRole,
            });
            setUsers([...users, newUser]);
            setNewUserEmail("");
            setNewUserPassword("");
            setNewUserRole("manager");
            setError("");
        } catch (err) {
            setError(err.message || t("common.error"));
        }
    };

    const handleDeleteUser = async (id) => {
        try {
            await del(`/users/${id}`);
            setUsers(users.filter((user) => user.id !== id));
        } catch (err) {
            setError(err.message || t("common.error"));
        }
    };

    const handleUpdateUser = async (id, changes) => {
        try {
            const updated = await put(`/users/${id}`, changes);
            setUsers(users.map((user) => (user.id === id ? updated : user)));
            setError("");
        } catch (err) {
            setError(err.message || t("common.error"));
        }
    };

    return (
        <div className="user-management-container">
            <h1>{t("users.title")}</h1>
            {error && <div className="error-message">{error}</div>}
            <div className="add-user-form">
                <h3>{t("users.add")}</h3>
                <input
                    type="email"
                    placeholder={t("users.emailPlaceholder")}
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                />
                <input
                    type="password"
                    placeholder={t("users.passwordPlaceholder")}
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                />
                <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value)}
                >
                    <option value="admin">{t("roles.admin")}</option>
                    <option value="manager">{t("roles.manager")}</option>
                    <option value="support">{t("roles.support")}</option>
                    <option value="viewer">{t("roles.viewer")}</option>
                </select>
                <button onClick={handleAddUser}>{t("users.addButton")}</button>
            </div>
            <table>
                <thead>
                <tr>
                    <th>ID</th>
                    <th>{t("common.email")}</th>
                    <th>{t("common.role")}</th>
                    <th>{t("users.active")}</th>
                    <th>{t("common.actions")}</th>
                </tr>
                </thead>
                <tbody>
                {users.map((user) => (
                    <tr key={user.id}>
                        <td>{user.id}</td>
                        <td>{user.email}</td>
                        <td>
                            <select
                                value={user.role}
                                onChange={(e) => handleUpdateUser(user.id, {role: e.target.value})}
                            >
                                <option value="admin">{t("roles.admin")}</option>
                                <option value="manager">{t("roles.manager")}</option>
                    <option value="support">{t("roles.support")}</option>
                    <option value="viewer">{t("roles.viewer")}</option>
                            </select>
                        </td>
                        <td>
                            <input
                                type="checkbox"
                                checked={!!user.is_active}
                                onChange={(e) => handleUpdateUser(user.id, {is_active: e.target.checked})}
                            />
                        </td>
                        <td>
                            <button
                                className="delete-btn"
                                onClick={() => handleDeleteUser(user.id)}
                            >
                                {t("common.delete")}
                            </button>
                        </td>
                    </tr>
                ))}
                </tbody>
            </table>

            <div className="dashboard-section">
                <h2>{t("users.permissionMatrix")}</h2>
                <table>
                    <thead>
                        <tr>
                            <th>{t("users.capability")}</th>
                            <th>{t("roles.admin")}</th>
                            <th>{t("roles.manager")}</th>
                            <th>{t("roles.support")}</th>
                            <th>{t("roles.viewer")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td>{t("users.manageProducts")}</td><td>✓</td><td>✓</td><td>—</td><td>—</td></tr>
                        <tr><td>{t("users.manageUsers")}</td><td>✓</td><td>—</td><td>—</td><td>—</td></tr>
                        <tr><td>{t("users.manageSettings")}</td><td>✓</td><td>✓</td><td>—</td><td>—</td></tr>
                        <tr><td>{t("users.deleteLicenses")}</td><td>✓</td><td>✓</td><td>—</td><td>—</td></tr>
                        <tr><td>{t("users.createLicenses")}</td><td>✓</td><td>✓</td><td>✓</td><td>—</td></tr>
                        <tr><td>{t("users.viewOnly")}</td><td>✓</td><td>✓</td><td>✓</td><td>✓</td></tr>
                    </tbody>
                </table>
                <p className="hint">{t("roles.adminDesc")} {t("roles.managerDesc")} {t("roles.supportDesc")} {t("roles.viewerDesc")}</p>
            </div>
        </div>
    );
}

export default UserManagement;
