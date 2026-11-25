import React, {useState} from "react";
import {useLanguage} from "../i18n";

/** Copy a value (license key, API key, webhook URL) with "Copied" feedback. */
export default function CopyButton({text, label}) {
  const {t} = useLanguage();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const value = String(text ?? "");
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const ta = document.createElement("textarea");
        ta.value = value;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      // Clipboard unavailable (e.g. non-secure context): silently ignore.
    }
  };

  return (
    <button type="button" className={`copy-btn${copied ? " copied" : ""}`} onClick={handleCopy}>
      {copied ? t("common.copied") : (label || "⧉")}
    </button>
  );
}
