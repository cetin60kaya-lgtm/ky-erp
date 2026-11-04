import { useEffect, useState } from "react";
import { API_BASE, apiFetch, apiUrl } from "../../utils/api";

// A private File Hub/R2 preview needs the same bearer/tenant headers as every ERP API
// request. Keep tokens out of image URLs and release temporary object URLs on unmount.
export default function DesenImage({ src, alt = "", className = "", style, ...props }) {
  const rawSource = String(src || "").trim();
  const [state, setState] = useState({ source: "", ready: false, failed: false });

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    if (!rawSource) {
      setState({ source: "", ready: false, failed: false });
      return undefined;
    }

    const isDirectMedia = /^(blob:|data:|http:\/\/)/i.test(rawSource);
    const sourceUrl = isDirectMedia ? rawSource : apiUrl(rawSource);
    const isInternal = !isDirectMedia && (sourceUrl.startsWith(`${API_BASE}/`) || sourceUrl === API_BASE);
    if (!isInternal) {
      setState({ source: sourceUrl, ready: true, failed: false });
      return undefined;
    }

    setState({ source: "", ready: false, failed: false });
    apiFetch(rawSource, {
      method: "GET",
      responseType: "blob",
      timeoutMs: 45000,
      headers: { Accept: "image/*" },
    }).then((blob) => {
      if (!blob?.type?.toLowerCase().startsWith("image/")) {
        throw new Error("Bu dosya için resim önizlemesi henüz hazır değil.");
      }
      objectUrl = URL.createObjectURL(blob);
      if (active) setState({ source: objectUrl, ready: true, failed: false });
      else URL.revokeObjectURL(objectUrl);
    }).catch(() => {
      if (active) setState({ source: "", ready: false, failed: true });
    });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [rawSource]);

  if (!rawSource || state.failed || !state.ready) {
    return (
      <span className={`dsg-image-placeholder ${className}`} style={style} role="img" aria-label={alt || "Desen görseli"}>
        {!rawSource ? "Görsel bekleniyor" : state.failed ? "Önizleme açılamadı" : "Görsel yükleniyor"}
      </span>
    );
  }

  return <img src={state.source} alt={alt} className={className} style={style} loading="lazy" {...props} />;
}
