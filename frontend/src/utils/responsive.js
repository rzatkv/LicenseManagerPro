import {useState, useEffect} from "react";

// Responsive breakpoints shared by the list pages and the dashboard:
// narrow viewports (<640px) get fewer rows per page so the table fits
// without scrolling; wide viewports get the full page. Same pattern as
// the dashboard's recent-list counts (v3.0).
export function useIsNarrow() {
    const [isNarrow, setIsNarrow] = useState(
        () => typeof window !== "undefined" && window.matchMedia("(max-width: 640px)").matches,
    );
    useEffect(() => {
        const mq = window.matchMedia("(max-width: 640px)");
        const onChange = (e) => setIsNarrow(e.matches);
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, []);
    return isNarrow;
}

// Rows per list page: 5 on phones, 10 elsewhere.
export function useResponsivePageSize() {
    return useIsNarrow() ? 5 : 10;
}

/** Page size the user controls (v3.0.9): the default is the current
 * responsive size (5 on phones, 10 elsewhere — or `defaultSize` when
 * the list already had its own, e.g. the Languages keys list at 20),
 * the user's choice overrides it and persists per list in
 * localStorage, like the other panel prefs. Changing the size resets
 * the caller to page 1 (each caller already resets on pageSize
 * change). Returns [pageSize, setPageSize]. */
export function usePageSize(storageKey, defaultSize) {
    const responsiveSize = useResponsivePageSize();
    const fallback = defaultSize != null ? defaultSize : responsiveSize;
    const [pageSize, setPageSizeState] = useState(() => {
        try {
            const saved = typeof window !== "undefined" ? window.localStorage.getItem(`lmp-page-size-${storageKey}`) : null;
            const n = saved != null ? Number(saved) : NaN;
            return Number.isFinite(n) && n > 0 ? n : fallback;
        } catch (e) {
            return fallback;
        }
    });
    const setPageSize = (n) => {
        setPageSizeState(n);
        try {
            window.localStorage.setItem(`lmp-page-size-${storageKey}`, String(n));
        } catch (e) {
            // Private mode / storage full: the size still applies now.
        }
    };
    return [pageSize, setPageSize];
}
