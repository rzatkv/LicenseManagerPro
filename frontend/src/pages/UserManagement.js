import React, {useState, useEffect, useCallback} from "react";
import {getList, post, put, del} from "../utils/api";
import {useLanguage} from "../i18n";
import {useToast} from "../components/Toast";
import ConfirmModal from "../components/ConfirmModal";
import EmptyState from "../components/EmptyState";
import Pagination from "../components/Pagination";
import {TableSkeleton} from "../components/Skeleton";
import "../styles/UserManagement.css";

const PAGE_SIZE = 10;

function UserManagement() {
    const {t} = useLanguage();
    const {toast} = useToast();
    const [users, setUsers] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [newUserEmail, setNewUserEmail] = useState("");
    const [newUserPassword, setNewUserPassword] = useState("");
    const [newUserRole, setNewUserRole] = useState("manager");
    const [pendingDelete, setPendingDelete] = useState(null);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const {items, total: t} = await getList("/users", {skip: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE});
            setUsers(items);
            setTotal(t);
        } catch (err) {
            toast.error(err.message || t("common.failedFetch"));
            setUsers([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    }, [page, toast, t]);

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
            if (page === 1) setUsers([...users, newUser].slice(0, PAGE_SIZE));
            setTotal((prev) => prev + 1);
            setNewUserEmail("");
            setNewUserPassword("");
            setNewUserRole("manager");
            toast.success(t("users.added"));
        } catch (err) {
            toast.error(err.message || t("common.error"));
        }
    };

    const handleDeleteUser = async (id) => {
        try {
            await del(`/users/${id}`);
            setUsers(users.filter((user) => user.id !== id));
            setTotal((prev) => Math.max(0, prev - 1));
            toast.success(t("users.deleted"));
        } catch (err) {
            toast.error(err.message || t("common.error"));
        }
    };

    const handleUpdateUser = async (id, changes) => {
        try {
            const updated = await put(`/users/${id}`, changes);
            setUsers(users.map((user) => (user.id === id ? updated : user)));
            toast.success(t("users.updated"));
        } catch (err) {
            toast.error(err.message || t("common.error"));
        }
    };

    // Client-side search over the loaded page (email).
    const visible = users.filter((user) => {
        if (!search.trim()) return true;
        return (user.email || "").toLowerCase().includes(search.trim().toLowerCase());
    });

    return (
        <div className="user-management-container page-enter">
            <h1 className="gradient-text">{t("users.title")}</h1>
            <div className="add-user-form glass-card">
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
            <div className="toolbar">
                <div className="search-wrap">
                    <span className="search-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
                    </span>
                    <input type="text" className="search-input" placeholder={t("users.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
            </div>
            {loading ? (
                <TableSkeleton rows={4} />
            ) : visible.length === 0 ? (
                <EmptyState title={t("dashboard.noUsers")} text={search ? t("common.noResults") : undefined} />
            ) : (
                <>
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
                    {visible.map((user, i) => (
                        <tr key={user.id} className="stagger-item" style={{animationDelay: `${i * 40}ms`}}>
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
                                    onClick={() => setPendingDelete(user.id)}
                                >
                                    {t("common.delete")}
                                </button>
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
                <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
                </>
            )}

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
            <ConfirmModal
                open={pendingDelete !== null}
                message={t("common.confirmDelete")}
                onConfirm={() => { const id = pendingDelete; setPendingDelete(null); handleDeleteUser(id); }}
                onCancel={() => setPendingDelete(null)}
            />
        </div>
    );
}

export default UserManagement;
