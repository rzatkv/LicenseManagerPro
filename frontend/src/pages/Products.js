import React, {useState, useEffect, useCallback} from "react";
import {Link} from "react-router-dom";
import {get, post, put, del} from "../utils/api";
import {useLanguage} from "../i18n";
import "../styles/Products.css";

const ALL_CYCLES = ["monthly", "quarterly", "semiannual", "annual", "biennial", "lifetime"];
const ALL_EVENTS = ["license.created", "license.renewed", "license.revoked", "license.expiring", "license.expired", "license.validated_failed"];

const emptyForm = {
  name: "", slug: "", description: "", price: "", currency: "USD", status: "active",
  billing_cycles: ["monthly", "annual"], webhook_url: "", webhook_events: [], webhook_secret: "",
};

function Products() {
  const {t} = useLanguage();
  const [products, setProducts] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [testResult, setTestResult] = useState(null);

  const fetchProducts = useCallback(async () => {
    try {
      const data = await get("/products");
      setProducts(Array.isArray(data) ? data : []);
      setError("");
    } catch (err) {
      setError(err.message || t("common.failedFetch"));
    }
  }, [t]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const fetchDeliveries = useCallback(async (productId) => {
    try {
      const data = await get(`/webhooks/deliveries?product_id=${productId}&limit=50`);
      setDeliveries(Array.isArray(data) ? data : []);
    } catch (err) {
      setDeliveries([]);
    }
  }, []);

  useEffect(() => {
    if (selectedId) fetchDeliveries(selectedId);
  }, [selectedId, fetchDeliveries]);

  const flash = (msg) => { setNotice(msg); setTimeout(() => setNotice(""), 4000); };

  const toggleIn = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: prev[field].includes(value) ? prev[field].filter((v) => v !== value) : [...prev[field], value],
    }));
  };

  const handleEdit = (p) => {
    setEditingId(p.id);
    setForm({
      name: p.name, slug: p.slug || "", description: p.description || "",
      price: String(p.price ?? ""), currency: p.currency || "USD", status: p.status || "active",
      billing_cycles: p.billing_cycles || [], webhook_url: p.webhook_url || "",
      webhook_events: p.webhook_events || [], webhook_secret: p.webhook_secret || "",
    });
    setTestResult(null);
    setError("");
  };

  const resetForm = () => { setForm(emptyForm); setEditingId(null); setTestResult(null); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {...form, price: Number(form.price) || 0};
      if (editingId !== null) {
        const updated = await put(`/products/${editingId}`, payload);
        setProducts(products.map((p) => (p.id === editingId ? updated : p)));
        flash(t("common.saved"));
      } else {
        const created = await post("/products", payload);
        setProducts([...products, created]);
        flash(t("common.saved"));
      }
      resetForm();
      setError("");
    } catch (err) {
      setError(err.message || t("common.error"));
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      await del(`/products/${id}`);
      setProducts(products.filter((p) => p.id !== id));
      if (selectedId === id) { setSelectedId(null); setDeliveries([]); }
      setError("");
    } catch (err) {
      setError(err.message || t("common.error"));
    }
  };

  const handleTestWebhook = async (id) => {
    try {
      const result = await post(`/products/${id}/test-webhook`, {});
      setTestResult({id, ...result});
      fetchDeliveries(id);
      setError("");
    } catch (err) {
      setTestResult({id, success: false, status_code: null, error: err.message});
    }
  };

  return (
    <div className="products-container">
      <h1>{t("products.title")}</h1>
      {notice && <p className="update-message">{notice}</p>}
      {error && <div className="error-message">{error}</div>}

      <form className="product-form" onSubmit={handleSubmit}>
        <h3>{editingId !== null ? `${t("products.edit")} #${editingId}` : t("products.create")}</h3>
        <div className="form-row">
          <input type="text" placeholder={t("products.name")} value={form.name} onChange={(e) => setForm({...form, name: e.target.value})} required />
          <input type="text" placeholder={t("products.slug")} value={form.slug} onChange={(e) => setForm({...form, slug: e.target.value})} />
        </div>
        <input type="text" placeholder={t("products.description")} value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} />
        <div className="form-row">
          <input type="number" min="0" step="0.01" placeholder={t("products.price")} value={form.price} onChange={(e) => setForm({...form, price: e.target.value})} />
          <input type="text" placeholder={t("common.currency")} value={form.currency} onChange={(e) => setForm({...form, currency: e.target.value})} />
          <select value={form.status} onChange={(e) => setForm({...form, status: e.target.value})}>
            <option value="active">{t("common.active")}</option>
            <option value="inactive">{t("common.inactive")}</option>
          </select>
        </div>
        <fieldset>
          <legend>{t("products.cycles")}</legend>
          {ALL_CYCLES.map((c) => (
            <label key={c} className="check-label">
              <input type="checkbox" checked={form.billing_cycles.includes(c)} onChange={() => toggleIn("billing_cycles", c)} /> {t(`cycle.${c}`)}
            </label>
          ))}
        </fieldset>
        <input type="url" placeholder={t("products.webhookUrl")} value={form.webhook_url} onChange={(e) => setForm({...form, webhook_url: e.target.value})} />
        <fieldset>
          <legend>{t("products.webhookEvents")}</legend>
          {ALL_EVENTS.map((ev) => (
            <label key={ev} className="check-label">
              <input type="checkbox" checked={form.webhook_events.includes(ev)} onChange={() => toggleIn("webhook_events", ev)} /> {ev}
            </label>
          ))}
        </fieldset>
        <input type="text" placeholder={t("products.webhookSecret")} value={form.webhook_secret} onChange={(e) => setForm({...form, webhook_secret: e.target.value})} />
        <div className="form-row">
          <button type="submit">{editingId !== null ? t("common.save") : t("products.create")}</button>
          {editingId !== null && <button type="button" onClick={resetForm}>{t("common.cancel")}</button>}
        </div>
        <p className="hint">{t("products.slugHint")}</p>
      </form>

      {products.length === 0 ? (
        <p className="dashboard-empty">{t("products.noProducts")}</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>{t("products.name")}</th>
              <th>{t("products.slug")}</th>
              <th>{t("products.price")}</th>
              <th>{t("products.cycles")}</th>
              <th>{t("products.status")}</th>
              <th>{t("products.webhook")}</th>
              <th>{t("products.licenseCount")}</th>
              <th>{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className={selectedId === p.id ? "selected-row" : ""}>
                <td>{p.name}</td>
                <td>{p.slug}</td>
                <td>{p.price} {p.currency}</td>
                <td>{(p.billing_cycles || []).map((c) => <span key={c} className="badge">{t(`cycle.${c}`)}</span>)}</td>
                <td>{p.status === "active" ? t("common.active") : t("common.inactive")}</td>
                <td>{p.webhook_url ? t("products.webhookConfigured") : t("products.notConfigured")}</td>
                <td>{p.license_count ?? "-"}</td>
                <td>
                  <button className="view-btn" onClick={() => setSelectedId(p.id)}>{t("common.view")}</button>{" "}
                  <button className="edit-btn" onClick={() => handleEdit(p)}>{t("common.edit")}</button>{" "}
                  {p.webhook_url && <button onClick={() => handleTestWebhook(p.id)}>{t("products.testWebhook")}</button>}{" "}
                  <Link to={`/licenses?product=${p.id}`}>{t("products.viewLicenses")}</Link>{" "}
                  <button className="delete-btn" onClick={() => handleDelete(p.id)}>{t("common.delete")}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {testResult && (
        <p className="validate-result">
          {t("products.testResult")}: {testResult.success ? `${t("common.success")} (HTTP ${testResult.status_code})` : (testResult.error || t("common.error"))}
        </p>
      )}

      {selectedId && (
        <div className="dashboard-section">
          <h2>{t("products.deliveries")}</h2>
          {deliveries.length === 0 ? (
            <p className="dashboard-empty">{t("products.noDeliveries")}</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t("products.event")}</th>
                  <th>{t("products.url")}</th>
                  <th>{t("products.response")}</th>
                  <th>{t("products.deliveredAt")}</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id}>
                    <td>{d.event}</td>
                    <td>{d.url}</td>
                    <td>{d.success ? `HTTP ${d.status_code}` : `HTTP ${d.status_code ?? "-"}`}</td>
                    <td>{d.created_at}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default Products;
