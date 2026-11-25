import React, {useState, useEffect, useCallback} from "react";
import {useSearchParams} from "react-router-dom";
import {get, getList, post, del} from "../utils/api";
import {useLanguage} from "../i18n";
import {useToast} from "../components/Toast";
import ConfirmModal from "../components/ConfirmModal";
import CopyButton from "../components/CopyButton";
import EmptyState from "../components/EmptyState";
import Pagination from "../components/Pagination";
import {TableSkeleton} from "../components/Skeleton";
import "../styles/LicenseList.css";

const PAGE_SIZE = 10;

function statusPill(status, t) {
    const label = t(`common.${status}`) !== `common.${status}` ? t(`common.${status}`) : status;
    return (
        <span className={`status-pill status-${status}`}>
            {status === "active" && <span className="pulse-dot" />}
            {label}
        </span>
    );
}

function LicenseList() {
    const {t} = useLanguage();
    const {toast} = useToast();
    const [licenses, setLicenses] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [products, setProducts] = useState([]);
    const [filter, setFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState(null);
    const [validateResult, setValidateResult] = useState(null);
    const [validateDomain, setValidateDomain] = useState("");
    const [validateIp, setValidateIp] = useState("");
    const [validatePath, setValidatePath] = useState("");
    const [newProduct, setNewProduct] = useState("");
    const [newProductId, setNewProductId] = useState("");
    const [newCycle, setNewCycle] = useState("");
    const [newOwnerEmail, setNewOwnerEmail] = useState("");
    const [newExpiresInDays, setNewExpiresInDays] = useState(365);
    const [newMaxActivations, setNewMaxActivations] = useState(1);
    const [newDomains, setNewDomains] = useState("");
    const [newIps, setNewIps] = useState("");
    const [newInstallPath, setNewInstallPath] = useState("");
    const [pendingDelete, setPendingDelete] = useState(null);
    const [searchParams] = useSearchParams();
    const productFilter = searchParams.get("product") || "";

    const fetchLicenses = useCallback(async () => {
        setLoading(true);
        try {
            const q = productFilter ? `?filter=${filter}&product=${productFilter}` : `?filter=${filter}`;
            const {items, total: t} = await getList(`/licenses${q}`, {skip: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE});
            setLicenses(items);
            setTotal(t);
        } catch (err) {
            toast.error(err.message || t("common.failedFetch"));
            setLicenses([]);
            setTotal(0);
        } finally {
            setLoading(false);
        }
    }, [filter, productFilter, page, toast, t]);

    const fetchProducts = useCallback(async () => {
        try {
            const data = await get("/products");
            setProducts(Array.isArray(data) ? data : []);
        } catch (err) {
            setProducts([]);
        }
    }, []);

    useEffect(() => { fetchLicenses(); }, [fetchLicenses]);
    useEffect(() => { fetchProducts(); }, [fetchProducts]);

    const selectedProduct = products.find((p) => String(p.id) === String(newProductId));
    const cycles = selectedProduct ? (selectedProduct.billing_cycles || []) : [];

    const handleRenew = async (id) => {
        try {
            // No body: the backend renews by the license's own billing cycle.
            const renewed = await post(`/licenses/${id}/renew`, {});
            setLicenses(licenses.map((license) => (license.id === id ? renewed : license)));
            if (selected && selected.id === id) setSelected(renewed);
            toast.success(t("licenses.renewed"));
        } catch (err) {
            toast.error(err.message || t("common.error"));
        }
    };

    const handleValidate = async (license) => {
        try {
            const result = await post("/licenses/validate", {
                key: license.key,
                domain: validateDomain || undefined,
                ip: validateIp || undefined,
                install_path: validatePath || undefined,
            });
            setValidateResult(result);
        } catch (err) {
            toast.error(err.message || t("common.error"));
        }
    };

    const handleDelete = async (id) => {
        try {
            await del(`/licenses/${id}`);
            setLicenses(licenses.filter((license) => license.id !== id));
            setTotal((prev) => Math.max(0, prev - 1));
            if (selected && selected.id === id) setSelected(null);
            toast.success(t("licenses.deleted"));
        } catch (err) {
            toast.error(err.message || t("common.error"));
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            let payload;
            if (newProductId) {
                if (!newCycle) { toast.error(t("licenses.cycleRequired")); return; }
                payload = {
                    product_id: Number(newProductId),
                    billing_cycle: newCycle,
                    owner_email: newOwnerEmail || undefined,
                    max_activations: Number(newMaxActivations) || 1,
                    allowed_domains: newDomains || undefined,
                    allowed_ips: newIps || undefined,
                    install_path: newInstallPath || undefined,
                };
            } else {
                if (!newProduct.trim()) { toast.error(t("licenses.productRequired")); return; }
                payload = {
                    product: newProduct,
                    owner_email: newOwnerEmail || undefined,
                    expires_in_days: Number(newExpiresInDays) || undefined,
                    max_activations: Number(newMaxActivations) || 1,
                    allowed_domains: newDomains || undefined,
                    allowed_ips: newIps || undefined,
                    install_path: newInstallPath || undefined,
                };
            }
            const created = await post("/licenses", payload);
            if (page === 1) setLicenses([created, ...licenses].slice(0, PAGE_SIZE));
            setTotal((prev) => prev + 1);
            setNewProduct(""); setNewProductId(""); setNewCycle("");
            setNewOwnerEmail(""); setNewExpiresInDays(365); setNewMaxActivations(1);
            setNewDomains(""); setNewIps(""); setNewInstallPath("");
            toast.success(t("licenses.created"));
        } catch (err) {
            toast.error(err.message || t("common.error"));
        }
    };

    // Client-side search over the loaded page (key / product / owner).
    const visible = licenses.filter((lic) => {
        if (!search.trim()) return true;
        const q = search.trim().toLowerCase();
        return (lic.key || "").toLowerCase().includes(q)
            || (lic.product || "").toLowerCase().includes(q)
            || (lic.owner_email || "").toLowerCase().includes(q);
    });

    return (
        <div className="license-list-container page-enter">
            <h1 className="gradient-text">{t("licenses.title")}</h1>
            {productFilter && <p className="dashboard-empty">{t("products.title")}: {products.find((p) => String(p.id) === productFilter)?.name || productFilter}</p>}
            <div className="toolbar">
                <div className="filter-container">
                    <label htmlFor="filter">{t("licenses.filter")}:</label>
                    <select id="filter" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}>
                        <option value="all">{t("licenses.all")}</option>
                        <option value="active">{t("licenses.active")}</option>
                        <option value="inactive">{t("licenses.inactive")}</option>
                        <option value="daily">{t("licenses.daily")}</option>
                        <option value="weekly">{t("licenses.weekly")}</option>
                        <option value="monthly">{t("licenses.monthly")}</option>
                    </select>
                </div>
                <div className="search-wrap">
                    <span className="search-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
                    </span>
                    <input type="text" className="search-input" placeholder={t("licenses.searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
            </div>
            <form className="add-license-form glass-card" onSubmit={handleCreate} style={{margin: "16px 0"}}>
                <h3>{t("licenses.create")}</h3>
                <select value={newProductId} onChange={(e) => { setNewProductId(e.target.value); setNewCycle(""); }}>
                    <option value="">{t("licenses.noProduct")}</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.price} {p.currency})</option>)}
                </select>
                {newProductId ? (
                    <select value={newCycle} onChange={(e) => setNewCycle(e.target.value)} required>
                        <option value="">{t("licenses.billingCycle")}</option>
                        {cycles.map((c) => <option key={c} value={c}>{t(`cycle.${c}`)}</option>)}
                    </select>
                ) : (
                    <>
                        <input type="text" placeholder={t("licenses.productName")} value={newProduct} onChange={(e) => setNewProduct(e.target.value)} required />
                        <input type="number" min="1" placeholder={t("licenses.expiresInDays")} value={newExpiresInDays} onChange={(e) => setNewExpiresInDays(e.target.value)} />
                    </>
                )}
                <input type="email" placeholder={t("licenses.ownerEmail")} value={newOwnerEmail} onChange={(e) => setNewOwnerEmail(e.target.value)} />
                <input type="number" min="1" placeholder={t("licenses.maxActivations")} value={newMaxActivations} onChange={(e) => setNewMaxActivations(e.target.value)} />
                <input type="text" placeholder={t("licenses.allowedDomains")} value={newDomains} onChange={(e) => setNewDomains(e.target.value)} />
                <small className="hint">{t("licenses.allowedDomainsHint")}</small>
                <input type="text" placeholder={t("licenses.allowedIps")} value={newIps} onChange={(e) => setNewIps(e.target.value)} />
                <small className="hint">{t("licenses.allowedIpsHint")}</small>
                <input type="text" placeholder={t("licenses.installPath")} value={newInstallPath} onChange={(e) => setNewInstallPath(e.target.value)} />
                <small className="hint">{t("licenses.installPathHint")}</small>
                <button type="submit">{t("licenses.create")}</button>
            </form>
            {loading ? (
                <TableSkeleton rows={5} />
            ) : visible.length === 0 ? (
                <EmptyState title={t("licenses.noLicenses")} text={search ? t("common.noResults") : undefined} />
            ) : (
            <>
            <table>
                <thead>
                <tr>
                    <th>ID</th>
                    <th>{t("licenses.key")}</th>
                    <th>{t("licenses.product")}</th>
                    <th>{t("licenses.billingCycle")}</th>
                    <th>{t("common.status")}</th>
                    <th>{t("common.createdAt")}</th>
                    <th>{t("common.actions")}</th>
                </tr>
                </thead>
                <tbody>
                {visible.map((license, i) => (
                    <tr key={license.id} className="stagger-item" style={{animationDelay: `${i * 40}ms`}}>
                        <td>{license.id}</td>
                        <td>
                            {license.key} <CopyButton text={license.key} />
                        </td>
                        <td>{license.product}</td>
                        <td>{license.billing_cycle ? <span className="badge">{t(`cycle.${license.billing_cycle}`)}</span> : "-"}</td>
                        <td>{statusPill(license.status, t)}</td>
                        <td>{license.created_at}</td>
                        <td>
                            <button className="view-btn" onClick={() => { setSelected(license); setValidateResult(null); setValidateDomain(""); setValidateIp(""); setValidatePath(""); }}>
                                {t("common.view")}
                            </button>
                            <button className="renew-btn" onClick={() => handleRenew(license.id)}>
                                {t("common.renew")}
                            </button>
                            <button className="delete-btn" onClick={() => setPendingDelete(license.id)}>
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
            {selected && (
                <div className="license-detail glass-card" style={{marginTop: "16px"}}>
                    <h3>{t("licenses.licenseDetail")} #{selected.id}</h3>
                    <p><strong>{t("licenses.key")}:</strong> {selected.key} <CopyButton text={selected.key} /></p>
                    <p><strong>{t("licenses.product")}:</strong> {selected.product}</p>
                    <p><strong>{t("licenses.billingCycle")}:</strong> {selected.billing_cycle ? t(`cycle.${selected.billing_cycle}`) : "-"}</p>
                    <p><strong>{t("licenses.owner")}:</strong> {selected.owner_email || "-"}</p>
                    <p><strong>{t("common.status")}:</strong> {statusPill(selected.status, t)}</p>
                    <p><strong>{t("licenses.expiresAt")}:</strong> {selected.expires_at || t("common.never")}</p>
                    <p><strong>{t("licenses.activations")}:</strong> {selected.activations} / {selected.max_activations}</p>
                    <p><strong>{t("licenses.allowedDomains")}:</strong> {(selected.allowed_domains || []).join(", ") || "-"}</p>
                    <p><strong>{t("licenses.allowedIps")}:</strong> {(selected.allowed_ips || []).join(", ") || "-"}</p>
                    <p><strong>{t("licenses.installPath")}:</strong> {selected.install_path || "-"}</p>
                    <p><strong>{t("common.createdAt")}:</strong> {selected.created_at}</p>
                    <p><strong>{t("common.updatedAt")}:</strong> {selected.updated_at}</p>
                    <div className="validate-form">
                        <h4>{t("licenses.validateWith")}</h4>
                        <input type="text" placeholder={t("licenses.domain")} value={validateDomain} onChange={(e) => setValidateDomain(e.target.value)} />
                        <input type="text" placeholder={t("licenses.ip")} value={validateIp} onChange={(e) => setValidateIp(e.target.value)} />
                        <input type="text" placeholder={t("licenses.installPath")} value={validatePath} onChange={(e) => setValidatePath(e.target.value)} />
                        <button onClick={() => handleValidate(selected)}>{t("common.validate")}</button>
                    </div>
                    <button onClick={() => handleRenew(selected.id)}>{t("licenses.renewCycle")}</button>{" "}
                    <button className="btn-ghost" onClick={() => { setSelected(null); setValidateResult(null); }}>{t("common.close")}</button>
                    {validateResult && (
                        <p className="validate-result">
                            <strong>{t("licenses.validation")}:</strong>{" "}
                            {validateResult.valid ? t("licenses.valid") : t("licenses.invalid")}
                            {validateResult.detail ? ` — ${validateResult.detail}` : ""}
                            {validateResult.reason && validateResult.reason !== validateResult.detail ? ` (${validateResult.reason})` : ""}
                        </p>
                    )}
                </div>
            )}
            <ConfirmModal
                open={pendingDelete !== null}
                message={t("common.confirmDelete")}
                onConfirm={() => { const id = pendingDelete; setPendingDelete(null); handleDelete(id); }}
                onCancel={() => setPendingDelete(null)}
            />
        </div>
    );
}

export default LicenseList;
