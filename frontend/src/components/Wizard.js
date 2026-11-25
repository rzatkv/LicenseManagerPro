import React from "react";
import {useLanguage} from "../i18n";
import "./Wizard.css";

/**
 * Shared multi-step wizard shell (v2.2).
 *
 * The parent owns the step state and the per-step form state; the Wizard
 * renders the step indicator, the current step's content, and Back / Next /
 * Create navigation. `canNext` gates the Next button (per-step validation
 * lives in the parent). When `success` is set, the body is replaced by the
 * success state (e.g. the generated API key, shown once).
 */
function Wizard({
    title,
    steps,
    step,
    onStepChange,
    canNext = true,
    onSubmit,
    submitLabel,
    onCancel,
    submitting = false,
    success = null,
    children,
}) {
    const {t} = useLanguage();
    const last = step >= steps.length - 1;

    const handleNext = () => {
        if (last) {
            if (onSubmit) onSubmit();
        } else {
            onStepChange(step + 1);
        }
    };

    return (
        <div className="wizard glass-card">
            {title && <h3 className="wizard-title">{title}</h3>}
            <ol className="wizard-steps" aria-label={`${t("wizard.step")} ${step + 1} ${t("wizard.of")} ${steps.length}`}>
                {steps.map((label, i) => (
                    <li
                        key={label}
                        className={`wizard-step${i === step ? " current" : ""}${i < step ? " done" : ""}`}
                        aria-current={i === step ? "step" : undefined}
                    >
                        <button
                            type="button"
                            className="wizard-step-btn"
                            disabled={i > step}
                            onClick={() => onStepChange(i)}
                        >
                            <span className="wizard-step-dot">{i < step ? "✓" : i + 1}</span>
                            <span className="wizard-step-label">{label}</span>
                        </button>
                    </li>
                ))}
            </ol>
            {success ? (
                <div className="wizard-success">{success}</div>
            ) : (
                <div className="wizard-body">{children}</div>
            )}
            {!success && (
                <div className="wizard-nav">
                    <button type="button" className="btn-ghost" onClick={onCancel}>
                        {t("common.cancel")}
                    </button>
                    <span className="wizard-spacer" />
                    {step > 0 && (
                        <button type="button" className="btn-ghost" onClick={() => onStepChange(step - 1)}>
                            {t("common.back")}
                        </button>
                    )}
                    <button type="button" onClick={handleNext} disabled={!canNext || submitting}>
                        {submitting ? t("common.loading") : last ? (submitLabel || t("wizard.create")) : t("common.next")}
                    </button>
                </div>
            )}
        </div>
    );
}

export default Wizard;
