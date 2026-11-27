import React from "react";
import {useLanguage} from "../i18n";

/** Page-size options for the live selector (v3.0.9). 5 is the phone
 * default and 20 the Languages keys-list default, so both appear. */
export const PAGE_SIZE_OPTIONS = [5, 10, 20, 25, 50, 100];

/** The numbered window: first page + last page always shown, the
 * current page ±1 in between, ellipsis where pages are skipped.
 * 7 or fewer pages show every number (no ellipsis). */
export function paginationItems(page, totalPages) {
    if (totalPages <= 7) return Array.from({length: totalPages}, (_, i) => i + 1);
    const items = [1];
    if (page > 3) items.push("…");
    for (let p = Math.max(2, page - 1); p <= Math.min(totalPages - 1, page + 1); p++) items.push(p);
    if (page < totalPages - 2) items.push("…");
    items.push(totalPages);
    return items;
}

/** Proper pager (v3.0.9): first + prev + numbered window + ellipsis +
 * last + next — every button works and navigates. The old pager only
 * rendered a current±2 window (no first/last, no ellipsis), and on
 * phones CSS hid every non-active number, so the user could not see
 * or reach other pages. The window is now current±1 with the first
 * and last page always shown; on phones the first/last BUTTONS hide
 * (the 1 / last numbers ARE those targets) and the buttons shrink,
 * so the compact pager still fits 360px.
 * The optional page-size selector changes the size live and resets to
 * page 1 (callers reset on pageSize change). */
export default function Pagination({page, total, pageSize = 10, onPageChange, onPageSizeChange}) {
  const {t} = useLanguage();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const items = paginationItems(page, totalPages);
  return (
    <div className="pagination">
      <span className="pagination-info">
        {t("common.showing")} {from}–{to} {t("common.of")} {total} {t("common.results")}
      </span>
      <div className="pagination-pages" role="navigation" aria-label={t("common.pagination")}>
        <button type="button" className="pagination-nav pagination-first" aria-label={t("common.firstPage")} disabled={page <= 1} onClick={() => onPageChange(1)}>«</button>
        <button type="button" className="pagination-nav pagination-prev" aria-label={t("common.previous")} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>‹</button>
        {items.map((it, i) => it === "…" ? (
          <span key={`ellipsis-${i}`} className="pagination-ellipsis" aria-hidden="true">…</span>
        ) : (
          <button key={it} type="button" className={`pagination-page${it === page ? " active" : ""}`} aria-current={it === page ? "page" : undefined} onClick={() => onPageChange(it)}>{it}</button>
        ))}
        <button type="button" className="pagination-nav pagination-next" aria-label={t("common.next")} disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>›</button>
        <button type="button" className="pagination-nav pagination-last" aria-label={t("common.lastPage")} disabled={page >= totalPages} onClick={() => onPageChange(totalPages)}>»</button>
      </div>
      {onPageSizeChange && (
        <label className="pagination-size">
          <span>{t("common.perPage")}</span>
          <select value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))} aria-label={t("common.perPage")}>
            {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      )}
    </div>
  );
}
