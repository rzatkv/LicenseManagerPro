import React, {useState, useEffect} from "react";
import {getList, del} from "../utils/api";
import {formatDateTime} from "../utils/format";
import {useLanguage} from "../i18n";
import {useToast} from "../components/Toast";
import {useListFetch} from "../utils/useListFetch";
import ConfirmModal from "../components/ConfirmModal";
import Modal from "../components/Modal";
import Pagination from "../components/Pagination";
import {usePageSize} from "../utils/responsive";
import EmptyState from "../components/EmptyState";
import TabDropdown from "../components/TabDropdown";
import {List, Mail, MessageSquare, Send, KeyRound, Server} from "lucide-react";
import {TableSkeleton} from "../components/Skeleton";
import "../styles/AuditLogs.css";

// Row-action icons (same set as Products/LicenseList): 32px icon buttons;
// at ≤640px only the eye stays in the row (global .row-action-extra
// rule), delete lives in the details popup.
const ICONS = {
  view: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  delete: <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>,
};

const ENTITIES = ["license", "product", "user", "api_key", "setting"];
// Per-channel log streams (v3.0): the audit trail carries notify.*,
// twofa.* and service_status.* rows; the backend filters them with
// ?channel=. No new menu — the streams live as tabs inside Logs.
const CHANNELS = ["all", "email", "sms", "telegram", "twofa", "system"];
const CHANNEL_ICONS = {
  all: <List size={16} />,
  email: <Mail size={16} />,
  sms: <MessageSquare size={16} />,
  telegram: <Send size={16} />,
  twofa: <KeyRound size={16} />,
  system: <Server size={16} />,
};

