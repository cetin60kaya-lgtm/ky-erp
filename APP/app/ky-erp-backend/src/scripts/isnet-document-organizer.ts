import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { XMLParser } from "fast-xml-parser";
import { PrismaClient } from "@prisma/client";

const ROOT = process.env.KYERP_ISNET_ARCHIVE_ROOT || "D:\\Onedrive-Hkn\\OneDrive\\Masaüstü\\HKN";
const REPORT_ROOT = path.join(ROOT, "_DUZENLEME_RAPORU");
const SUPPORTED_EXTENSIONS = new Set([".pdf", ".xml"]);

export type DocumentKind = "INVOICE" | "DISPATCH" | "UNKNOWN";
export type DocumentClass = "SALES_INVOICE" | "CUSTOMER_DISPATCH" | "SUPPLIER_INVOICE" | "UNKNOWN";

export type ParsedDocument = {
  uuid: string;
  documentNo: string;
  documentDate: string;
  kind: DocumentKind;
  issuerTaxNo: string;
  issuerName: string;
  receiverTaxNo: string;
  receiverName: string;
  orderNo: string;
  itemName: string;
  quantity: string;
  currency: string;
};

export type ScanRow = {
  sourcePath: string;
  extension: string;
  size: number;
  sha256: string;
  kind: DocumentKind;
  documentNo: string;
  uuid: string;
  issuer: string;
  receiver: string;
  classification: DocumentClass;
  model: string;
  proposedName: string;
  targetPath: string;
  action: string;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  warnings: string[];
  duplicateOf: string;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function array(value: unknown): any[] {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function firstText(value: unknown): string {
  if (Array.isArray(value)) return firstText(value[0]);
  if (value && typeof value === "object") return text((value as any)["#text"] ?? (value as any).value);
  return text(value);
}

function party(root: any, key: string) {
  const value = root?.[key]?.Party ?? root?.[key]?.["cac:Party"] ?? {};
  const tax = value?.PartyIdentification ?? value?.["cac:PartyIdentification"];
  const ids = array(tax).map((entry) => firstText(entry?.ID ?? entry?.["cbc:ID"]));
  return {
    taxNo: ids.find((id) => /^\d{10,11}$/.test(id)) || "",
    name: firstText(value?.PartyName?.Name ?? value?.["cac:PartyName"]?.["cbc:Name"] ?? value?.PartyLegalEntity?.RegistrationName),
  };
}

export function parseUblXml(xml: string): ParsedDocument {
  const parsed = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true, processEntities: false }).parse(xml);
  const root = parsed?.Invoice || parsed?.DespatchAdvice;
  if (!root) throw new Error("UBL Invoice veya DespatchAdvice kökü bulunamadı.");
  const kind: DocumentKind = parsed.Invoice ? "INVOICE" : "DISPATCH";
  const issuer = party(root, "AccountingSupplierParty");
  const receiver = party(root, "AccountingCustomerParty");
  const line = array(root?.InvoiceLine ?? root?.DespatchLine)[0] || {};
  const item = line?.Item || {};
  return {
    uuid: firstText(root.UUID),
    documentNo: firstText(root.ID),
    documentDate: firstText(root.IssueDate),
    kind,
    issuerTaxNo: issuer.taxNo,
    issuerName: issuer.name,
    receiverTaxNo: receiver.taxNo,
    receiverName: receiver.name,
    orderNo: firstText(root?.OrderReference?.ID),
    itemName: firstText(item.Name ?? item.Description),
    quantity: firstText(line.InvoicedQuantity ?? line.DeliveredQuantity),
    currency: firstText(root.DocumentCurrencyCode),
  };
}

export function safeFileStem(value: string) {
  return text(value).replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").replace(/[. ]+$/g, "").slice(0, 180) || "ISNET-BELGE";
}

export function explicitModelName(value: string) {
  const match = text(value).match(/\bMODEL\s*[:=-]\s*([^\r\n]+)/i);
  if (!match) return "";
  return safeFileStem(match[1]).replace(/\b\d{2}[A-Z]\b/gi, "").replace(/\s+/g, " ").trim();
}

