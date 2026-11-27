import React, {useState, useCallback} from "react";
import {get, post, put, del} from "../utils/api";
import {useLanguage} from "../i18n";
import {useToast} from "../components/Toast";
import {useListFetch} from "../utils/useListFetch";
import ConfirmModal from "../components/ConfirmModal";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import ChipSelect from "../components/ChipSelect";
import {TableSkeleton} from "../components/Skeleton";
import "../styles/Roles.css";
import {Plus} from "lucide-react";

/** Compact 32px action icons (same set as Products/Licenses): text
 * buttons made the actions cell too wide on phones, and icon buttons
 * keep the row actions identical across all list pages. */
const ICONS = {
  edit: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.8 2.8 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>,
  delete: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>,
};

/** Map a permission string to its roles.perm.* i18n key suffix.
 * "products:write" -> "productsWrite",
 * "system:check-expiring" -> "systemCheckExpiring",
 * "api_keys:create" -> "apiKeysCreate".
 * Returns null for "*" (no label exists; never offered in the checklist). */
function permLabelKey(perm) {
    if (!perm || perm === "*" || !perm.includes(":")) return null;
    const [resource, action] = perm.split(":");
    const camel = (s) =>
        s
            .split(/[-_]/)
            .filter(Boolean)
            .map((part, i) =>
                i === 0
                    ? part.toLowerCase()
                    : part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
            )
            .join("");
    const actionCamel = camel(action);
    return camel(resource) + actionCamel.charAt(0).toUpperCase() + actionCamel.slice(1);
}

