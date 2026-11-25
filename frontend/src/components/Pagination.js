import React from "react";
import {useLanguage} from "../i18n";

/** Prev/next + page numbers, page size is fixed at 10 by the callers. */
export default function Pagination({page, total, pageSize = 10, onPageChange}) {
  const {t} = useLanguage();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  // Windowed page numbers: current ± 2, clamped.
  const pages = [];
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  for (let p = start; p <= end; p++) pages.push(p);

  return (
    <div className="pagination">
      <span className="pagination-info">
        {t("common.showing")} {from}–{to} {t("common.of")} {total} {t("common.results")}
      </span>
      <button disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
        {t("common.previous")}
      </button>
      {pages.map((p) => (
        <button key={p} className={`pagination-page${p === page ? " active" : ""}`} onClick={() => onPageChange(p)}>
          {p}
        </button>
      ))}
      <button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
        {t("common.next")}
      </button>
    </div>
  );
}
