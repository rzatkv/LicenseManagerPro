import React from "react";

/** Shimmer skeleton shown while data loads (replaces bare "Loading..."). */
export function Skeleton({lines = 3, height = 16, style}) {
  return (
    <div aria-hidden="true" style={style}>
      {Array.from({length: lines}).map((_, i) => (
        <div key={i} className="skeleton skeleton-line" style={{height, width: `${92 - i * 7}%`}} />
      ))}
    </div>
  );
}

export function SkeletonCard({lines = 3}) {
  return (
    <div className="glass-card skeleton-card" aria-hidden="true">
      <Skeleton lines={lines} />
    </div>
  );
}

export function TableSkeleton({rows = 5}) {
  return (
    <div aria-hidden="true">
      {Array.from({length: rows}).map((_, i) => (
        <div key={i} className="skeleton skeleton-table-row" style={{opacity: 1 - i * 0.12}} />
      ))}
    </div>
  );
}

export default Skeleton;
