import {useEffect, useRef} from "react";

// Live auto-refresh (v3.0.11): re-runs `callback` quietly every 60s while
// the page is mounted. 60s matches the existing NotificationsBell poll.
// The tick PAUSES while the tab is hidden (`document.visibilitychange`)
// and runs once immediately when the tab becomes visible again, then the
// 60s interval restarts. Cleans up on unmount. A failed tick must fail
// silently (keep old data, retry next tick) — `callback` is expected to
// swallow its own errors (useListFetch `reloadQuiet` does); the wrapper
// also catches, so a throw can never break the timer.
export function useLiveRefresh(callback, intervalMs = 60000) {
  const cbRef = useRef(callback);
  cbRef.current = callback;
  useEffect(() => {
    let timer = null;
    const tick = () => {
      try {
        const r = cbRef.current && cbRef.current();
        if (r && typeof r.catch === "function") r.catch(() => {});
      } catch (e) {
        // Silent by design: keep the old data, retry on the next tick.
      }
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const start = () => {
      stop();
      timer = setInterval(tick, intervalMs);
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else {
        tick();
        start();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    start();
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs]);
}

export default useLiveRefresh;
