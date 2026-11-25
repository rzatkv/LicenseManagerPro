// Locale-aware date formatting for table cells and chart labels.
// The backend stores ISO timestamps; the UI must never show them raw.
// fa -> "fa-IR" (Persian digits and month names), everything else -> "en-US".

export function localeFor(lang) {
    return lang === "fa" ? "fa-IR" : "en-US";
}

function parseDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

// Short date, e.g. "Nov 25, 2026" / "۴ آذر ۱۴۰۵".
export function formatDate(value, lang) {
    const d = parseDate(value);
    if (!d) return value ? String(value) : "";
    return d.toLocaleDateString(localeFor(lang), {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

// Date + time, e.g. "Nov 25, 2026, 10:24 AM".
export function formatDateTime(value, lang) {
    const d = parseDate(value);
    if (!d) return value ? String(value) : "";
    return d.toLocaleString(localeFor(lang), {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

// Short month name for chart labels, in the current language.
export function formatMonthShort(date, lang) {
    return date.toLocaleDateString(localeFor(lang), {month: "short"});
}

// Short day label for the 14-day trend chart, e.g. "Nov 25" / "۴ آذر".
export function formatDayShort(date, lang) {
    return date.toLocaleDateString(localeFor(lang), {month: "short", day: "numeric"});
}
