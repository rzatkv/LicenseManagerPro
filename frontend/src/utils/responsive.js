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
