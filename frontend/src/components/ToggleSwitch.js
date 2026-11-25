import React from "react";
import "./ToggleSwitch.css";

/** Styled on/off toggle switch (v2.3). Used for single boolean settings
 * where a checkbox list would be wrong — e.g. API-key "single use",
 * license-security lock toggles. A real <button role="switch">, keyboard
 * accessible (Space/Enter), no checkbox input involved. */
function ToggleSwitch({checked, onChange, label, ariaLabel, hint}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={!!checked}
      aria-label={ariaLabel || label}
      className={`toggle-switch${checked ? " toggle-switch-on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-switch-track" aria-hidden="true">
        <span className="toggle-switch-knob" />
      </span>
      <span className="toggle-switch-text">
        {label && <span className="toggle-switch-label">{label}</span>}
        {hint && <span className="toggle-switch-hint">{hint}</span>}
      </span>
    </button>
  );
}

export default ToggleSwitch;
