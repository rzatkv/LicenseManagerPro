import React, {useState, useEffect, useCallback} from "react";
import {get, put, del} from "../utils/api";
import {useLanguage} from "../i18n";
import {useToast} from "../components/Toast";
import ConfirmModal from "../components/ConfirmModal";
import {en as enDict, fa as faDict, SECTIONS} from "../i18n/translations";
import "../styles/Languages.css";

const ALL_KEYS = Object.keys(enDict);

function Languages() {
  const {t, fetchLanguages} = useLanguage();
  const {toast} = useToast();
  const [languages, setLanguages] = useState([]);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [selectedCode, setSelectedCode] = useState(null);
  const [selectedName, setSelectedName] = useState("");
  const [isBuiltin, setIsBuiltin] = useState(false);
  const [values, setValues] = useState({});
  const [search, setSearch] = useState("");
  const [section, setSection] = useState("all");
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");

  const fetchList = useCallback(async () => {
    try {
      const data = await get("/languages");
      setLanguages(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(err.message || t("common.failedFetch"));
    }
  }, [t, toast]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const openEditor = async (lang) => {
    try {
      const full = await get(`/languages/${lang.code}`);
      const builtin = lang.code === "en" || lang.code === "fa";
      setSelectedCode(lang.code);
      setSelectedName(lang.name);
      setIsBuiltin(builtin);
      // Built-ins show the shipped dictionary (read-only); custom ones
      // show their stored translations over the English defaults.
      const dict = lang.code === "fa" ? faDict : enDict;
      const merged = {};
      for (const key of ALL_KEYS) {
        merged[key] = (full.translations && full.translations[key] !== undefined)
          ? full.translations[key]
          : (dict[key] !== undefined ? dict[key] : "");
      }
      setValues(merged);
    } catch (err) {
      toast.error(err.message || t("common.failedFetch"));
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    const code = newCode.trim().toLowerCase();
    if (!code || !newName.trim()) return;
    try {
      // PUT upserts: clones the English values as the starting point.
      await put(`/languages/${code}`, {name: newName.trim(), translations: {...enDict}});
      setLanguages([...languages, {code, name: newName.trim()}]);
      setNewCode("");
      setNewName("");
      toast.success(t("languages.keysCloned"));
      await fetchLanguages();
    } catch (err) {
      toast.error(err.message || t("common.error"));
    }
  };

  const handleSave = async () => {
    if (!selectedCode || isBuiltin) return;
    try {
      await put(`/languages/${selectedCode}`, {name: selectedName, translations: values});
      toast.success(t("languages.saved"));
      await fetchLanguages();
    } catch (err) {
      toast.error(err.message || t("common.error"));
    }
  };

  const handleDelete = async (code) => {
    if (code === "en" || code === "fa") {
      toast.error(t("languages.cannotDeleteBuiltin"));
      return;
    }
    try {
      await del(`/languages/${code}`);
      setLanguages(languages.filter((l) => l.code !== code));
      if (selectedCode === code) { setSelectedCode(null); setValues({}); }
      toast.success(t("languages.deleted"));
      await fetchLanguages();
    } catch (err) {
      toast.error(err.message || t("common.error"));
    }
  };

  const filteredKeys = ALL_KEYS.filter((key) => {
    if (section !== "all" && !key.startsWith(`${section}.`)) return false;
    if (search && !key.toLowerCase().includes(search.toLowerCase()) && !(values[key] || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const grouped = {};
  for (const key of filteredKeys) {
    const sec = key.split(".")[0];
    if (!grouped[sec]) grouped[sec] = [];
    grouped[sec].push(key);
  }

  return (
    <div className="languages-container page-enter">
      <h1 className="gradient-text">{t("languages.title")}</h1>

      <form className="add-language-form" onSubmit={handleAdd}>
        <h3>{t("languages.add")}</h3>
        <input type="text" placeholder={t("languages.codePlaceholder")} value={newCode} onChange={(e) => setNewCode(e.target.value)} required />
        <input type="text" placeholder={t("languages.namePlaceholder")} value={newName} onChange={(e) => setNewName(e.target.value)} required />
        <button type="submit">{t("languages.add")}</button>
      </form>

      <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{t("languages.code")}</th>
            <th>{t("languages.name")}</th>
            <th>{t("common.status")}</th>
            <th>{t("common.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {languages.map((lang) => (
            <tr key={lang.code}>
              <td>{lang.code}</td>
              <td>{lang.name}</td>
              <td>{lang.code === "en" || lang.code === "fa" ? t("languages.builtin") : t("languages.custom")}</td>
              <td>
                <button className="view-btn" onClick={() => openEditor(lang)}>{t("common.edit")}</button>{" "}
                {lang.code !== "en" && lang.code !== "fa" && (
                  <button className="delete-btn" onClick={() => setPendingDelete(lang.code)}>{t("common.delete")}</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {selectedCode ? (
        <div className="lang-editor">
          <h2>{t("languages.editor")} — {selectedName} ({selectedCode})</h2>
          {isBuiltin && <p className="hint">{t("languages.cannotDeleteBuiltin")}</p>}
          <div className="lang-editor-tools">
            <input type="text" placeholder={t("languages.searchKeys")} value={search} onChange={(e) => setSearch(e.target.value)} />
            <select value={section} onChange={(e) => setSection(e.target.value)}>
              <option value="all">{t("languages.section")}: {t("common.all")}</option>
              {SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {Object.keys(grouped).map((sec) => (
            <div key={sec} className="lang-section">
              <h3>{sec}</h3>
              {grouped[sec].map((key) => (
                <div key={key} className="lang-key-row">
                  <label title={key}>{key}</label>
                  <input
                    type="text"
                    value={values[key] || ""}
                    disabled={isBuiltin}
                    onChange={(e) => setValues({...values, [key]: e.target.value})}
                  />
                </div>
              ))}
            </div>
          ))}
          {!isBuiltin && <button onClick={handleSave}>{t("languages.save")}</button>}
        </div>
      ) : (
        <p className="dashboard-empty">{t("languages.selectLanguage")}</p>
      )}
      <ConfirmModal
        open={pendingDelete !== null}
        message={t("common.confirmDelete")}
        onConfirm={() => { const code = pendingDelete; setPendingDelete(null); handleDelete(code); }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

export default Languages;
