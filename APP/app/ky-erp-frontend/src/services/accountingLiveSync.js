import { useEffect, useRef, useState } from "react";
import { apiGet, clearApiGetCache } from "../utils/api";

const INTERVAL_MS = 10_000;

function errorStatus(error) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  const status = Number(error?.status || error?.statusCode || error?.response?.status || 0);
  if (status === 401 || status === 403) return "auth_error";
  return "api_error";
}

function hasTenantScope(activeMainCompany) {
  return Boolean(activeMainCompany?.slug || activeMainCompany?.id);
}

export function useAccountingLiveSync(activeMainCompany, onRefresh) {
  const revisionRef = useRef(null);
  const busyRef = useRef(false);
  const callbackRef = useRef(onRefresh);
  const activeMainCompanyId = activeMainCompany?.id;
  const activeMainCompanySlug = activeMainCompany?.slug;
  const [state, setState] = useState({
    status: "connecting",
    online: false,
    revision: 0,
    lastSyncAt: "",
    error: "",
  });

  useEffect(() => { callbackRef.current = onRefresh; }, [onRefresh]);

  useEffect(() => {
    let stopped = false;
    revisionRef.current = null;
    setState({ status: "connecting", online: false, revision: 0, lastSyncAt: "", error: "" });

    const scoped = hasTenantScope({ id: activeMainCompanyId, slug: activeMainCompanySlug });
    const params = () => ({
      mainCompanySlug: activeMainCompanySlug,
      mainCompanyId: activeMainCompanyId,
      _ts: Date.now(),
    });

    const check = async () => {
      if (stopped || busyRef.current || document.visibilityState === "hidden") return;
      busyRef.current = true;
      try {
        if (!scoped) throw new Error("Canlı muhasebe verisi için firma seçin.");
        const response = await apiGet("/muhasebe/workspace/live-state", params(), { timeoutMs: 6000, forceFresh: true });
        if (stopped) return;
        const data = response?.data || response || {};
        const revision = String(data.revision ?? "");
        const changed = revisionRef.current !== null && revision !== revisionRef.current;
        revisionRef.current = revision;
        setState({
          status: "live",
          online: true,
          revision,
          lastSyncAt: data.updatedAt || new Date().toISOString(),
          error: "",
        });
        if (changed) {
          clearApiGetCache();
          window.dispatchEvent(new CustomEvent("kyerp:accounting-refresh", { detail: { source: "live", revision } }));
          callbackRef.current?.();
        }
      } catch (error) {
        if (stopped) return;
        setState((current) => ({
          ...current,
          status: errorStatus(error),
          online: false,
          error: error?.message || "Muhasebe canl\u0131 ba\u011flant\u0131s\u0131 kurulamad\u0131.",
        }));
      } finally {
        busyRef.current = false;
      }
    };

    const timer = window.setInterval(check, INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    const onOnline = () => void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    void check();
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [activeMainCompanyId, activeMainCompanySlug]);

  return state;
}