function AuditLogs() {
  const {t, lang} = useLanguage();
  const {toast} = useToast();
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = usePageSize("audit-logs");
    // Breakpoint change resets to page 1 (the fetch refetches via its
    // pageSize dep below).
    useEffect(() => { setPage(1); }, [pageSize]);
  const [entity, setEntity] = useState("");
  const [actor, setActor] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [sort, setSort] = useState("newest");
  const [channel, setChannel] = useState("all");
  // `loading` comes from useListFetch below (it owns the fetch state).
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleteAllOpen, setDeleteAllOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  // v3.0.6: shared list fetch. The 403 case keeps its exact UX
  // (errors.forbidden instead of the raw message), so it runs silent
  // with a reproducing onError.
  const {loading, reload: fetchLogs} = useListFetch(
    async () => {
      const params = new URLSearchParams();
      if (entity) params.set("entity", entity);
      if (channel && channel !== "all") params.set("channel", channel);
      const qs = params.toString() ? `?${params.toString()}` : "";
      return getList(`/audit-logs${qs}`, {skip: (page - 1) * pageSize, limit: pageSize});
    },
    [page, pageSize, entity, channel, toast, t],
    {
      silent: true,
      onData: ({items, total: t}) => { setLogs(items); setTotal(t); },
      onError: (err) => {
        if (err.status === 403) toast.error(t("errors.forbidden"));
        else toast.error(err.message || t("common.failedFetch"));
        setLogs([]);
        setTotal(0);
      },
    },
  );

  const handleDelete = async (id) => {
    try {
      await del(`/audit-logs/${id}`);
      setLogs((prev) => prev.filter((log) => log.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
      toast.success(t("audit.deleted"));
    } catch (err) {
      toast.error(err.message || t("common.error"));
    }
  };

  const handleDeleteAll = async () => {
    try {
      await del("/audit-logs");
      setLogs([]);
      setTotal(0);
      setPage(1);
      toast.success(t("audit.allDeleted"));
    } catch (err) {
      toast.error(err.message || t("common.error"));
    }
  };

  const entityLabel = (e) => {
    const key = {
      license: "audit.entityLicense",
      product: "audit.entityProduct",
      user: "audit.entityUser",
      api_key: "audit.entityApiKey",
      setting: "audit.entitySetting",
    }[e];
    return key ? t(key) : e;
  };

  // Distinct action values from the loaded logs (e.g. license.create,
  // user.login) — shown raw, same convention as the action badges below.
  // The entity filter above is server-side; the action filter and sort
  // here are client-side over the loaded page, which works in demo mode
  // as-is (the demo mock has no server-side action filter).
  const actions = [...new Set(logs.map((log) => log.action).filter(Boolean))].sort();
  const filtersActive = entity !== "" || actor.trim() !== "" || actionFilter !== "" || sort !== "newest";
  const filtered = logs
    .filter((log) => {
      if (actor.trim()) {
        const q = actor.trim().toLowerCase();
        if (!(log.actor_email || "").toLowerCase().includes(q)
          && !(log.action || "").toLowerCase().includes(q)) return false;
      }
      if (actionFilter && log.action !== actionFilter) return false;
      return true;
    })
    .sort((a, b) => {
      const ta = new Date(a.created_at || 0).getTime();
      const tb = new Date(b.created_at || 0).getTime();
      return sort === "oldest" ? ta - tb : tb - ta;
    });

  const clearFilters = () => {
    setEntity("");
    setActor("");
    setActionFilter("");
    setSort("newest");
    setChannel("all");
    setPage(1);
  };

  return (
    <div className="audit-logs-container page-enter">
      <h1 className="gradient-text">{t("audit.title")}</h1>

                        <TabDropdown
              ariaLabel={t("audit.title")}
              value={channel}
              onChange={(ch) => { setChannel(ch); setPage(1); }}
              options={CHANNELS.map((ch) => ({value: ch, label: t(`audit.channel.${ch}`), icon: CHANNEL_ICONS[ch]}))}
            />

      <div className="toolbar">
        <button type="button" className="btn-danger" onClick={() => setDeleteAllOpen(true)}>{t("audit.deleteAll")}</button>
        <label htmlFor="audit-entity">{t("audit.filterEntity")}:</label>
        <select
          id="audit-entity"
          value={entity}
          onChange={(e) => { setEntity(e.target.value); setPage(1); }}
        >
          <option value="">{t("audit.allEntities")}</option>
          {ENTITIES.map((e) => (
            <option key={e} value={e}>{entityLabel(e)}</option>
          ))}
        </select>
        <div className="search-wrap">
          <span className="search-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          </span>
          <input
            type="text"
            className="search-input"
            placeholder={t("audit.searchPlaceholder")}
            value={actor}
            onChange={(e) => setActor(e.target.value)}
          />
        </div>
        <div className="filter-container">
          <label htmlFor="audit-action">{t("audit.action")}:</label>
          <select
            id="audit-action"
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          >
            <option value="">{t("common.all")}</option>
            {actions.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div className="filter-container">
          <label htmlFor="audit-sort">{t("common.createdAt")}:</label>
          <select id="audit-sort" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="newest">↓</option>
            <option value="oldest">↑</option>
          </select>
        </div>
        {filtersActive && (
          <button type="button" className="btn-ghost" onClick={clearFilters}>{t("filters.clearAll")}</button>
        )}
      </div>

      {loading ? (
        <TableSkeleton rows={5} />
      ) : filtered.length === 0 ? (
        <EmptyState title={t("audit.noLogs")} text={t("common.noResults")} />
      ) : (
        <>
          <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t("audit.time")}</th>
                <th>{t("audit.actor")}</th>
                <th>{t("audit.action")}</th>
                <th>{t("audit.entity")}</th>
                <th>{t("audit.entityId")}</th>
                <th>{t("audit.details")}</th>
                <th>{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((log, i) => (
                <tr key={log.id} className="stagger-item" style={{animationDelay: `${i * 40}ms`}}>
                  <td className="nowrap">{log.created_at ? formatDateTime(log.created_at, lang) : "-"}</td>
                  <td>{log.actor_email}</td>
                  <td><span className="badge badge-accent">{log.action}</span></td>
                  <td>{entityLabel(log.entity)}</td>
                  <td>{log.entity_id ?? "-"}</td>
                  <td><button type="button" className="btn-ghost" onClick={() => setSelected(log)}>{t("common.view")}</button></td>
                  <td>
                    <div className="row-actions">
                      <button className="view-btn icon-btn" title={t("common.view")} aria-label={t("common.view")} onClick={() => setSelected(log)}>{ICONS.view}</button>
                      <button className="delete-btn icon-btn row-action-extra" title={t("common.delete")} aria-label={t("common.delete")} onClick={() => setPendingDelete(log.id)}>{ICONS.delete}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <Pagination page={page} total={total} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
        </>
      )}
      <Modal open={!!selected} title={selected ? `${t("audit.details")} #${selected.id}` : ""} onClose={() => setSelected(null)}>
        {selected && (<>
          <p><strong>{t("audit.time")}:</strong> {selected.created_at ? formatDateTime(selected.created_at, lang) : "-"}</p>
          <p><strong>{t("audit.actor")}:</strong> {selected.actor_email}</p>
          <p><strong>{t("audit.action")}:</strong> {selected.action}</p>
          <p><strong>{t("audit.entity")}:</strong> {entityLabel(selected.entity)}</p>
          <p><strong>{t("audit.entityId")}:</strong> {selected.entity_id ?? "-"}</p>
          <h4>{t("audit.details")}</h4>
          <pre className="audit-details-pre">{selected.details ? JSON.stringify(selected.details, null, 2) : "-"}</pre>
          <div className="row-actions modal-actions">
            <button className="btn-danger" onClick={() => { const id = selected.id; setSelected(null); setPendingDelete(id); }}>{t("common.delete")}</button>
          </div>
        </>)}
      </Modal>
      <ConfirmModal
        open={pendingDelete !== null}
        message={t("audit.deleteConfirm")}
        onConfirm={() => { const id = pendingDelete; setPendingDelete(null); handleDelete(id); }}
        onCancel={() => setPendingDelete(null)}
      />
      <ConfirmModal
        open={deleteAllOpen}
        message={t("audit.deleteAllConfirm")}
        onConfirm={() => { setDeleteAllOpen(false); handleDeleteAll(); }}
        onCancel={() => setDeleteAllOpen(false)}
      />
    </div>
  );
}

export default AuditLogs;
