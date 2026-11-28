import React, {useState, useEffect} from "react";
import {get, put, del} from "../utils/api";
import {useLanguage} from "../i18n";
import {useToast} from "../components/Toast";
import {useListFetch} from "../utils/useListFetch";
import {useLiveRefresh} from "../utils/useLiveRefresh";
import LiveIndicator from "../components/LiveIndicator";
import {usePageSize} from "../utils/responsive";
import ConfirmModal from "../components/ConfirmModal";
import Modal from "../components/Modal";
import Pagination from "../components/Pagination";
import TabDropdown from "../components/TabDropdown";
import {en as enDict, fa as faDict, SECTIONS} from "../i18n/translations";
import "../styles/Languages.css";

const ALL_KEYS = Object.keys(enDict);

/** Language management (v3.0): lives as its own tab inside Settings
 * (Settings → Languages). The standalone /languages route redirects
 * there. The add-language form opens in an animated popup, and the
 * editor shows ONE section at a time (dropdown, default first
 * section) with paginated keys — the full key list would force the
 * page to scroll. */
export function LanguagesPanel() {
  const {t, fetchLanguages} = useLanguage();
  const {toast} = useToast();
  const [languages, setLanguages] = useState([]);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [selectedCode, setSelectedCode] = useState(null);
  const [selectedName, setSelectedName] = useState("");
  const [isBuiltin, setIsBuiltin] = useState(false);
  const [values, setValues] = useState({});
  const [search, setSearch] = useState("");
  const [section, setSection] = useState(SECTIONS[0]);
  const [keyPage, setKeyPage] = useState(1);
  // v3.0.9: the keys list has the same live page-size selector as the
  // other paginated lists — default 20 (the old fixed KEYS_PER_PAGE),
  // the user's choice persists per list. Changing the size resets to
  // page 1, like search/section changes above.
  const [keysPerPage, setKeysPerPage] = usePageSize("languages-keys", 20);
  useEffect(() => { setKeyPage(1); }, [keysPerPage]);
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  // v3.0.6: shared list fetch (toast on error; this page has no loading
  // state — the list simply renders when it arrives).
  const {reload: fetchList, reloadQuiet: fetchListQuiet, lastUpdated} = useListFetch(
    async () => get("/languages"),
    [],
    {onData: (data) => setLanguages(Array.isArray(data) ? data : [])},
  );

  // Live auto-refresh (v3.0.11): quiet 60s tick, pauses when hidden.
  useLiveRefresh(fetchListQuiet);

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
      setKeyPage(1);
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
      setAddOpen(false);
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
    if (!key.startsWith(`${section}.`)) return false;
    if (search && !key.toLowerCase().includes(search.toLowerCase()) && !(values[key] || "").toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const pageKeys = filteredKeys.slice((keyPage - 1) * keysPerPage, keyPage * keysPerPage);

  return (
    <div className="languages-panel">
      <div className="toolbar">
        <LiveIndicator lastUpdated={lastUpdated} />
        <button type="button" onClick={() => setAddOpen(true)}>{t("languages.add")}</button>
      </div>

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

      {!selectedCode && (
        <p className="dashboard-empty">{t("languages.selectLanguage")}</p>
      )}
      <Modal open={!!selectedCode} wide title={selectedCode ? `${t("languages.editor")} — ${selectedName} (${selectedCode})` : ""} onClose={() => { setSelectedCode(null); setSelectedName(""); }}>
      {selectedCode && (
        <div className="lang-editor">
          {isBuiltin && <p className="hint">{t("languages.cannotDeleteBuiltin")}</p>}
          <div className="lang-editor-tools">
            <input type="text" placeholder={t("languages.searchKeys")} value={search} onChange={(e) => { setSearch(e.target.value); setKeyPage(1); }} />
          </div>
                                        <TabDropdown
                      ariaLabel={t("languages.section")}
                      value={section}
                      onChange={(s) => { setSection(s); setKeyPage(1); }}
                      options={SECTIONS.map((s) => ({value: s, label: s}))}
                    />
          <div className="lang-section">
            <h3>{section}</h3>
            {pageKeys.map((key) => (
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
          <Pagination page={keyPage} total={filteredKeys.length} pageSize={keysPerPage} onPageChange={setKeyPage} onPageSizeChange={setKeysPerPage} />
          {!isBuiltin && <button onClick={handleSave}>{t("languages.save")}</button>}
        </div>
      )}
      </Modal>
      <Modal open={addOpen} title={t("languages.add")} onClose={() => setAddOpen(false)}>
        <form className="add-language-form" onSubmit={handleAdd}>
          <input type="text" placeholder={t("languages.codePlaceholder")} value={newCode} onChange={(e) => setNewCode(e.target.value)} required />
          <input type="text" placeholder={t("languages.namePlaceholder")} value={newName} onChange={(e) => setNewName(e.target.value)} required />
          <button type="submit">{t("languages.add")}</button>
        </form>
      </Modal>
      <ConfirmModal
        open={pendingDelete !== null}
        message={t("common.confirmDelete")}
        onConfirm={() => { const code = pendingDelete; setPendingDelete(null); handleDelete(code); }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function Languages() {
  const {t} = useLanguage();
  return (
    <div className="languages-container page-enter">
      <h1 className="gradient-text">{t("languages.title")}</h1>
      <LanguagesPanel />
    </div>
  );
}

export default Languages;
