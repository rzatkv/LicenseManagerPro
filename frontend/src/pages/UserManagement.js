import React, {useState, useEffect, useCallback} from "react";
import {get, post, put, del} from "../utils/api";
import "../styles/UserManagement.css";

function UserManagement() {
    const [users, setUsers] = useState([]);
    const [error, setError] = useState("");
    const [newUserEmail, setNewUserEmail] = useState("");
    const [newUserPassword, setNewUserPassword] = useState("");
    const [newUserRole, setNewUserRole] = useState("admin");

    const fetchUsers = useCallback(async () => {
        try {
            const data = await get("/users");
            setUsers(data);
            setError("");
        } catch (err) {
            setError(err.message || "Failed to fetch users.");
        }
    }, []);

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
            setNewUserRole("admin");
            setError("");
        } catch (err) {
            setError(err.message || "Failed to add user.");
        }
    };

    const handleDeleteUser = async (id) => {
        try {
            await del(`/users/${id}`);
            setUsers(users.filter((user) => user.id !== id));
        } catch (err) {
            setError(err.message || "Failed to delete user.");
        }
    };

    const handleUpdateUser = async (id, changes) => {
        try {
            const updated = await put(`/users/${id}`, changes);
            setUsers(users.map((user) => (user.id === id ? updated : user)));
            setError("");
        } catch (err) {
            setError(err.message || "Failed to update user.");
        }
    };

    return (
        <div className="user-management-container">
            <h1>User Management</h1>
            {error && <div className="error-message">{error}</div>}
            <div className="add-user-form">
                <h3>Add New User</h3>
                <input
                    type="email"
                    placeholder="User Email"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                />
                <input
                    type="password"
                    placeholder="Password (min 8 characters)"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                />
                <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value)}
                >
                    <option value="admin">Admin</option>
                    <option value="user">User</option>
                </select>
                <button onClick={handleAddUser}>Add User</button>
            </div>
            <table>
                <thead>
                <tr>
                    <th>ID</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Active</th>
                    <th>Actions</th>
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
                                <option value="admin">Admin</option>
                                <option value="user">User</option>
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

export default UserManagement;
