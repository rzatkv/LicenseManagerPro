import React from "react";
import "./ChipSelect.css";

/** Chip / pill multi-select (v2.3). Replaces every checkbox group in the
 * app (product wizard billing cycles + webhook events, API-key access
 * rights, role permission checklist, …).
 *
 * Each option is a tappable rounded pill: unselected = outlined chip with
 * muted text; selected = theme gradient fill + white text + a ✓ mark.
 * This kills the RTL character-stacking bug BY CONSTRUCTION: chips are
 * flex items that size to their content and wrap as whole units — the
 * label has white-space: nowrap and the container flex-wrap: wrap, so a
 * label can never break mid-word or stack character by character, and a
 * long label (e.g. license.validated_failed) just grows to fit on one
 * line and wraps to the next row as a whole.
 *
 * Props:
 *   options: [{value, label}] or plain strings (label = value)
 *   selected: array of values
 *   onToggle: (value) => void
 *   ariaLabel: accessible group label
 */
function ChipSelect({options = [], selected = [], onToggle, ariaLabel}) {
  const normalized = options.map((o) =>
    typeof o === "string" ? {value: o, label: o} : o
  );
  return (
    <div className="chip-select" role="group" aria-label={ariaLabel}>
      {normalized.map(({value, label}) => {
        const isSelected = selected.includes(value);
        return (
          <button
            key={value}
            type="button"
            className={`chip${isSelected ? " chip-selected" : ""}`}
            aria-pressed={isSelected}
            onClick={() => onToggle(value)}
          >
            <span className="chip-check" aria-hidden="true">✓</span>
            <span className="chip-label">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default ChipSelect;
