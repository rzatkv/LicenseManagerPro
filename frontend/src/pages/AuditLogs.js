import React, {useState, useEffect, useCallback} from "react";
import {getList} from "../utils/api";
import {useLanguage} from "../i18n";
import {useToast} from "../components/Toast";
import Pagination from "../components/Pagination";
import EmptyState from "../components/EmptyState";
import {TableSkeleton} from "../components/Skeleton";
import "../styles/AuditLogs.css";

const PAGE_SIZE = 10;
const ENTITIES = ["license", "product", "user", "api_key", "setting"];

function AuditLogs() {
  const {t} = useLanguage();
  const {toast} = useToast();
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState("");
  const [actor, setActor] = useState("");
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

  const filtered = logs.filter((log) => {
    if (!actor.trim()) return true;
    const q = actor.trim().toLowerCase();
    return (log.actor_email || "").toLowerCase().includes(q)
      || (log.action || "").toLowerCase().includes(q);
  });

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
      </div>

      {loading ? (
        <TableSkeleton rows={5} />
      ) : filtered.length === 0 ? (
        <EmptyState title={t("audit.noLogs")} text={t("common.noResults")} />
      ) : (
        <>
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
                  <td>{log.created_at ? new Date(log.created_at).toLocaleString() : "-"}</td>
                  <td>{log.actor_email}</td>
                  <td><span className="badge badge-accent">{log.action}</span></td>
                  <td>{entityLabel(log.entity)}</td>
                  <td>{log.entity_id ?? "-"}</td>
                  <td className="audit-details">{log.details ? JSON.stringify(log.details) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} total={total} pageSize={PAGE_SIZE} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}

export default AuditLogs;
