import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Cloud, FileText, FolderOpen, Link2, RefreshCw, ShieldCheck } from "lucide-react";
import { apiGet } from "../../../utils/api";
import IsnetLiveAcceptanceQA from "./IsnetLiveAcceptanceQA";
import "./eBelgeIsnetPortalSync.css";

const DIRECTIONS = ["Gelen e-Fatura", "Giden e-Fatura", "Gelen e-İrsaliye", "Giden e-İrsaliye"];
const unwrap = value => value?.data?.data ?? value?.data ?? value;
const storageLabel = provider => ({
  APP_NOT_CONFIGURED: "OAuth uygulaması tanımlı değil",
  OAUTH_AUTHORIZATION_REQUIRED: "Google hesabı yetkisi gerekli",
  ROOT_SELECTION_REQUIRED: "Ana Drive klasörünü seç",
  E_DOCUMENT_BINDING_REQUIRED: "E_BELGE / E_DOCUMENT klasör ataması gerekli",
  FIRST_INDEX_REQUIRED: "İlk bulut taraması gerekli",
  INDEX_PRESENT: "Drive bağlantısı ve indeks kaydı mevcut",
}[provider?.status] || "Bağlantı kurulmamış");

export default function EBelgeIsnetPortalSync({ activeMainCompany, openModule, onOpenSettings, enabled = true }) {
  const slug = activeMainCompany?.slug || activeMainCompany?.mainCompanySlug || activeMainCompany?.id || "";
  const [cloud, setCloud] = useState({ loading: true, isnet: null, storage: null, errors: [] });

  const refresh = useCallback(async () => {
    if (!slug || !enabled) {
      setCloud({ loading: false, isnet: null, storage: null, errors: [] });
      return;
    }
    setCloud(old => ({ ...old, loading: true, errors: [] }));
    const [isnet, storage] = await Promise.allSettled([
      apiGet("/isnet/cloud-readiness", { mainCompanySlug: slug, _ts: Date.now() }),
      apiGet("/file-hub/cloud/tenant-readiness", { mainCompanySlug: slug, _ts: Date.now() }),
    ]);
    setCloud({
      loading: false,
      isnet: isnet.status === "fulfilled" ? unwrap(isnet.value) : null,
      storage: storage.status === "fulfilled" ? unwrap(storage.value) : null,
      errors: [
        ...(isnet.status === "rejected" ? ["İşNet: " + (isnet.reason?.message || "durum okunamadı")] : []),
        ...(storage.status === "rejected" ? ["File Hub: " + (storage.reason?.message || "durum okunamadı")] : []),
      ],
    });
  }, [slug, enabled]);

  useEffect(() => { void refresh(); }, [refresh]);

  const provider = cloud.storage?.providers?.find(p => p.providerType === "GOOGLE_DRIVE") || null;
  const hasIndex = provider?.status === "INDEX_PRESENT";
  const apiConnected = cloud.isnet?.apiAuthorized === true;
  const apiConfigured = cloud.isnet?.companySelected === true;
  const mode = cloud.isnet?.mode || "";
  const statusMessage = !enabled ? "Bu firma için İşNet adaptörü pasif"
    : cloud.loading ? "Bulut bağlantıları denetleniyor"
    : !apiConfigured ? "İşNet API firma bağlantısı kurulmalı"
    : !apiConnected ? "İşNet API oturumu doğrulanmalı"
    : !hasIndex ? "İşNet API doğrulandı · Drive bağlantısı tamamlanmalı"
    : "İşNet API ve Google Drive bağlantısı hazır · belge kabul testi gerekli";

  return <section className="eis-local eis-single eis-cloud" aria-label="İşNet bulut üzerinden tek ekran">
    <header className="eis-local-head">
      <div>
        <span className="eis-local-kicker"><Cloud size={15}/> KY ERP · BULUT ÖNCELİKLİ</span>
        <h3>İşNet · Tek Ekran Belge Merkezi</h3>
        <p>İşNet resmî API, Google Drive ve KY ERP Belge Havuzu. Bilgisayar IP'si, 8791 servisi veya yerel EXE bağlantı ön koşulu değildir.</p>
      </div>
      <span className="eis-local-tag"><ShieldCheck size={15}/> Firma bazlı ortak bağlantı</span>
    </header>

    <div className="eis-status" role="status" aria-live="polite">
      {apiConnected && hasIndex ? <CheckCircle2 size={19}/> : <AlertTriangle size={19}/>}
      <div><strong>{statusMessage}</strong>
        <small>İşNet oturumu salt-okunur sağlayıcı sorgusuyla; Drive ise D1 bağlantı metaverisiyle kontrol edilir. Dosyanın gerçekten aktarıldığı ayrıca test edilir.</small>
      </div>
      <button type="button" className="eis-retry" onClick={() => void refresh()} disabled={!enabled || cloud.loading}>
        <RefreshCw size={15}/> Durumu Yenile
      </button>
    </div>

    {cloud.errors.length > 0 && <div className="eis-connection-guide" role="alert">
      <strong>Bulut durum denetimi tamamlanamadı.</strong>
      <p>{cloud.errors.join(" · ")}</p>
    </div>}

    <div className="eis-cloud-steps">
      <div>
        <strong><span>1</span> İşNet resmî API</strong>
        <p>{apiConnected ? "Sağlayıcı oturumu doğrulandı." : apiConfigured ? "Firma seçili; resmî API oturumu doğrulanmadı." : "Önce kullanıcı yetkisi ve firmayı bağla."}</p>
        {mode && <small>Seçili yöntem: {mode === "api" ? "Resmî API" : "API dışı · " + mode}</small>}
        {cloud.isnet?.providerStatus && <small>Sağlayıcı durumu: {cloud.isnet.providerStatus}</small>}
        <button type="button" onClick={() => onOpenSettings?.()} disabled={!enabled}>API Bağlantısını Kur / Kontrol Et</button>
      </div>
      <div>
        <strong><span>2</span> Google Drive · File Hub</strong>
        <p>{storageLabel(provider)}</p>
        <small>Ana firma tek Drive kökü ve E_BELGE / E_DOCUMENT klasör ataması kullanır.</small>
        <a href="/depolama/depolama-kaynaklar">Google Drive Bağlantısını Aç</a>
      </div>
      <div>
        <strong><span>3</span> Belge Havuzu</strong>
        <p>XML/PDF indirme ve D1 kayıt eşleşmesi ayrı ayrı doğrulanacak.</p>
        <button type="button" onClick={() => openModule?.("e-belge", { tabKey: "belge-havuzu" })}>Belge Havuzunu Aç</button>
      </div>
    </div>

    <IsnetLiveAcceptanceQA mainCompanySlug={slug} apiConnected={apiConnected}
      onConnected={() => void refresh()}
      onOpenSettings={() => onOpenSettings?.()} />

    <div className="eis-local-directions" aria-label="Dört belge yönü">
      {DIRECTIONS.map(title => <div key={title}><FileText size={16}/>
        <span><strong>{title}</strong><small>Resmî API ile XML/PDF kabulü doğrulanacak</small></span>
      </div>)}
    </div>
    <div className="eis-local-actions">
      <button type="button" onClick={() => openModule?.("e-belge", { tabKey: "belge-havuzu" })}><FolderOpen size={16}/> Belge Havuzu</button>
      <button type="button" onClick={() => openModule?.("e-belge", { tabKey: "eslestirmeler" })}><Link2 size={16}/> Fatura–İrsaliye Takibi</button>
    </div>
    <div className="eis-local-warning"><ShieldCheck size={17}/><span>
      Resmî İşNet API erişimi, orijinal XML/PDF indirme, Google Drive bulut indeksleme ve muhasebe D1 kaydı ayrı kabul adımlarıdır. İlk doğrulamadan önce otomatik fatura kesme/gönderme yapılmaz. Yerel bağlayıcı yalnız isteğe bağlı yedek yöntemdir.
    </span></div>
    {activeMainCompany?.name && <small className="eis-local-footer">Seçili ana firma: {activeMainCompany.name}</small>}
  </section>;
}
