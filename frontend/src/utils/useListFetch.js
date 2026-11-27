import {useState, useEffect, useCallback} from "react";
import {useLanguage} from "../i18n";
import {useToast} from "../components/Toast";

/**
 * Shared list-fetch behaviour (v3.0.6 — merges the ~20 hand-rolled
 * fetch blocks on the list pages: setLoading -> fetch -> setData ->
 * toast-on-error + empty fallback -> setLoading(false)).
 *
 * `fetcher`: async () => data — any shape (get, getList, Promise.all).
 * `deps`: the values `fetcher`/`onData`/`onError` close over — exactly
 *   the dep array the old useCallback carried; `load` is recreated when
 *   they change, which refetches (same as the old useEffect on the
 *   fetcher). The toast + `t` come from context here, so the page no
 *   longer threads them through the dep array for the default path.
 * `onData(data)`: apply a successful result (setters + totals).
 * `onStart()`: runs before each fetch, after setLoading(true) — for
 *   pages that reset a flag at fetch start (Roles clears `forbidden`).
 * `onError(err)`: extra failure handling AFTER the default toast —
 *   empty fallbacks, 403 -> forbidden flag. Pass `silent: true` and do
 *   the toast yourself inside onError when the page's error UX differs
 *   (AuditLogs toasts errors.forbidden on 403; Roles sets a forbidden
 *   flag instead of toasting). Auxiliary dropdown data (product/group
 *   pickers) uses `silent: true` + an empty fallback — a failed picker
 *   must never spam the user, same policy as before.
 * Returns {loading, reload} — `reload` is the old fetch function, used
 * after creates/deletes.
 *
 * NOT for: parameterised fetches (fetchActivations(id),
 * fetchDeliveries(productId)), the Dashboard's multi-source orchestration
 * (fetchAll/fetchServiceStatus/fetchSmsBalance) or the login challenge —
 * those keep their own shapes deliberately.
 */
export function useListFetch(fetcher, deps, {onData, onStart, onError, silent = false} = {}) {
  const {t} = useLanguage();
  const {toast} = useToast();
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(async () => {
    setLoading(true);
    if (onStart) onStart();
    try {
      const data = await fetcher();
      if (onData) onData(data);
    } catch (err) {
      if (!silent) toast.error(err.message || t("common.failedFetch"));
      if (onError) onError(err);
    } finally {
      setLoading(false);
    }
  }, deps);
  useEffect(() => {
    load();
  }, [load]);
  return {loading, reload: load};
}
