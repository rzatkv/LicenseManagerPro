import React, {useState, useEffect, useCallback} from "react";
import {getList} from "../utils/api";
import {formatDateTime} from "../utils/format";
import {useLanguage} from "../i18n";
import {useToast} from "../components/Toast";
import Pagination from "../components/Pagination";
import EmptyState from "../components/EmptyState";
import {TableSkeleton} from "../components/Skeleton";
import "../styles/AuditLogs.css";

const PAGE_SIZE = 10;
const ENTITIES = ["license", "product", "user", "api_key", "setting"];

function AuditLogs() {
  const {t, lang} = useLanguage();
  const {toast} = useToast();
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState("");
  const [actor, setActor] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [sort, setSort] = useState("newest");
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const qs = entity ? `?entity=${encodeURIComponent(entity)}` : "";
      const {items, total: t} = await getList(`/audit-logs${qs}`, {
        skip: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
      });
      setLogs(items);
      setTotal(t);
    } catch (err) {
      if (err.status === 403) toast.error(t("errors.forbidden"));
      else toast.error(err.message || t("common.failedFetch"));
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, entity, toast, t]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

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
    setPage(1);
  };

  return (
    <div className="audit-logs-container page-enter">
      <h1 className="gradient-text">{t("audit.title")}</h1>

      <div className="toolbar">
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
                  <td className="audit-details">{log.details ? JSON.stringify(log.details) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}

export default AuditLogs;
