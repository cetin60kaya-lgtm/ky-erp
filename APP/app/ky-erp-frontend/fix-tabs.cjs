const fs = require("fs");
let content = fs.readFileSync("src/pages/modules/MuhasebeDeferredTabs.jsx", "utf8");

const cleanHeader = [
  'import { useEffect, useMemo, useState } from "react";',
  '',
  'import {',
  '  filterCompaniesByQuery,',
  '  findCompanyByName,',
  '  getSelectableCompanies,',
  '  normalizeCompanyText,',
  '} from "../../lib/companyHelpers";',
  'import {',
  '  AccountingPageShell,',
  '  EmptyState,',
  '  SectionCard,',
  '  StatusBadge,',
  '} from "../../components/erp/AccountingUi";',
  'import { ErpIcon } from "../../components/erp/IconMap";',
  'import {',
  '  apiGet as clientApiGet,',
  '  apiPost as clientApiPost,',
  '  apiUpload as clientApiUpload,',
  '} from "../../utils/api";',
  '',
  'const DEFAULT_BIZIM_DOCUMENT_PATHS = {',
  '  documentArchiveRootPath: "",',
  '  gidenIrsaliyeBasePath: "",',
  '  gidenFaturaBasePath: "",',
  '  tedarikciFaturaBasePath: "",',
  '  belgeYuklemeFaturaFolder: "FATURA",',
  '  belgeYuklemeIrsaliyeFolder: "IRSALIYE",',
  '  belgeYuklemeXmlFolder: "XML",',
  '  belgeYuklemeGelenIrsaliyeFolder: "GELEN IRSALIYE",',
  '  belgeYuklemeGelenFaturaFolder: "GELEN FATURA",',
  '  belgeYuklemeTasnifFolder: "TASNIF BEKLEYEN",',
  '  faturaDosyaPrefix: "FAT",',
  '  irsaliyeDosyaPrefix: "IRS",',
  '};',
  '',
  'const DEFAULT_SETTINGS_UI_PATHS = {',
  '  documentArchiveRootPath: "",',
  '  outgoingInvoicePath: DEFAULT_BIZIM_DOCUMENT_PATHS.gidenFaturaBasePath,',
  '  outgoingDispatchPath: DEFAULT_BIZIM_DOCUMENT_PATHS.gidenIrsaliyeBasePath,',
  '  supplierInvoicePath: DEFAULT_BIZIM_DOCUMENT_PATHS.tedarikciFaturaBasePath,',
  '  customerDispatchPath: "",',
  '  xmlPath: "",',
  '  unclassifiedPath: "",',
  '  faturaDosyaPrefix: DEFAULT_BIZIM_DOCUMENT_PATHS.faturaDosyaPrefix,',
  '  irsaliyeDosyaPrefix: DEFAULT_BIZIM_DOCUMENT_PATHS.irsaliyeDosyaPrefix,',
  '};',
  ''
].join("\n");

const funcStart = content.indexOf("function isLikelyFolderPath");
if (funcStart === -1) { console.error("marker not found"); process.exit(1); }

const cleaned = cleanHeader + "\n" + content.slice(funcStart);
fs.writeFileSync("src/pages/modules/MuhasebeDeferredTabs.jsx", cleaned, "utf8");
console.log("Fixed. Lines:", cleaned.split("\n").length);