export function classifyDocument(document: ParsedDocument, companyTaxNos: Set<string>): DocumentClass {
  if (companyTaxNos.has(document.issuerTaxNo) && document.kind === "INVOICE") return "SALES_INVOICE";
  if (companyTaxNos.has(document.receiverTaxNo) && document.kind === "DISPATCH") return "CUSTOMER_DISPATCH";
  if (companyTaxNos.has(document.receiverTaxNo) && document.kind === "INVOICE") return "SUPPLIER_INVOICE";
  return "UNKNOWN";
}

function roots() {
  return [
    path.join(ROOT, "HKN E-FATURA"), path.join(ROOT, "DDM E-İRSALİYE"),
    path.join(ROOT, "İŞNET GELEN FATURALAR"), path.join(ROOT, "İŞNET GELEN İRSALİYELER"),
    path.join(ROOT, "_MODEL_BEKLEYEN"), path.join(ROOT, "_ISNET_GECICI"),
  ];
}

function filesIn(directory: string): string[] {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    return entry.isDirectory() ? filesIn(filePath) : SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase()) ? [filePath] : [];
  });
}

function sha256(filePath: string) {
  const digest = createHash("sha256");
  digest.update(fs.readFileSync(filePath));
  return digest.digest("hex");
}

function oneDriveOffline(filePath: string) {
  if (process.platform !== "win32") return false;
  try {
    const attributes = execFileSync("attrib.exe", [filePath], { encoding: "utf8", timeout: 2_000, windowsHide: true });
    return /\bO\b/.test(attributes);
  } catch {
    return false;
  }
}

async function configuredTaxNos() {
  const taxNos = new Set(text(process.env.KYERP_COMPANY_VKN || process.env.KYERP_COMPANY_TAX_NO).split(/[,;\s]+/).filter((value) => /^\d{10,11}$/.test(value)));
  const prisma = new PrismaClient();
  try {
    const connections = await prisma.setting.findMany({
      where: { scope: "ISNET", key: "CONNECTION", deletedAt: null },
      select: { value: true },
    });
    for (const connection of connections) {
      const value = connection.value && typeof connection.value === "object" && !Array.isArray(connection.value)
        ? connection.value as Record<string, unknown>
        : {};
      for (const candidate of [value.username, value.vkn, value.taxNo, value.vergiNo]) {
        const taxNo = text(candidate);
        if (/^\d{10,11}$/.test(taxNo)) taxNos.add(taxNo);
      }
    }
  } catch {
    // Veritabanı erişilemezse yalnız ortam yapılandırmasıyla güvenli tarama sürer.
  } finally {
    await prisma.$disconnect();
  }
  return taxNos;
}

function targetFor(classification: DocumentClass, extension: string, document: ParsedDocument, model: string) {
  const fileName = `${safeFileStem(document.documentNo || "ISNET-BELGE")}${model ? ` ${safeFileStem(model)}` : ""}${extension}`;
  if ((classification === "SALES_INVOICE" || classification === "CUSTOMER_DISPATCH") && !model) {
    const waitingType = classification === "CUSTOMER_DISPATCH" ? "IRSALIYE" : "FATURA";
    return path.join(ROOT, "_MODEL_BEKLEYEN", waitingType, extension === ".pdf" ? "PDF" : "XML", fileName);
  }
  if (classification === "SALES_INVOICE") return path.join(ROOT, extension === ".pdf" ? "HKN E-FATURA" : "İŞNET GELEN FATURALAR", fileName);
  if (classification === "CUSTOMER_DISPATCH") return path.join(ROOT, extension === ".pdf" ? "DDM E-İRSALİYE" : "İŞNET GELEN İRSALİYELER", fileName);
  if (classification === "SUPPLIER_INVOICE") {
    const supplierName = safeFileStem(document.issuerName);
    return path.join(ROOT, "TEDARİKÇİ", extension === ".pdf" ? "PDF" : "XML", `${safeFileStem(document.documentNo || "ISNET-BELGE")}${supplierName ? ` ${supplierName}` : ""}${extension}`);
  }
  const waitingType = document.kind === "DISPATCH" ? "IRSALIYE" : "FATURA";
  return path.join(ROOT, "_MODEL_BEKLEYEN", waitingType, extension === ".pdf" ? "PDF" : "XML", fileName);
}

