/**
 * MuhasebePage.jsx dosyasını modüler tab dosyalarına bölen script.
 *
 * Kaynak: src/pages/modules/MuhasebePage.jsx (14137 satır, 505KB)
 * Hedef:  src/pages/modules/muhasebe/
 *   - _muhasebeShared.jsx     (shared utils, constants, components)
 *   - GenelBakisTab.jsx
 *   - FirmaKartlariTab.jsx
 *   - CariKasaTab.jsx
 *   - UrunlerTab.jsx
 *   - KdvTab.jsx
 *   - OdemelerTab.jsx
 *   - CeklerTab.jsx
 *   - KrediKartlariTab.jsx
 *   - _deadCode/BelgeEditorTab.jsx  (ölü kod, arşivleniyor)
 *
 * MuhasebePage.jsx → thin orchestrator
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const srcFile = resolve(root, "src/pages/modules/MuhasebePage.jsx");
const targetDir = resolve(root, "src/pages/modules/muhasebe");
const deadDir = resolve(targetDir, "_deadCode");

mkdirSync(targetDir, { recursive: true });
mkdirSync(deadDir, { recursive: true });

const raw = readFileSync(srcFile, "utf-8");
const lines = raw.split(/\r?\n/);

function extract(start, end) {
  return lines.slice(start - 1, Math.min(end, lines.length)).join("\n");
}

function fixRelativeImports(code) {
  return code.replace(/from\s+["']\.\.\//g, (m) => m.replace("../", "../../"));
}

// ── Shared imports header for tab files ──
const TAB_IMPORTS_PREAMBLE = `import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  filterCompaniesByQuery,
  findCompanyByName,
  findBestCompanyMatch,
  getSelectableCompanies,
  normalizeCompanyText,
} from "../../../lib/companyHelpers";
import {
  AccountingPageShell,
  KpiCard,
  SectionCard,
  StatusBadge,
  EmptyState,
  IconButton,
} from "../../../components/erp/AccountingUi";
import { ErpIcon } from "../../../components/erp/IconMap";
import {
  API_BASE,
  apiDelete as clientApiDelete,
  apiGet as clientApiGet,
  apiPatch as clientApiPatch,
  apiPost as clientApiPost,
  apiUpload as clientApiUpload,
} from "../../../utils/api";
`;

// ── Shared body helper import ──
const SHARED_IMPORT = `import {
  tr,
  DEFAULT_BIZIM_DOCUMENT_PATHS,
  DOCUMENT_SECTION_CONFIG,
  PDF_DOCUMENT_CLASS_OPTIONS,
  CARI_KASA_TYPE_OPTIONS,
  uid,
  parseMoney,
  normalizeDateForInput,
  formatMoney,
  MetricBox,
  extractModelNameFromDocumentFileName,
  normalizeFlowType,
  flowTypeMeta,
  normalizeMainCompany,
  requireMainCompany,
  unwrapApiPayload,
  SectionHeader,
  MuhasebePageHeader,
  ActionBar,
  Input,
  Textarea,
  Select,
  MoneyInput,
  CompanyQuickPicker,
  PaymentTypeManager,
  getCariKasaTypeConfig,
  getCariKasaTypeFromRow,
  getCariKasaTypeLabel,
  createCariKasaForm,
  emptyDraft,
  normalizeLineItem,
  deriveDraftTotals,
  CariPreviewPanel,
} from "./_muhasebeShared";
`;

// ── 1. SHARED HELPERS ──
const sharedImportsRaw = extract(1, 39);
const sharedImports = fixRelativeImports(sharedImportsRaw)
  // Remove document page imports since they're not needed in shared
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*["']\.\/MuhasebeDocumentPages["'];?\n?/g, "");

const sharedBody = extract(40, 802);
// Add exports to all top-level declarations
let sharedExported = sharedBody
  .replace(/^const (tr|DEFAULT_BIZIM_DOCUMENT_PATHS|DOCUMENT_SECTION_CONFIG|PDF_DOCUMENT_CLASS_OPTIONS|CARI_KASA_TYPE_OPTIONS)\s*=/gm, "export const $1 =")
  .replace(/^function (uid|parseMoney|normalizeDateForInput|formatMoney|MetricBox|extractModelNameFromDocumentFileName|normalizeFlowType|flowTypeMeta|normalizeMainCompany|requireMainCompany|unwrapApiPayload|SectionHeader|MuhasebePageHeader|ActionBar|Input|Textarea|Select|MoneyInput|CompanyQuickPicker|PaymentTypeManager|getCariKasaTypeConfig|getCariKasaTypeFromRow|getCariKasaTypeLabel|createCariKasaForm|emptyDraft|normalizeLineItem|deriveDraftTotals)\(/gm, "export function $1(");

writeFileSync(
  resolve(targetDir, "_muhasebeShared.jsx"),
  sharedImports + "\n" + sharedExported + "\n",
  "utf-8"
);
console.log("✅ _muhasebeShared.jsx yazıldı");

// ── 2. DEAD CODE ARCHIVE ──
const deadCode = extract(803, 8148);
writeFileSync(
  resolve(deadDir, "BelgeEditorTab_DEAD.jsx"),
  `/**\n * ÖLÜ KOD — BelgeEditorTab, BelgeAkisTab, BelgelerTab\n * Bu fonksiyonlar hiçbir yerde kullanılmıyor. Arşivlendi.\n * Silinebilir.\n */\n\n${deadCode}\n`,
  "utf-8"
);
console.log("✅ _deadCode/BelgeEditorTab_DEAD.jsx yazıldı (7345 satır ölü kod arşivlendi)");

// ── 3. GenelBakisTab ──
writeFileSync(
  resolve(targetDir, "GenelBakisTab.jsx"),
  TAB_IMPORTS_PREAMBLE + SHARED_IMPORT + "\nexport " + extract(8149, 8448) + "\n",
  "utf-8"
);
console.log("✅ GenelBakisTab.jsx yazıldı");

// ── 4. FirmaKartlariTab ──
writeFileSync(
  resolve(targetDir, "FirmaKartlariTab.jsx"),
  TAB_IMPORTS_PREAMBLE + SHARED_IMPORT + "\nexport " + extract(8449, 9903) + "\n",
  "utf-8"
);
console.log("✅ FirmaKartlariTab.jsx yazıldı");

// ── 5. CariKasaTab + CariPreviewPanel ──
// CariPreviewPanel is at 10549-10637, needs to be exported from shared
const cariBody = extract(9904, 10637);
writeFileSync(
  resolve(targetDir, "CariKasaTab.jsx"),
  TAB_IMPORTS_PREAMBLE + SHARED_IMPORT + "\nexport " + cariBody + "\n",
  "utf-8"
);
console.log("✅ CariKasaTab.jsx yazıldı");

// ── 6. UrunlerTab ──
writeFileSync(
  resolve(targetDir, "UrunlerTab.jsx"),
  TAB_IMPORTS_PREAMBLE + SHARED_IMPORT + "\nexport " + extract(10638, 11379) + "\n",
  "utf-8"
);
console.log("✅ UrunlerTab.jsx yazıldı");

// ── 7. KdvTab ──
writeFileSync(
  resolve(targetDir, "KdvTab.jsx"),
  TAB_IMPORTS_PREAMBLE + SHARED_IMPORT + "\nexport " + extract(11380, 12019) + "\n",
  "utf-8"
);
console.log("✅ KdvTab.jsx yazıldı");

// ── 8. OdemelerTab ──
writeFileSync(
  resolve(targetDir, "OdemelerTab.jsx"),
  TAB_IMPORTS_PREAMBLE + SHARED_IMPORT + "\nexport " + extract(12020, 12603) + "\n",
  "utf-8"
);
console.log("✅ OdemelerTab.jsx yazıldı");

// ── 9. CeklerTab ──
writeFileSync(
  resolve(targetDir, "CeklerTab.jsx"),
  TAB_IMPORTS_PREAMBLE + SHARED_IMPORT + "\nexport " + extract(12604, 13362) + "\n",
  "utf-8"
);
console.log("✅ CeklerTab.jsx yazıldı");

// ── 10. KrediKartlariTab ──
writeFileSync(
  resolve(targetDir, "KrediKartlariTab.jsx"),
  TAB_IMPORTS_PREAMBLE + SHARED_IMPORT + "\nexport " + extract(13363, 13812) + "\n",
  "utf-8"
);
console.log("✅ KrediKartlariTab.jsx yazıldı");

// ── 11. NEW MuhasebePage.jsx (thin orchestrator) ──
const newMain = `import {
  Suspense,
  useEffect,
  useState,
} from "react";

