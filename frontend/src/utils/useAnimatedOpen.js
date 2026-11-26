import {useEffect, useRef, useState} from "react";

/**
 * Shared open/close animation for popups and dropdowns (v3.0).
 *
 * useAnimatedOpen(open, duration=200) returns {visible, closing}:
 * - while `open` is true the component is mounted and plays its entrance
 *   animation (via CSS);
 * - when `open` flips to false the component stays mounted for `duration`
 *   ms with `closing=true` (the CSS `*-closing` classes run the exit
 *   animation), then unmounts.
 * Under prefers-reduced-motion the exit is instant (duration 0) — the
 * global reduced-motion rule already zeroes the CSS durations too.
 */
export function useAnimatedOpen(open, duration = 200) {
    const [visible, setVisible] = useState(!!open);
    const [closing, setClosing] = useState(false);
    const timer = useRef(null);
    const reduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dur = reduced ? 0 : duration;

    useEffect(() => {
        if (open) {
            if (timer.current) clearTimeout(timer.current);
            setClosing(false);
            setVisible(true);
        } else if (visible) {
            setClosing(true);
            timer.current = setTimeout(() => {
                setVisible(false);
                setClosing(false);
            }, dur);
        }
        return () => {
            if (timer.current) clearTimeout(timer.current);
        };
    }, [open, visible, dur]);

    return {visible, closing};
}

export default useAnimatedOpen;