/** Admin-only page: list, create, edit and delete roles. */
function Roles() {
    const {t} = useLanguage();
    const {toast} = useToast();
    const [roles, setRoles] = useState([]);
    const [allPermissions, setAllPermissions] = useState([]);
    // `loading` comes from useListFetch below (it owns the fetch state).
    const [forbidden, setForbidden] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editing, setEditing] = useState(null);
    const [formName, setFormName] = useState("");
    const [formDescription, setFormDescription] = useState("");
    const [formPermissions, setFormPermissions] = useState([]);
    const [saving, setSaving] = useState(false);
    const [pendingDelete, setPendingDelete] = useState(null);

    /** i18n label for a permission string; raw string when no key exists. */
    const permLabel = useCallback(
        (perm) => {
            const mapped = permLabelKey(perm);
            if (!mapped) return perm;
            const key = `roles.perm.${mapped}`;
            const label = t(key);
            return label === key ? perm : label;
        },
        [t]
    );

    // v3.0.6: shared list fetch. The 403 case keeps its exact UX (a
    // forbidden flag instead of a toast), so it runs silent with a
    // reproducing onError; onStart clears the flag each attempt.
    const {loading, reload: fetchRoles} = useListFetch(
        async () => Promise.all([get("/roles"), get("/roles/permissions")]),
        [toast, t],
        {
            silent: true,
            onStart: () => setForbidden(false),
            onData: ([list, perms]) => {
                setRoles(Array.isArray(list) ? list : []);
                // The backend returns a bare array; tolerate a wrapped
                // {permissions: [...]} shape too, so a mock/contract drift can
                // never again silently empty the checklist (v2.3.1 defect).
                const permList = Array.isArray(perms) ? perms : (perms && perms.permissions) || [];
                setAllPermissions(permList.filter((p) => p !== "*"));
            },
            onError: (err) => {
                if (err && err.status === 403) {
                    setForbidden(true);
                } else {
                    toast.error(err.message || t("common.failedFetch"));
                }
                setRoles([]);
                setAllPermissions([]);
            },
        },
    );

    const openCreate = () => {
        setEditing(null);
        setFormName("");
        setFormDescription("");
        setFormPermissions([]);
        setShowForm(true);
    };

    const openEdit = (role) => {
        setEditing(role);
        setFormName(role.name || "");
        setFormDescription(role.description || "");
        setFormPermissions(Array.isArray(role.permissions) ? [...role.permissions] : []);
        setShowForm(true);
    };

    const togglePermission = (perm) => {
        setFormPermissions((prev) =>
            prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm]
        );
    };

    const closeForm = () => {
        setShowForm(false);
        setEditing(null);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        const isBuiltin = !!editing?.is_builtin;
        const isAdmin = editing?.slug === "admin";
        if (!isBuiltin && !formName.trim()) return;
        setSaving(true);
        try {
            if (editing) {
                const body = {description: formDescription};
                if (!isBuiltin) body.name = formName.trim();
                // The admin role's permissions cannot be edited (backend rejects it).
                if (!isAdmin) body.permissions = formPermissions;
                await put(`/roles/${editing.id}`, body);
                toast.success(t("roles.updated"));
            } else {
                await post("/roles", {
                    name: formName.trim(),
                    description: formDescription,
                    permissions: formPermissions,
                });
                toast.success(t("roles.created"));
            }
            closeForm();
            fetchRoles();
        } catch (err) {
            toast.error(err.message || t("common.error"));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id) => {
        try {
            await del(`/roles/${id}`);
            toast.success(t("roles.deleted"));
            fetchRoles();
        } catch (err) {
            // e.g. 400 when the role is still assigned to users: show the server's message.
            toast.error(err.message || t("common.error"));
        }
    };

    const isAdminRole = (role) => role.slug === "admin";
    const permissionsEditable = !editing || !isAdminRole(editing);

    return (
        <div className="roles-container page-enter">
            <h1 className="gradient-text">{t("roles.title")}</h1>
            <div className="toolbar">
                <button onClick={openCreate}><Plus size={16} />{t("roles.create")}</button>
            </div>

            {loading ? (
                <TableSkeleton rows={4} />
            ) : forbidden ? (
                <EmptyState title={t("errors.forbidden")} />
            ) : roles.length === 0 ? (
                <EmptyState
                    title={t("roles.noRoles")}
                    actionLabel={t("roles.create")}
                    onAction={openCreate}
                />
            ) : (
                <div className="table-wrap">
                    <table>
                        <thead>
                            <tr>
                                <th>{t("roles.name")}</th>
                                <th className="col-slug">slug</th>
                                <th>{t("roles.usersCount")}</th>
                                <th className="col-perms">{t("roles.permissions")}</th>
                                <th>{t("common.actions")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {roles.map((role, i) => (
                                <tr key={role.id} className="stagger-item" style={{animationDelay: `${i * 40}ms`}}>
                                    <td>
                                        <div className="role-name">{role.name}</div>
                                        <span className={`role-badge ${role.is_builtin ? "role-badge-builtin" : "role-badge-custom"}`}>
                                            {role.is_builtin ? t("roles.builtin") : t("roles.custom")}
                                        </span>
                                        {role.description && (
                                            <div className="role-description">{role.description}</div>
                                        )}
                                    </td>
                                    <td className="role-slug col-slug">{role.slug}</td>
                                    <td>{role.users_count ?? 0}</td>
                                    <td className="col-perms">
                                        <div className="perm-pills">
                                            {(role.permissions || []).map((perm) => (
                                                <span key={perm} className="perm-pill" title={perm}>
                                                    {permLabel(perm)}
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                    <td>
                                        <div className="row-actions">
                                            <button className="edit-btn icon-btn" title={t("common.edit")} aria-label={t("common.edit")} onClick={() => openEdit(role)}>
                                                {ICONS.edit}
                                            </button>
                                            {!role.is_builtin && (
                                                <button
                                                    className="delete-btn icon-btn"
                                                    title={t("common.delete")}
                                                    aria-label={t("common.delete")}
                                                    onClick={() => setPendingDelete(role)}
                                                >
                                                    {ICONS.delete}
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <Modal
                open={showForm}
                title={editing ? `${t("common.edit")} — ${editing.name}` : t("roles.create")}
                onClose={closeForm}
            >
                    <form className="roles-form" onSubmit={handleSave}>
                        <label className="field-label" htmlFor="role-name">
                            {t("roles.name")}
                        </label>
                        <input
                            id="role-name"
                            type="text"
                            placeholder={t("roles.namePlaceholder")}
                            value={formName}
                            onChange={(e) => setFormName(e.target.value)}
                            disabled={!!editing?.is_builtin}
                        />
                        <label className="field-label" htmlFor="role-description">
                            {t("roles.description")}
                        </label>
                        <textarea
                            id="role-description"
                            placeholder={t("roles.descriptionPlaceholder")}
                            value={formDescription}
                            onChange={(e) => setFormDescription(e.target.value)}
                            rows={3}
                        />
                        <div className="field-label">{t("roles.permissions")}</div>
                        <p className="hint">{t("roles.selectPermissions")}</p>
                        {permissionsEditable ? (
                            <ChipSelect
                                ariaLabel={t("roles.permissions")}
                                options={allPermissions.map((perm) => ({
                                    value: perm,
                                    label: permLabel(perm),
                                }))}
                                selected={formPermissions}
                                onToggle={togglePermission}
                            />
                        ) : (
                            <div className="perm-pills">
                                {formPermissions.map((perm) => (
                                    <span key={perm} className="perm-pill" title={perm}>
                                        {permLabel(perm)}
                                    </span>
                                ))}
                            </div>
                        )}
                        <div className="form-row">
                            <button type="submit" disabled={saving}>
                                {t("common.save")}
                            </button>
                            <button type="button" className="btn-ghost" onClick={closeForm}>
                                {t("common.cancel")}
                            </button>
                        </div>
                    </form>
                </Modal>

            <ConfirmModal
                open={pendingDelete !== null}
                message={t("roles.deleteConfirm")}
                onConfirm={() => {
                    const role = pendingDelete;
                    setPendingDelete(null);
                    if (role) handleDelete(role.id);
                }}
                onCancel={() => setPendingDelete(null)}
            />
        </div>
    );
}

export default Roles;