import { lazyWithRetry } from "../../utils/lazyWithRetry";
import { apiGet } from "../../utils/api";
import {
  emptyDraft,
  flowTypeMeta,
} from "./muhasebe/_muhasebeShared";
import {
  BelgeYuklemePage,
  BizimBelgelerPage,
  TedarikciFaturaPage,
} from "./MuhasebeDocumentPages";
import { GenelBakisTab } from "./muhasebe/GenelBakisTab";
import { FirmaKartlariTab } from "./muhasebe/FirmaKartlariTab";
import { CariKasaTab } from "./muhasebe/CariKasaTab";
import { UrunlerTab } from "./muhasebe/UrunlerTab";
import { KdvTab } from "./muhasebe/KdvTab";
import { OdemelerTab } from "./muhasebe/OdemelerTab";
import { CeklerTab } from "./muhasebe/CeklerTab";
import { KrediKartlariTab } from "./muhasebe/KrediKartlariTab";

const LazyMuhasebeEpostaTab = lazyWithRetry(
  () => import("./MuhasebeDeferredTabs").then((m) => ({ default: m.MuhasebeEpostaTab })),
);
const LazyMuhasebeRaporlarTab = lazyWithRetry(
  () => import("./MuhasebeDeferredTabs").then((m) => ({ default: m.MuhasebeRaporlarTab })),
);
const LazyMuhasebeAyarlarTab = lazyWithRetry(
  () => import("./MuhasebeDeferredTabs").then((m) => ({ default: m.MuhasebeAyarlarTab })),
);

