import { Hono } from "hono";
import { cors } from "hono/cors";
import app from "./index";
import { registerAccountingCompanyDirectoryRoutes } from "./accounting-company-directory";
import { registerAccountingCompanyProfileRoutes } from "./accounting-company-profile";
import { registerBoyahaneColorIdentityRoutes } from "./boyahane-color-identity";
import { registerBoyahaneColorJobRoutes } from "./boyahane-color-job";
import { registerBoyahaneColorResolveRoutes } from "./boyahane-color-resolve";
import { registerBoyahaneExcelImportRoutes } from "./boyahane-excel-import-runtime";
import { registerBoyahaneInventoryRoutes } from "./boyahane-inventory";
import { registerBoyahaneJobIntegrityRoutes } from "./boyahane-job-integrity";
import { registerBoyahaneManualJobRoutes } from "./boyahane-manual-job";
import { registerBoyahaneManualJobV2Routes } from "./boyahane-manual-job-v2";
import { registerBoyahaneSampleRoutes } from "./boyahane-sample";
import { registerBoyahaneWorkflowRoutes } from "./boyahane-workflow";
import { registerDesenBridgeRoutes } from "./desen-bridge";
import { registerDesenOperationRoutes } from "./desen-operations";
import { registerDesenStorageRoutes } from "./desen-storage";
import { registerDesenWorkflowRoutes } from "./desen-workflow";
import { registerDesenVisualSearchRoutes } from "./desen-visual-search";
import { registerIkRelationalCloudRoutes } from "./ik-relational-cloud";
import { registerIkAdminCloudRoutes } from "./ik-admin-cloud";
import { registerIsnetFileRuntimeRoutes } from "./isnet-file-runtime";
import { registerIsnetInvoiceRuntimeRoutes } from "./isnet-invoice-runtime";
import { registerIsnetLiveSyncRoutes } from "./isnet-live-sync";
import { registerIsnetRuntimeV2Routes } from "./isnet-runtime-v2";
import { registerIsnetCloudRoutes } from "./isnet-cloud";
import { registerIsnetIntakeCompatRoutes } from "./isnet-intake-compat";
import { registerProductionCenterRoutes } from "./production-center";
import { registerProductionRuntimeV2Routes } from "./production-runtime-v2";

type ShellEnv = {
  Bindings: Cloudflare.Env;
  Variables: { requestId: string };
};

const LIVE_ORIGINS = new Set([
  "https://kyerp.net",
  "https://www.kyerp.net",
  "https://app.kyerp.net",
]);

const LOCAL_DEV_ORIGIN =
  /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{2,5})?$/i;
const PAGES_PREVIEW_ORIGIN =
  /^https:\/\/[a-z0-9-]+\.ky-erp-frontend\.pages\.dev$/i;

function allowedOrigin(origin: string) {
  if (LIVE_ORIGINS.has(origin)) return origin;
  if (LOCAL_DEV_ORIGIN.test(origin)) return origin;
  if (PAGES_PREVIEW_ORIGIN.test(origin)) return origin;
  return undefined;
}

// Firma kartları İşNet'ten bağımsız kalıcı ana rehberdir; manuel oluşturma ve muhasebe profili D1'de tutulur.
registerAccountingCompanyDirectoryRoutes(app);
registerAccountingCompanyProfileRoutes(app);
// Temiz üretim runtime'ı aynı endpointleri legacy katmandan önce karşılar.
// Günlük imalat işlemleri doğrudan D1 üzerinde çalışır; GitHub Actions kullanılmaz.
registerProductionRuntimeV2Routes(app);
registerProductionCenterRoutes(app);
registerBoyahaneInventoryRoutes(app);
registerBoyahaneExcelImportRoutes(app);
registerBoyahaneManualJobV2Routes(app);
registerBoyahaneManualJobRoutes(app);
registerBoyahaneSampleRoutes(app);
registerBoyahaneColorResolveRoutes(app);
registerBoyahaneColorIdentityRoutes(app);
registerBoyahaneColorJobRoutes(app);
// Reçetesi olmayan renk tamamlandı sayılmaz; genel workflow GET rotalarından önce çalışır.
registerBoyahaneJobIntegrityRoutes(app);
registerBoyahaneWorkflowRoutes(app);
registerDesenStorageRoutes(app);
registerDesenBridgeRoutes(app);
registerDesenVisualSearchRoutes(app);
registerDesenWorkflowRoutes(app);
registerDesenOperationRoutes(app);

// İşNet bağlantı ve portal senkronu en önce gerçek canlı adaptör tarafından karşılanır.
// Şifre D1'e yazılmaz; geçici girişten API tokenı / firma seçilmiş portal oturumu alınır.
registerIsnetLiveSyncRoutes(app);
// Arşivlenen İşNet PDF/XML dosyaları doğrudan R2'den açılır.
registerIsnetFileRuntimeRoutes(app);
// Doğrulanmış fatura taslağı SaveInvoice ile oluşur; resmî gönderim yalnız son kullanıcı onayı sonrası SendStagingInvoice kullanır.
registerIsnetInvoiceRuntimeRoutes(app);
// Müşteri: gelen irsaliye -> model/üretim -> bizim giden irsaliye -> bizim fatura.
// Tedarikçi: gelen irsaliye -> gelen fatura -> muhasebe/KDV/stok/cari.
registerIsnetRuntimeV2Routes(app);
registerIsnetIntakeCompatRoutes(app);
registerIsnetCloudRoutes(app);
// İK'nın gerçek D1 ilişkisel rotaları genel/legacy İK rotalarından önce kayıt edilir.
// Böylece /api/ik/advanced/* ve aylık personel ekranları JSON fallback'e düşmez.
registerIkRelationalCloudRoutes(app);
registerIkAdminCloudRoutes(app);

const shell = new Hono<ShellEnv>();

shell.use(
  "/api/*",
  cors({
    origin: allowedOrigin,
    allowMethods: [
      "GET",
      "POST",
      "PATCH",
      "PUT",
      "DELETE",
      "HEAD",
      "OPTIONS",
    ],
    allowHeaders: ["Accept", "Authorization", "Content-Type", "X-KYERP-Tenant-Slug", "X-KYERP-Device"],
    exposeHeaders: ["Content-Length", "Content-Type", "ETag"],
    maxAge: 86400,
    credentials: true,
  }),
);

shell.route("/", app);

export default shell;
