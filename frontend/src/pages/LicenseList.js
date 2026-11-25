import React, {useState, useEffect, useCallback} from "react";
import {useSearchParams} from "react-router-dom";
import {get, post, del} from "../utils/api";
import {useLanguage} from "../i18n";
import "../styles/LicenseList.css";

function LicenseList() {
    const {t} = useLanguage();
    const [licenses, setLicenses] = useState([]);
    const [products, setProducts] = useState([]);
    const [filter, setFilter] = useState("all");
    const [error, setError] = useState("");
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
    const [searchParams] = useSearchParams();
    const productFilter = searchParams.get("product") || "";

    const fetchLicenses = useCallback(async () => {
        try {
            const q = productFilter ? `?filter=${filter}&product=${productFilter}` : `?filter=${filter}`;
            const data = await get(`/licenses${q}`);
            setLicenses(data);
            setError("");
        } catch (err) {
            setError(err.message || t("common.failedFetch"));
        }
    }, [filter, productFilter, t]);

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
            setError("");
        } catch (err) {
            setError(err.message || t("common.error"));
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
            setError(err.message || t("common.error"));
        }
    };

    const handleDelete = async (id) => {
        try {
            await del(`/licenses/${id}`);
            setLicenses(licenses.filter((license) => license.id !== id));
            if (selected && selected.id === id) setSelected(null);
        } catch (err) {
            setError(err.message || t("common.error"));
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            let payload;
            if (newProductId) {
                if (!newCycle) { setError(t("licenses.cycleRequired")); return; }
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
                if (!newProduct.trim()) { setError(t("licenses.productRequired")); return; }
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
            setLicenses([created, ...licenses]);
            setNewProduct(""); setNewProductId(""); setNewCycle("");
            setNewOwnerEmail(""); setNewExpiresInDays(365); setNewMaxActivations(1);
            setNewDomains(""); setNewIps(""); setNewInstallPath("");
            setError("");
        } catch (err) {
            setError(err.message || t("common.error"));
        }
    };

    return (
        <div className="license-list-container">
            <h1>{t("licenses.title")}</h1>
            {productFilter && <p className="dashboard-empty">{t("products.title")}: {products.find((p) => String(p.id) === productFilter)?.name || productFilter}</p>}
            {error && <div className="error-message">{error}</div>}
            <div className="filter-container">
                <label htmlFor="filter">{t("licenses.filter")}:</label>
                <select id="filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
                    <option value="all">{t("licenses.all")}</option>
                    <option value="active">{t("licenses.active")}</option>
                    <option value="inactive">{t("licenses.inactive")}</option>
                    <option value="daily">{t("licenses.daily")}</option>
                    <option value="weekly">{t("licenses.weekly")}</option>
                    <option value="monthly">{t("licenses.monthly")}</option>
                </select>
            </div>
            <form className="add-license-form" onSubmit={handleCreate} style={{margin: "16px 0"}}>
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
            {licenses.length === 0 ? (
                <p className="dashboard-empty">{t("licenses.noLicenses")}</p>
            ) : (
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
                {licenses.map((license) => (
                    <tr key={license.id}>
                        <td>{license.id}</td>
                        <td>{license.key}</td>
                        <td>{license.product}</td>
                        <td>{license.billing_cycle ? <span className="badge">{t(`cycle.${license.billing_cycle}`)}</span> : "-"}</td>
                        <td>{license.status}</td>
                        <td>{license.created_at}</td>
                        <td>
                            <button className="view-btn" onClick={() => { setSelected(license); setValidateResult(null); setValidateDomain(""); setValidateIp(""); setValidatePath(""); }}>
                                {t("common.view")}
                            </button>
                            <button className="renew-btn" onClick={() => handleRenew(license.id)}>
                                {t("common.renew")}
                            </button>
                            <button className="delete-btn" onClick={() => handleDelete(license.id)}>
                                {t("common.delete")}
                            </button>
                        </td>
                    </tr>
                ))}
                </tbody>
            </table>
            )}
            {selected && (
                <div className="license-detail" style={{marginTop: "16px"}}>
                    <h3>{t("licenses.licenseDetail")} #{selected.id}</h3>
                    <p><strong>{t("licenses.key")}:</strong> {selected.key}</p>
                    <p><strong>{t("licenses.product")}:</strong> {selected.product}</p>
                    <p><strong>{t("licenses.billingCycle")}:</strong> {selected.billing_cycle ? t(`cycle.${selected.billing_cycle}`) : "-"}</p>
                    <p><strong>{t("licenses.owner")}:</strong> {selected.owner_email || "-"}</p>
                    <p><strong>{t("common.status")}:</strong> {selected.status}</p>
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
                    <button onClick={() => { setSelected(null); setValidateResult(null); }}>{t("common.close")}</button>
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
        </div>
    );
}

export default LicenseList;
