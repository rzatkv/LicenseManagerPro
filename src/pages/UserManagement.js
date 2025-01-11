import React, {useState, useEffect} from "react";
import "../styles/UserManagement.css";

function UserManagement() {
    const [users, setUsers] = useState([]);
    const [error, setError] = useState("");
    const [newUserEmail, setNewUserEmail] = useState("");
    const [newUserRole, setNewUserRole] = useState("admin");

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const response = await fetch("/api/users", {
                    headers: {
                        Authorization: `Bearer ${localStorage.getItem("token")}`,
                    },
                });

                if (response.ok) {
                    const data = await response.json();
                    setUsers(data.users);
                } else {
                    setError("Failed to fetch users.");
                }
            } catch (err) {
                setError("An error occurred while fetching users.");
            }
        };

        fetchUsers();
    }, []);

    const handleAddUser = async () => {
        try {
            const response = await fetch("/api/users", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
                body: JSON.stringify({email: newUserEmail, role: newUserRole}),
            });

            if (response.ok) {
                const newUser = await response.json();
                setUsers([...users, newUser]);
                setNewUserEmail("");
                setNewUserRole("admin");
            } else {
                setError("Failed to add user.");
            }
        } catch (err) {
            setError("An error occurred while adding user.");
        }
    };

    const handleDeleteUser = async (id) => {
        try {
            const response = await fetch(`/api/users/${id}`, {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${localStorage.getItem("token")}`,
                },
            });

            if (response.ok) {
                setUsers(users.filter((user) => user.id !== id));
            } else {
                setError("Failed to delete user.");
            }
        } catch (err) {
            setError("An error occurred while deleting user.");
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
                    <th>Actions</th>
                </tr>
                </thead>
                <tbody>
                {users.map((user) => (
                    <tr key={user.id}>
                        <td>{user.id}</td>
                        <td>{user.email}</td>
                        <td>{user.role}</td>
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