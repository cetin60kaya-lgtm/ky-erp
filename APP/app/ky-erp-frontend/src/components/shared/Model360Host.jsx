import {lazy, Suspense, useEffect, useState} from "react";
import {MODEL_360_OPEN_EVENT} from "./model360Bridge";

const Model360Modal = lazy(() => import("./Model360Modal"));

export default function Model360Host({activeMainCompany, openModule}) {
  const [request, setRequest] = useState(null);
  const tenant = String(activeMainCompany?.slug || activeMainCompany?.id || "");
  useEffect(() => {
    const onOpen = (event) => {
      const modelId = String(event.detail?.modelId || "").trim();
      if (!modelId) return;
      setRequest({modelId, tab: event.detail?.tab || "general", source: event.detail?.source || "", tenant});
    };
    window.addEventListener(MODEL_360_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(MODEL_360_OPEN_EVENT, onOpen);
  }, [tenant]);
  useEffect(() => {
    if (request && request.tenant !== tenant) setRequest(null);
  }, [tenant, request]);
  if (!request || request.tenant !== tenant) return null;
  return <Suspense fallback={<div className="m360-loading" role="status">Model kartı açılıyor…</div>}>
    <Model360Modal key={tenant + ":" + request.modelId} modelId={request.modelId}
      initialTab={request.tab} activeMainCompany={activeMainCompany} openModule={openModule}
      onClose={() => setRequest(null)}/>
  </Suspense>;
}
