import React, {useState} from "react";
import {Copy, Check} from "lucide-react";
import {useLanguage} from "../i18n";

/** Copy a value (license key, API key, webhook URL, code sample) with
 * "Copied" feedback (v3.0.4: lucide icons instead of the ⧉ glyph). */
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
      {copied ? (<><Check size={14} />{t("common.copied")}</>) : label ? (<><Copy size={14} />{label}</>) : (<Copy size={14} />)}
    </button>
  );
}
