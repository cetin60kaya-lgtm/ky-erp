/**
 * MuhasebeDocumentPages.jsx dosyasını modüler dosyalara bölen script.
 * 
 * Kaynak: src/pages/modules/MuhasebeDocumentPages.jsx  (5477 satır)
 * Hedef:  src/pages/modules/muhasebe/
 *   - _docHelpers.jsx       (shared bileşenler + utility'ler)
 *   - BelgeYuklemePage.jsx   (Belge Yükleme ekranı)
 *   - FaturaOnayPage.jsx     (Fatura Onay / BizimBelgeler + MusteriIrsaliyeQuickPanel)
 *   - TedarikciFaturaPage.jsx(Tedarikçi Fatura ekranı)
 *   - MusteriIrsaliyePage.jsx(Müşteri İrsaliye - kullanılmıyor ama korunuyor)
 */
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const srcFile = resolve(root, "src/pages/modules/MuhasebeDocumentPages.jsx");
const targetDir = resolve(root, "src/pages/modules/muhasebe");

mkdirSync(targetDir, { recursive: true });

const raw = readFileSync(srcFile, "utf-8");
const lines = raw.split(/\r?\n/);

// Helper: extract line range (1-indexed, inclusive)
function extract(start, end) {
  return lines.slice(start - 1, end).join("\n");
}

