import React from "react";

/** Styled empty state with a small inline SVG illustration + action button. */
export default function EmptyState({title, text, actionLabel, onAction}) {
  return (
    <div className="empty-state">
      <svg width="72" height="72" viewBox="0 0 72 72" fill="none" aria-hidden="true">
        <defs>
          <linearGradient id="es-grad" x1="0" y1="0" x2="72" y2="72">
            <stop offset="0%" className="es-stop-1" />
            <stop offset="45%" className="es-stop-2" />
            <stop offset="75%" className="es-stop-3" />
            <stop offset="100%" className="es-stop-4" />
          </linearGradient>
        </defs>
        <circle cx="36" cy="36" r="32" fill="url(#es-grad)" opacity="0.14" />
        <rect x="20" y="24" width="32" height="26" rx="6" fill="url(#es-grad)" opacity="0.55" />
        <rect x="26" y="30" width="20" height="3" rx="1.5" className="es-line" opacity="0.9" />
        <rect x="26" y="37" width="14" height="3" rx="1.5" className="es-line" opacity="0.7" />
        <circle cx="47" cy="47" r="7" fill="url(#es-grad)" />
        <path d="M44.5 47h5M47 44.5v5" className="es-stroke" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {actionLabel && onAction && <button onClick={onAction}>{actionLabel}</button>}
    </div>
  );
}
