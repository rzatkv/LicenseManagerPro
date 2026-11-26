import React, {useState, useEffect, useCallback} from "react";
import {get, getList, post, put, del} from "../utils/api";
import {useLanguage} from "../i18n";
import {useToast} from "../components/Toast";
import ConfirmModal from "../components/ConfirmModal";
import Modal from "../components/Modal";
import EmptyState from "../components/EmptyState";
import Pagination from "../components/Pagination";
import {useResponsivePageSize} from "../utils/responsive";
import {TableSkeleton} from "../components/Skeleton";
import ToggleSwitch from "../components/ToggleSwitch";
import "../styles/UserManagement.css";

// Row-action icons (same set as Products/LicenseList): 32px icon buttons;
// at ≤640px only the eye stays in the row (global .row-action-extra
// rule), delete lives in the View/Edit popup.
const ICONS = {
  view: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  delete: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>,
};


function UserManagement() {
    const {t} = useLanguage();
    const {toast} = useToast();
    const [users, setUsers] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const pageSize = useResponsivePageSize();
    // Breakpoint change resets to page 1 (the fetch refetches via its
    // pageSize dep below).
    useEffect(() => { setPage(1); }, [pageSize]);
    const [search, setSearch] = useState("");
    const [roleFilter, setRoleFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [customRoles, setCustomRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newUserEmail, setNewUserEmail] = useState("");
    const [newUserPassword, setNewUserPassword] = useState("");
    const [newUserRole, setNewUserRole] = useState("manager");
    const [addOpen, setAddOpen] = useState(false);
    const [pendingDelete, setPendingDelete] = useState(null);
    // View/Edit popup (v3.0.1): rows used to have no View/Edit action at
    // all — only the inline role dropdown, Active switch and Delete. The
    // popup shows the details and edits role/active inside it (same
    // immediate-save behaviour as the inline controls); at ≤640px the
    // role/active columns are hidden, so this is the only place a phone
    // user edits them.
    const [selectedUser, setSelectedUser] = useState(null);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const {items, total: t} = await getList("/users", {skip: (page - 1) * pageSize, limit: pageSize});
            setUsers(items);
            setTotal(t);
        } catch (err) {
            toast.error(err.message || t("common.failedFetch"));
            setUsers([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    }, [page, pageSize, toast, t]);

    useEffect(() => {
        fetchUsers();
    }, [fetchUsers]);

    useEffect(() => {
        // Custom roles for the role filter (GET /api/roles, admin only).
        // The endpoint is not mocked in demo mode and may 403 for
        // non-admins: any failure silently falls back to the four
        // built-in roles.
        get("/roles").then((data) => {
            const list = Array.isArray(data) ? data : (data.roles || []);
            setCustomRoles(list.filter((r) => !r.is_builtin));
        }).catch(() => setCustomRoles([]));
    }, []);

    const handleAddUser = async () => {
        try {
            const newUser = await post("/users", {
                email: newUserEmail,
                password: newUserPassword,
                role: newUserRole,
            });
            if (page === 1) setUsers([...users, newUser].slice(0, pageSize));
            setTotal((prev) => prev + 1);
            setNewUserEmail("");
            setNewUserPassword("");
            setNewUserRole("manager");
            setAddOpen(false);
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

    const BUILTIN_ROLES = ["admin", "manager", "support", "viewer"];

    // Client-side search + role + status filters over the loaded page
    // only: the list is paginated server-side, so rows on other pages
    // are not filtered. The demo mock has no server-side user filter,
    // so filtering here works in demo mode as-is.
    const filtersActive = search.trim() !== "" || roleFilter !== "" || statusFilter !== "all";
    const visible = users.filter((user) => {
        if (search.trim() && !(user.email || "").toLowerCase().includes(search.trim().toLowerCase())) return false;
        if (roleFilter) {
            const custom = customRoles.find((r) => r.slug === roleFilter || r.name === roleFilter);
            const matches = user.role === roleFilter
                || (custom && (user.role === custom.slug || user.role === custom.name));
            if (!matches) return false;
        }
        if (statusFilter === "active" && !user.is_active) return false;
        if (statusFilter === "inactive" && user.is_active) return false;
        return true;
    });

    const clearFilters = () => {
        setSearch("");
        setRoleFilter("");
        setStatusFilter("all");
    };

    return (
        <div className="user-management-container page-enter">
            <h1 className="gradient-text">{t("users.title")}</h1>
            <div className="toolbar">
                <button type="button" onClick={() => setAddOpen(true)}>{t("users.addButton")}</button>
                <div className="search-wrap">
                    <span className="search-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
                    </span>
                    <input type="text" className="search-input" placeholder={t("users.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <div className="filter-container">
                    <label htmlFor="user-role-filter">{t("common.role")}:</label>
                    <select id="user-role-filter" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                        <option value="">{t("common.all")}</option>
                        {BUILTIN_ROLES.map((r) => (
                            <option key={r} value={r}>{t(`roles.${r}`)}</option>
                        ))}
                        {customRoles.map((r) => (
                            <option key={r.slug || r.id} value={r.slug || r.name}>{r.name}</option>
                        ))}
                    </select>
                </div>
                <div className="filter-container">
                    <label htmlFor="user-status-filter">{t("common.status")}:</label>
                    <select id="user-status-filter" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                        <option value="all">{t("common.all")}</option>
                        <option value="active">{t("common.active")}</option>
                        <option value="inactive">{t("common.inactive")}</option>
                    </select>
                </div>
                {filtersActive && (
                    <button type="button" className="btn-ghost" onClick={clearFilters}>{t("filters.clearAll")}</button>
                )}
            </div>
            {loading ? (
                <TableSkeleton rows={4} />
            ) : visible.length === 0 ? (
                <EmptyState title={t("dashboard.noUsers")} text={filtersActive ? t("common.noResults") : undefined} />
            ) : (
                <>
                <div className="table-wrap">
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
                                <ToggleSwitch
                                    checked={!!user.is_active}
                                    onChange={(v) => handleUpdateUser(user.id, {is_active: v})}
                                    ariaLabel={t("users.active")}
                                />
                            </td>
                            <td>
                                <div className="row-actions">
                                    <button className="view-btn icon-btn" title={t("common.view")} aria-label={t("common.view")} onClick={() => setSelectedUser(user)}>{ICONS.view}</button>
                                    <button
                                        className="delete-btn icon-btn row-action-extra"
                                        title={t("common.delete")}
                                        aria-label={t("common.delete")}
                                        onClick={() => setPendingDelete(user.id)}
                                    >
                                        {ICONS.delete}
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
                </div>
                <Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} />
                </>
            )}

            <Modal open={addOpen} title={t("users.add")} onClose={() => setAddOpen(false)}>
                <div className="add-user-form">
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
            </Modal>
            <Modal open={!!selectedUser} title={selectedUser ? selectedUser.email : ""} onClose={() => setSelectedUser(null)}>
                {selectedUser && (<>
                    <div className="detail-row"><strong>ID</strong><span>{selectedUser.id}</span></div>
                    <div className="detail-row"><strong>{t("common.email")}</strong><span>{selectedUser.email}</span></div>
                    {selectedUser.created_at && <div className="detail-row"><strong>{t("common.createdAt")}</strong><span>{selectedUser.created_at}</span></div>}
                    <label className="field-label">
                        <span>{t("common.role")}</span>
                        <select
                            value={selectedUser.role}
                            onChange={(e) => { const role = e.target.value; setSelectedUser({...selectedUser, role}); handleUpdateUser(selectedUser.id, {role}); }}
                        >
                            {BUILTIN_ROLES.map((r) => (
                                <option key={r} value={r}>{t(`roles.${r}`)}</option>
                            ))}
                            {customRoles.map((r) => (
                                <option key={r.slug || r.id} value={r.slug || r.name}>{r.name}</option>
                            ))}
                        </select>
                    </label>
                    <ToggleSwitch
                        checked={!!selectedUser.is_active}
                        onChange={(v) => { setSelectedUser({...selectedUser, is_active: v}); handleUpdateUser(selectedUser.id, {is_active: v}); }}
                        label={t("users.active")}
                    />
                    <div className="row-actions modal-actions">
                        <button className="btn-danger" onClick={() => { const id = selectedUser.id; setSelectedUser(null); setPendingDelete(id); }}>{t("common.delete")}</button>
                        <button type="button" className="btn-ghost" onClick={() => setSelectedUser(null)}>{t("common.close")}</button>
                    </div>
                </>)}
            </Modal>
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
