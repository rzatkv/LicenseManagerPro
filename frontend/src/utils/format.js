// Locale-aware date formatting for table cells and chart labels.
// The backend stores ISO timestamps; the UI must never show them raw.
// fa -> "fa-IR" (Persian digits and month names), everything else -> "en-US".
// Calendar (v3.0): the admin picks Gregorian / Jalali / Hijri in Settings
// (General tab); the choice is stored in localStorage under "lmp-calendar"
// and read here on EVERY call, so saving the setting takes effect
// immediately with no reload. Intl renders each calendar:
//   gregorian -> -u-ca-gregory, jalali -> -u-ca-persian,
//   hijri -> -u-ca-islamic-umalqura.

export function localeFor(lang) {
    return lang === "fa" ? "fa-IR" : "en-US";
}

export function calendarFor() {
    try {
        const stored = typeof localStorage !== "undefined" ? localStorage.getItem("lmp-calendar") : null;
        if (stored === "jalali") return "persian";
        if (stored === "hijri") return "islamic-umalqura";
    } catch (e) { /* storage unavailable: Gregorian */ }
    return "gregory";
}

function calendarLocale(lang) {
    return `${localeFor(lang)}-u-ca-${calendarFor()}`;
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
    return d.toLocaleDateString(calendarLocale(lang), {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

// Date + time, e.g. "Nov 25, 2026, 10:24 AM".
export function formatDateTime(value, lang) {
    const d = parseDate(value);
    if (!d) return value ? String(value) : "";
    return d.toLocaleString(calendarLocale(lang), {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

// Short month name for chart labels, in the current language.
export function formatMonthShort(date, lang) {
    return date.toLocaleDateString(calendarLocale(lang), {month: "short"});
}

// Short day label for the 14-day trend chart, e.g. "Nov 25" / "۴ آذر".
export function formatDayShort(date, lang) {
    return date.toLocaleDateString(calendarLocale(lang), {month: "short", day: "numeric"});
}
