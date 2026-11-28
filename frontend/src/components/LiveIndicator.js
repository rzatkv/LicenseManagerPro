import React from "react";
import {useLanguage} from "../i18n";
import "./LiveIndicator.css";

// Live indicator (v3.0.11): pulsing green dot + «زنده» + last-updated
// time, so the user can SEE the page is live. `lastUpdated` is a Date
// (or null before the first successful load).
export default function LiveIndicator({lastUpdated}) {
  const {t, lang} = useLanguage();
  const time = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString(lang === "fa" ? "fa-IR" : "en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : null;
  return (
    <span className="live-indicator" data-live-indicator title={t("common.live")}>
      <span className="live-dot" aria-hidden="true" />
      <span>{t("common.live")}</span>
      {time ? (
        <span className="live-updated">
          {t("common.lastUpdated")} {time}
        </span>
      ) : null}
    </span>
  );
}