export function scanFile(filePath: string, companyTaxNos = new Set<string>()): ScanRow {
  const extension = path.extname(filePath).toLowerCase();
  if (oneDriveOffline(filePath)) {
    return { sourcePath: filePath, extension, size: 0, sha256: "", kind: "UNKNOWN", documentNo: "", uuid: "", issuer: "", receiver: "", classification: "UNKNOWN", model: "", proposedName: "", targetPath: "", action: "ONE_DRIVE_NOT_AVAILABLE", confidence: "LOW", warnings: ["ONE_DRIVE_NOT_AVAILABLE: Dosya yalnız bulutta, içerik okunmadı."], duplicateOf: "" };
  }
  let stats: fs.Stats;
  let hash: string;
  try { stats = fs.statSync(filePath); hash = sha256(filePath); }
  catch (error: any) {
    return { sourcePath: filePath, extension, size: 0, sha256: "", kind: "UNKNOWN", documentNo: "", uuid: "", issuer: "", receiver: "", classification: "UNKNOWN", model: "", proposedName: "", targetPath: "", action: "ONE_DRIVE_NOT_AVAILABLE", confidence: "LOW", warnings: [`ONE_DRIVE_NOT_AVAILABLE: ${text(error?.code || error?.message)}`], duplicateOf: "" };
  }
  const row: ScanRow = { sourcePath: filePath, extension, size: stats.size, sha256: hash, kind: "UNKNOWN", documentNo: "", uuid: "", issuer: "", receiver: "", classification: "UNKNOWN", model: "", proposedName: "", targetPath: "", action: "REPORT_ONLY", confidence: "LOW", warnings: [], duplicateOf: "" };
  if (extension === ".pdf") { row.warnings.push("PDF içeriğinden UBL sınıflandırması yapılmaz; eş XML ile eşleşme beklenir."); return row; }
  try {
    const document = parseUblXml(fs.readFileSync(filePath, "utf8"));
    row.kind = document.kind; row.documentNo = document.documentNo; row.uuid = document.uuid; row.issuer = document.issuerName; row.receiver = document.receiverName;
    row.classification = classifyDocument(document, companyTaxNos);
    row.model = row.classification === "SUPPLIER_INVOICE" ? "" : explicitModelName(document.itemName);
    row.targetPath = targetFor(row.classification, extension, document, row.model);
    row.proposedName = path.basename(row.targetPath);
    row.confidence = row.classification === "UNKNOWN" ? "LOW" : "HIGH";
    row.action = row.classification === "UNKNOWN" ? "REVIEW_REQUIRED" : "SAFE_CANDIDATE";
    if (!companyTaxNos.size) row.warnings.push("Şirket VKN/TCKN yapılandırılmamış; sınıflandırma kesin değildir.");
  } catch (error: any) { row.warnings.push(`XML_PARSE_ERROR: ${text(error?.message)}`); row.action = "ERROR"; }
  return row;
}

export function findDuplicates(rows: ScanRow[]) {
  const byHash = new Map<string, ScanRow[]>();
  for (const row of rows) byHash.set(`${row.extension}:${row.sha256}`, [...(byHash.get(`${row.extension}:${row.sha256}`) || []), row]);
  for (const group of byHash.values()) {
    if (group.length < 2) continue;
    const original = group[0];
    for (const duplicate of group.slice(1)) { duplicate.duplicateOf = original.sourcePath; duplicate.action = "QUARANTINE_CANDIDATE"; duplicate.confidence = "HIGH"; }
  }
}

