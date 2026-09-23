import { useEffect, useRef, useState } from "react";
import { apiGet, clearApiGetCache } from "../utils/api";

const INTERVAL_MS = 2000;

export function useAccountingLiveSync(activeMainCompany, onRefresh) {
  const revisionRef = useRef(null);
  const busyRef = useRef(false);
  const callbackRef = useRef(onRefresh);
  const [state, setState] = useState({ online: true, revision: 0, lastSyncAt: "" });

  useEffect(() => { callbackRef.current = onRefresh; }, [onRefresh]);

  useEffect(() => {
    let stopped = false;
    const params = () => ({
      mainCompanySlug: activeMainCompany?.slug,
      mainCompanyId: activeMainCompany?.id,
      _ts: Date.now(),
    });

    const check = async () => {
      if (stopped || busyRef.current || document.visibilityState === "hidden") return;
      busyRef.current = true;
      try {
        const response = await apiGet("/muhasebe/workspace/live-state", params(), { timeoutMs: 6000 });
        const data = response?.data || response || {};
        const revision = Number(data.revision || 0);
        const changed = revisionRef.current !== null && revision !== revisionRef.current;
        revisionRef.current = revision;
        setState({ online: true, revision, lastSyncAt: data.updatedAt || new Date().toISOString() });
        if (changed) {
          clearApiGetCache();
          window.dispatchEvent(new CustomEvent("kyerp:accounting-refresh", { detail: { source: "live", revision } }));
          callbackRef.current?.();
        }
      } catch {
        setState((current) => ({ ...current, online: false }));
      } finally {
        busyRef.current = false;
      }
    };

    const timer = window.setInterval(check, INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVisible);
    void check();
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [activeMainCompany?.id, activeMainCompany?.slug]);

  return state;
}