function DeferredMuhasebeTabFallback({ label }) {
  return (
    <div style={{ padding: "2rem", opacity: 0.5 }}>
      <em>{label || "Yükleniyor…"}</em>
    </div>
  );
}

${extract(13846, 14137)}
`;

writeFileSync(srcFile, newMain, "utf-8");
console.log("✅ MuhasebePage.jsx → thin orchestrator olarak güncellendi");

console.log("\\n🎉 Bölme tamamlandı!");
console.log("   Oluşturulan dosyalar:");
console.log("   - muhasebe/_muhasebeShared.jsx (shared utilities)");
console.log("   - muhasebe/GenelBakisTab.jsx");
console.log("   - muhasebe/FirmaKartlariTab.jsx");
console.log("   - muhasebe/CariKasaTab.jsx");
console.log("   - muhasebe/UrunlerTab.jsx");
console.log("   - muhasebe/KdvTab.jsx");
console.log("   - muhasebe/OdemelerTab.jsx");
console.log("   - muhasebe/CeklerTab.jsx");
console.log("   - muhasebe/KrediKartlariTab.jsx");
console.log("   - muhasebe/_deadCode/BelgeEditorTab_DEAD.jsx");
console.log("\\n   Ölü kod (7345 satır): BelgeEditorTab, BelgeAkisTab, BelgelerTab arşivlendi.");
console.log("   MuhasebePage.jsx: 14137 satır → ~100 satır orchestrator");