function createRequiredFolders() {
  ["TEDARİKÇİ/PDF", "TEDARİKÇİ/XML", "_SILINECEK_TEKRARLAR/PDF", "_SILINECEK_TEKRARLAR/XML", "_BELGE_HATALI/PDF", "_BELGE_HATALI/XML", "_MODEL_BEKLEYEN/FATURA/PDF", "_MODEL_BEKLEYEN/FATURA/XML", "_MODEL_BEKLEYEN/IRSALIYE/PDF", "_MODEL_BEKLEYEN/IRSALIYE/XML", "_ISNET_GECICI/E-FATURA/PDF", "_ISNET_GECICI/E-FATURA/XML", "_ISNET_GECICI/E-IRSALIYE/PDF", "_ISNET_GECICI/E-IRSALIYE/XML", "_DUZENLEME_RAPORU"].forEach((relative) => fs.mkdirSync(path.join(ROOT, relative), { recursive: true }));
}

function inheritXmlMetadataForPdf(rows: ScanRow[]) {
  const xmlByStem = new Map(rows.filter((row) => row.extension === ".xml").map((row) => [path.basename(row.sourcePath, ".xml").toLocaleLowerCase("tr-TR"), row]));
  for (const pdf of rows.filter((row) => row.extension === ".pdf")) {
    const xml = xmlByStem.get(path.basename(pdf.sourcePath, ".pdf").toLocaleLowerCase("tr-TR"));
    if (!xml) continue;
    Object.assign(pdf, { kind: xml.kind, documentNo: xml.documentNo, uuid: xml.uuid, issuer: xml.issuer, receiver: xml.receiver, classification: xml.classification, model: xml.model, confidence: xml.confidence });
    if (xml.targetPath) {
      pdf.targetPath = path.join(path.dirname(xml.targetPath).replace(`${path.sep}XML`, `${path.sep}PDF`), `${path.basename(xml.targetPath, ".xml")}.pdf`);
      pdf.proposedName = path.basename(pdf.targetPath);
      pdf.action = xml.action;
      pdf.warnings = ["PDF, aynı temel ada sahip XML ile eşleştirildi."];
    }
  }
}

function safeMove(sourcePath: string, desiredTarget: string) {
  if (!fs.existsSync(sourcePath)) throw new Error(`Kaynak bulunamadı: ${sourcePath}`);
  const sourceHash = sha256(sourcePath);
  fs.mkdirSync(path.dirname(desiredTarget), { recursive: true });
  let target = desiredTarget;
  if (fs.existsSync(target) && sha256(target) !== sourceHash) {
    const parsed = path.parse(target);
    let suffix = 2;
    do { target = path.join(parsed.dir, `${parsed.name}-${suffix++}${parsed.ext}`); } while (fs.existsSync(target));
  }
  if (fs.existsSync(target) && sha256(target) === sourceHash) return { sourcePath, targetPath: target, sourceHash, unchanged: true };
  const partial = `${target}.partial`;
  try {
    fs.copyFileSync(sourcePath, partial, fs.constants.COPYFILE_EXCL);
    if (fs.statSync(partial).size !== fs.statSync(sourcePath).size || sha256(partial) !== sourceHash) throw new Error("Hedef SHA-256 doğrulaması başarısız.");
    fs.renameSync(partial, target);
    fs.unlinkSync(sourcePath);
    return { sourcePath, targetPath: target, sourceHash, unchanged: false };
  } catch (error) {
    if (fs.existsSync(partial)) fs.unlinkSync(partial);
    throw error;
  }
}

function loadReport(reportId: string) {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(reportId)) throw new Error("Geçerli açık tarihli rapor kimliği zorunludur.");
  const reportPath = path.join(REPORT_ROOT, `isnet-dry-run-${reportId}.json`);
  if (!fs.existsSync(reportPath)) throw new Error(`Rapor bulunamadı: ${reportId}`);
  return JSON.parse(fs.readFileSync(reportPath, "utf8")) as { rows: ScanRow[] };
}

