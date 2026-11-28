import React, {useState} from "react";
import {Link} from "react-router-dom";
import {get, getList, post, put, del} from "../utils/api";
import {useLanguage} from "../i18n";
import {useToast} from "../components/Toast";
import {useListFetch} from "../utils/useListFetch";
import {useLiveRefresh} from "../utils/useLiveRefresh";
import LiveIndicator from "../components/LiveIndicator";
import ConfirmModal from "../components/ConfirmModal";
import EmptyState from "../components/EmptyState";
import Modal from "../components/Modal";
import Wizard from "../components/Wizard";
import "../styles/Products.css";
import {Plus} from "lucide-react";

const emptyGroupForm = {name: "", slug: "", description: "", color: "#7B6CFF", sort_order: 0};

/**
 * Product Groups manager (v2.2.1): a dedicated /product-groups route.
 * In v2.2 the manager lived as a collapsible card inside the Products
 * page, so it was invisible from the sidebar — the visual check flagged
 * the missing nav entry. The page owns the group CRUD + wizard; the
 * Products page keeps only the group filter/column (and its own fetch).
 */
function ProductGroups() {
    const {t} = useLanguage();
    const {toast} = useToast();
    const [groups, setGroups] = useState([]);
    const [products, setProducts] = useState([]);
    // `loading` comes from useListFetch below (it owns the fetch state).
    const [showGroupWizard, setShowGroupWizard] = useState(false);
    const [groupStep, setGroupStep] = useState(0);
    const [groupForm, setGroupForm] = useState(emptyGroupForm);
    const [groupBusy, setGroupBusy] = useState(false);
    const [editingGroupId, setEditingGroupId] = useState(null);
    const [pendingGroupDelete, setPendingGroupDelete] = useState(null);

    // v3.0.6: shared list fetch (loading + toast + empty fallback).
    const {loading, reload: fetchAll, reloadQuiet: fetchAllQuiet, lastUpdated} = useListFetch(
        async () => Promise.all([
            get("/product-groups"),
            getList("/products", {skip: 0, limit: 100}),
        ]),
        [],
        {
            onData: ([groupData, productData]) => {
                setGroups(Array.isArray(groupData) ? groupData : []);
                setProducts(productData.items || []);
            },
            onError: () => { setGroups([]); setProducts([]); },
        },
    );

    // Live auto-refresh (v3.0.11): quiet 60s tick, pauses when hidden.
    useLiveRefresh(fetchAllQuiet);

    const handleGroupWizardCreate = async () => {
        if (!groupForm.name.trim()) { toast.error(t("wizard.nameRequired")); return; }
        setGroupBusy(true);
        try {
            const payload = {
                name: groupForm.name.trim(),
                slug: groupForm.slug.trim() || undefined,
                description: groupForm.description || undefined,
                color: groupForm.color,
                sort_order: Number(groupForm.sort_order) || 0,
            };
            let saved;
            if (editingGroupId !== null) {
                saved = await put(`/product-groups/${editingGroupId}`, payload);
                setGroups(groups.map((g) => (g.id === editingGroupId ? saved : g)));
                toast.success(t("groups.updated"));
            } else {
                saved = await post("/product-groups", payload);
                setGroups([...groups, saved]);
                toast.success(t("groups.created"));
            }
            setGroupForm(emptyGroupForm);
            setGroupStep(0);
            setEditingGroupId(null);
            setShowGroupWizard(false);
        } catch (err) {
            toast.error(err.message || t("common.error"));
        } finally {
            setGroupBusy(false);
        }
    };

    const handleGroupDelete = async (id) => {
        try {
            await del(`/product-groups/${id}`);
            setGroups(groups.filter((g) => g.id !== id));
            toast.success(t("groups.deleted"));
        } catch (err) {
            toast.error(err.message || t("common.error"));
        }
    };

    return (
        <div className="products-container page-enter">
            <h1 className="gradient-text">{t("groups.title")}</h1>
            <div className="toolbar">
                <LiveIndicator lastUpdated={lastUpdated} />
                <button onClick={() => { setEditingGroupId(null); setGroupForm(emptyGroupForm); setGroupStep(0); setShowGroupWizard(true); }}>
                    <Plus size={16} />{t("groups.create")}
                </button>
                <Link className="btn-ghost" to="/products">{t("nav.products")}</Link>
            </div>

            {/* v3.0.1: the group wizard (create AND edit) opens in the
                animated Modal — inline it pushed the groups card down
                the page on phones. The Modal title carries the heading
                now, so the Wizard renders without its own. */}
            <Modal open={showGroupWizard} title={editingGroupId !== null ? t("groups.edit") : t("groups.create")} onClose={() => { setShowGroupWizard(false); setGroupStep(0); setEditingGroupId(null); setGroupForm(emptyGroupForm); }}>
                <Wizard
                    steps={[t("wizard.basics"), t("wizard.colorPreview")]}
                    step={groupStep}
                    onStepChange={setGroupStep}
                    canNext={groupForm.name.trim().length > 0}
                    onSubmit={handleGroupWizardCreate}
                    submitting={groupBusy}
                    onCancel={() => { setShowGroupWizard(false); setGroupStep(0); setEditingGroupId(null); setGroupForm(emptyGroupForm); }}
                >
                    {groupStep === 0 && (
                        <>
                            <div className="form-row">
                                <input type="text" placeholder={t("groups.group")} value={groupForm.name} onChange={(e) => setGroupForm({...groupForm, name: e.target.value})} required />
                                <input type="text" placeholder={t("products.slug")} value={groupForm.slug} onChange={(e) => setGroupForm({...groupForm, slug: e.target.value})} />
                            </div>
                            <input type="text" placeholder={t("common.description")} value={groupForm.description} onChange={(e) => setGroupForm({...groupForm, description: e.target.value})} />
                            <input type="number" min="0" placeholder={t("groups.sortOrder")} value={groupForm.sort_order} onChange={(e) => setGroupForm({...groupForm, sort_order: e.target.value})} />
                        </>
                    )}
                    {groupStep === 1 && (
                        <>
                            <label className="field-label">
                                <span>{t("groups.color")}</span>
                                <input type="color" value={groupForm.color} onChange={(e) => setGroupForm({...groupForm, color: e.target.value})} />
                            </label>
                            <p>
                                <span className="badge" style={{background: groupForm.color, color: "#fff", borderColor: groupForm.color}}>{groupForm.name || t("groups.group")}</span>
                            </p>
                        </>
                    )}
                </Wizard>
            </Modal>

            <div className="groups-card glass-card">
                <h3>{t("groups.title")}</h3>
                {loading ? (
                    <p className="dashboard-empty">{t("common.loading")}</p>
                ) : groups.length === 0 ? (
                    <EmptyState title={t("groups.noGroups")} />
                ) : (
                    <ul className="groups-list">
                        {groups.map((g) => (
                            <li key={g.id}>
                                <span className="group-color-dot" style={{background: g.color || "#7B6CFF"}} />
                                <span className="group-name">{g.name}</span>
                                <span className="group-slug">{g.slug}</span>
                                <span className="group-count">{products.filter((p) => p.group_id === g.id).length} {t("groups.products")}</span>
                                <span className="row-actions">
                                    <button className="edit-btn" onClick={() => { setEditingGroupId(g.id); setGroupForm({name: g.name, slug: g.slug || "", description: g.description || "", color: g.color || "#7B6CFF", sort_order: g.sort_order ?? 0}); setGroupStep(0); setShowGroupWizard(true); }}>{t("common.edit")}</button>
                                    <button className="delete-btn" onClick={() => setPendingGroupDelete(g.id)}>{t("common.delete")}</button>
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <ConfirmModal
                open={pendingGroupDelete !== null}
                message={t("common.confirmDelete")}
                confirmLabel={t("common.delete")}
                onConfirm={() => { const id = pendingGroupDelete; setPendingGroupDelete(null); handleGroupDelete(id); }}
                onCancel={() => setPendingGroupDelete(null)}
            />
        </div>
    );
}

export default ProductGroups;