// Fix relative imports for one level deeper (../../ → ../../../)
function fixRelativeImports(code) {
  return code.replace(/from\s+["']\.\.\//g, (m) => m.replace("../", "../../"));
}

// ── 1. SHARED HELPERS ─────────────────────────────────────────────────
// Original imports (lines 1-45) + shared utilities (46-1136) + SummaryBox/RecordTable (1732-1807) + DocumentModelPage/ModelConnect/EditableSimpleLines/BottomActions (2165-2326)
const helpersImportBlock = fixRelativeImports(extract(1, 45));
const helpersBody = [
  extract(46, 1136),
  "",
  "// ── SummaryBox & RecordTable ──",
  extract(1732, 1807),
  "",
  "// ── DocumentModelPage / ModelConnect / EditableSimpleLines / BottomActions ──",
  extract(2165, 2326),
].join("\n");

// Add 'export' to shared functions/components that page files need
let helpersExported = helpersBody
  // Export functions
  .replace(/^function (money|dateTr|uid|displayText|PageHeader|SectionCard|StatusBadge|EmptyState|SearchToolbar|Field|TextArea|PoolListCard|normalizeLookup|ModelListCard|useModels|useCompanyDefaults|findCompanyDefaults|applyCompanyDefaults|useProducts|productId|productLabel|ActionBar|lineMatchBadge|lineMatchMiniText|normalizeLotRuleText|isLotRequiredForSupplierInvoice|statusKey|documentTypeKey|countByStatusTab|filterRowsByStatusTab|StatusTabs|documentDetailPath|openDocumentDetail|openDocumentPreview|modelPreviewStats|MiniModelVisualPanel|syncUploadHistoryWithPool|normalizeSupplierLine|normalizeUploadResults|outgoingInvoiceLineSources|normalizeOutgoingLine|decimalLikeToNumber|normalizeOutgoingPoolRow|normalizeCustomerDispatchRow|buildOutgoingDraftMailPackage|SummaryBox|RecordTable|DocumentModelPage|ModelConnect|EditableSimpleLines|BottomActions)\(/gm, 
    "export function $1(")
  // Export consts
  .replace(/^const (LOT_REQUIRED_SUPPLIER_KEYWORDS|LOT_REQUIRED_PRODUCT_KEYWORDS|WAITING_STATUSES|PROCESSED_STATUSES)\s*=/gm, 
    "export const $1 =");

writeFileSync(
  resolve(targetDir, "_docHelpers.jsx"),
  helpersImportBlock + "\n\n" + helpersExported + "\n",
  "utf-8"
);
console.log("✅ _docHelpers.jsx yazıldı");

// ── 2. BELGE YÜKLEME PAGE ─────────────────────────────────────────────
const belgeYuklemeImports = `import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cleanupOldDocumentUploads,
  fetchBelgeHavuzu,
  fetchDocumentReadTemplates,
  fetchDocumentUploadHistory,
  fetchDocumentUploadSummary,
  reprocessBelgeHavuzu,
  reprocessPendingBelgeHavuzu,
  saveDocumentReadTemplate,
  softDeleteBelgeYukleme,
  uploadMuhasebeDocuments,
} from "../../../services/muhasebeDocumentService";
import {
  PageHeader,
  SectionCard,
  StatusBadge,
  EmptyState,
  SearchToolbar,
  Field,
  StatusTabs,
  RecordTable,
  SummaryBox,
  money,
  dateTr,
  uid,
  displayText,
  statusKey,
  documentTypeKey,
  countByStatusTab,
  filterRowsByStatusTab,
  syncUploadHistoryWithPool,
  normalizeUploadResults,
  documentDetailPath,
  openDocumentDetail,
  openDocumentPreview,
} from "./_docHelpers";
`;

const belgeYuklemeBody = extract(1137, 1730);
writeFileSync(
  resolve(targetDir, "BelgeYuklemePage.jsx"),
  belgeYuklemeImports + "\n" + belgeYuklemeBody + "\n",
  "utf-8"
);
console.log("✅ BelgeYuklemePage.jsx yazıldı");

// ── 3. FATURA ONAY PAGE (BizimBelgeler + MusteriIrsaliyeQuickPanel) ───
const faturaOnayImports = `import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErpIcon } from "../../../components/erp/IconMap";
import ModelSelect from "../../../components/common/ModelSelect";
import { normalizeList } from "../../../utils/normalizeList";
import {
  filterBizimBelgeler,
  filterMusteriIrsaliyeleri,
  normalizeLines,
  parseDocumentFileName,
} from "../../../utils/documentFlow";
import { getModelImageSource } from "../../../utils/modelImage";
import {
  createModelFromOutgoingDocument,
  fetchCompanies,
  createProductAlias,
  fetchIncomingDeliveryPool,
  fetchMuhasebeModels,
  fetchOutgoingDocumentsPool,
  fetchProducts,
  linkIncomingDeliveryToModel,
  linkOutgoingDocumentToModel,
  matchSupplierInvoiceLines,
  prepareMailLog,
  prepareOutgoingMailPackage,
  saveIncomingDelivery,
  saveOutgoingDocument,
  saveProduct,
  suggestModelsForOutgoingDocument,
} from "../../../services/muhasebeService";
import {
  approveBelgeHavuzu,
  fetchBelgeHavuzu,
  updateBelgeHavuzu,
} from "../../../services/muhasebeDocumentService";
import {
  PageHeader,
  SectionCard,
  StatusBadge,
  EmptyState,
  SearchToolbar,
  Field,
  TextArea,
  PoolListCard,
  ModelListCard,
  ActionBar,
  StatusTabs,
  SummaryBox,
  DocumentModelPage,
  ModelConnect,
  EditableSimpleLines,
  BottomActions,
  MiniModelVisualPanel,
  useModels,
  useCompanyDefaults,
  useProducts,
  findCompanyDefaults,
  applyCompanyDefaults,
  productId,
  productLabel,
  money,
  dateTr,
  uid,
  displayText,
  statusKey,
  documentTypeKey,
  countByStatusTab,
  filterRowsByStatusTab,
  normalizeLookup,
  normalizeOutgoingPoolRow,
  normalizeCustomerDispatchRow,
  buildOutgoingDraftMailPackage,
  openDocumentPreview,
  lineMatchBadge,
  lineMatchMiniText,
} from "./_docHelpers";
`;

const faturaOnayBody = extract(2328, 3388);
writeFileSync(
  resolve(targetDir, "FaturaOnayPage.jsx"),
  faturaOnayImports + "\n" + faturaOnayBody + "\n",
  "utf-8"
);
console.log("✅ FaturaOnayPage.jsx yazıldı");

// ── 4. TEDARİKCİ FATURA PAGE ──────────────────────────────────────────
const tedarikciFaturaImports = `import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErpIcon } from "../../../components/erp/IconMap";
import ModelSelect from "../../../components/common/ModelSelect";
import { normalizeList } from "../../../utils/normalizeList";
import { getModelImageSource } from "../../../utils/modelImage";
import {
  fetchCompanies,
  createProductAlias,
  fetchMuhasebeModels,
  fetchProducts,
  matchSupplierInvoiceLines,
  saveProduct,
} from "../../../services/muhasebeService";
import {
  approveBelgeHavuzu,
  fetchBelgeHavuzu,
  updateBelgeHavuzu,
} from "../../../services/muhasebeDocumentService";
import {
  PageHeader,
  SectionCard,
  StatusBadge,
  EmptyState,
  SearchToolbar,
  Field,
  PoolListCard,
  ActionBar,
  StatusTabs,
  SummaryBox,
  RecordTable,
  DocumentModelPage,
  useProducts,
  useModels,
  useCompanyDefaults,
  findCompanyDefaults,
  applyCompanyDefaults,
  productId,
  productLabel,
  money,
  dateTr,
  uid,
  displayText,
  statusKey,
  countByStatusTab,
  filterRowsByStatusTab,
  normalizeSupplierLine,
  lineMatchBadge,
  lineMatchMiniText,
  isLotRequiredForSupplierInvoice,
  openDocumentPreview,
  normalizeLookup,
  MiniModelVisualPanel,
  normalizeUploadResults,
} from "./_docHelpers";
`;

const tedarikciFaturaBody = extract(3390, 5477);
writeFileSync(
  resolve(targetDir, "TedarikciFaturaPage.jsx"),
  tedarikciFaturaImports + "\n" + tedarikciFaturaBody + "\n",
  "utf-8"
);
console.log("✅ TedarikciFaturaPage.jsx yazıldı");

// ── 5. MÜŞTERİ İRSALİYE PAGE (ölü export, ama korunuyor) ─────────────
const musteriImports = `import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErpIcon } from "../../../components/erp/IconMap";
import { normalizeList } from "../../../utils/normalizeList";
import {
  fetchCompanies,
  fetchIncomingDeliveryPool,
  fetchMuhasebeModels,
  linkIncomingDeliveryToModel,
  saveIncomingDelivery,
} from "../../../services/muhasebeService";
import {
  fetchBelgeHavuzu,
} from "../../../services/muhasebeDocumentService";
import {
  PageHeader,
  SectionCard,
  StatusBadge,
  EmptyState,
  SearchToolbar,
  Field,
  TextArea,
  PoolListCard,
  ModelListCard,
  ActionBar,
  StatusTabs,
  DocumentModelPage,
  ModelConnect,
  EditableSimpleLines,
  BottomActions,
  useModels,
  useCompanyDefaults,
  findCompanyDefaults,
  applyCompanyDefaults,
  money,
  dateTr,
  uid,
  displayText,
  statusKey,
  countByStatusTab,
  filterRowsByStatusTab,
  normalizeCustomerDispatchRow,
  normalizeLookup,
} from "./_docHelpers";
`;

const musteriBody = extract(1808, 2164);
writeFileSync(
  resolve(targetDir, "MusteriIrsaliyePage.jsx"),
  musteriImports + "\n" + musteriBody + "\n",
  "utf-8"
);
console.log("✅ MusteriIrsaliyePage.jsx yazıldı");

// ── 6. BARREL RE-EXPORT (eski MuhasebeDocumentPages.jsx) ───────────────
const barrel = `/**
 * Barrel re-export — eski import yollarını korumak için.
 * Gerçek bileşenler artık ./muhasebe/ altında yaşıyor.
 */
export { BelgeYuklemePage } from "./muhasebe/BelgeYuklemePage";
export { BizimBelgelerPage } from "./muhasebe/FaturaOnayPage";
export { TedarikciFaturaPage } from "./muhasebe/TedarikciFaturaPage";
export { MusteriIrsaliyePage } from "./muhasebe/MusteriIrsaliyePage";
`;

writeFileSync(srcFile, barrel, "utf-8");
console.log("✅ MuhasebeDocumentPages.jsx → barrel re-export olarak güncellendi");

console.log("\n🎉 Bölme tamamlandı!");
console.log(`   Oluşturulan dosyalar:`);
console.log(`   - muhasebe/_docHelpers.jsx`);
console.log(`   - muhasebe/BelgeYuklemePage.jsx`);
console.log(`   - muhasebe/FaturaOnayPage.jsx (Fatura Onay / BizimBelgeler)`);
console.log(`   - muhasebe/TedarikciFaturaPage.jsx`);
console.log(`   - muhasebe/MusteriIrsaliyePage.jsx`);