function appendOperationLog(entry: Record<string, unknown>) {
  fs.mkdirSync(REPORT_ROOT, { recursive: true });
  fs.appendFileSync(path.join(REPORT_ROOT, "isnet-file-operations.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
}

function applyReport(reportId: string, duplicatesOnly: boolean) {
  const report = loadReport(reportId);
  const applicable = report.rows.filter((row) => duplicatesOnly ? row.action === "QUARANTINE_CANDIDATE" : row.action === "SAFE_CANDIDATE");
  const outcomes = applicable.map((row) => {
    const target = duplicatesOnly
      ? path.join(ROOT, "_SILINECEK_TEKRARLAR", row.extension === ".pdf" ? "PDF" : "XML", path.basename(row.sourcePath))
      : row.targetPath;
    const moved = safeMove(row.sourcePath, target);
    appendOperationLog({ operation: duplicatesOnly ? "QUARANTINE" : "MOVE", duplicateOf: row.duplicateOf || null, ...moved });
    return moved;
  });
  return { reportId, applied: outcomes.length, outcomes };
}

function htmlReport(rows: ScanRow[], reportId: string) {
  const escaped = (value: unknown) => text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!doctype html><meta charset="utf-8"><title>İşnet belge önizleme ${escaped(reportId)}</title><h1>İşnet Belge Önizleme</h1><p>DRY-RUN: hiçbir dosya değiştirilmedi.</p><table border="1" cellspacing="0" cellpadding="6"><thead><tr><th>Yol</th><th>Tür</th><th>Belge</th><th>Sınıf</th><th>İşlem</th><th>Hedef</th><th>Uyarı</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escaped(row.sourcePath)}</td><td>${escaped(row.extension)}</td><td>${escaped(row.documentNo)}</td><td>${escaped(row.classification)}</td><td>${escaped(row.action)}</td><td>${escaped(row.targetPath)}</td><td>${escaped(row.warnings.join(" | "))}</td></tr>`).join("")}</tbody></table>`;
}

export async function runScan() {
  createRequiredFolders();
  const companyTaxNos = await configuredTaxNos();
  const rows = roots().flatMap(filesIn).map((filePath) => scanFile(filePath, companyTaxNos));
  inheritXmlMetadataForPdf(rows);
  findDuplicates(rows);
  const reportId = new Date().toISOString().replace(/[:.]/g, "-");
  fs.writeFileSync(path.join(REPORT_ROOT, `isnet-dry-run-${reportId}.json`), JSON.stringify({ reportId, mode: "DRY_RUN", rows }, null, 2));
  fs.writeFileSync(path.join(REPORT_ROOT, `isnet-dry-run-${reportId}.csv`), ["sourcePath,extension,size,sha256,documentNo,uuid,classification,action,targetPath", ...rows.map((row) => [row.sourcePath, row.extension, row.size, row.sha256, row.documentNo, row.uuid, row.classification, row.action, row.targetPath].map((cell) => `"${text(cell).replace(/"/g, '""')}"`).join(","))].join("\n"));
  fs.writeFileSync(path.join(REPORT_ROOT, `isnet-dry-run-${reportId}.html`), htmlReport(rows, reportId));
  return { reportId, reportRoot: REPORT_ROOT, rows };
}

async function main() {
  const command = process.argv[2] || "scan";
  const reportId = text(process.argv.find((argument) => argument.startsWith("--report="))?.slice("--report=".length));
  if (command === "purge-quarantine") throw new Error("Kalıcı silme ilk teslimatta devre dışıdır.");
  if (["apply", "quarantine-duplicates"].includes(command)) {
    if (!process.argv.includes("--confirm-apply") || !reportId) throw new Error("Uygulama için --confirm-apply ve --report=<rapor-id> zorunludur.");
    console.log(JSON.stringify(applyReport(reportId, command === "quarantine-duplicates"), null, 2));
    return;
  }
  if (!["scan", "report", "verify"].includes(command)) throw new Error(`Bilinmeyen komut: ${command}`);
  if (command === "verify") { console.log(JSON.stringify({ mode: "VERIFY", message: "Bu sürümde taşınan dosyalar operasyon günlüğü üzerinden doğrulanır; yeni tarama yapılmadı." }, null, 2)); return; }
  const result = await runScan();
  const summary = result.rows.reduce<Record<string, number>>((all, row) => ({ ...all, [row.action]: (all[row.action] || 0) + 1 }), {});
  console.log(JSON.stringify({ mode: "DRY_RUN", reportId: result.reportId, reportRoot: result.reportRoot, files: result.rows.length, actions: summary }, null, 2));
}

if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });