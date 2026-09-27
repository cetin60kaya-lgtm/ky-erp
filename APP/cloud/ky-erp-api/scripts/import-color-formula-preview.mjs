import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED_DIR = join(HERE, "color-formula-seed");
const OUTPUT = process.argv[2] || "/tmp/kyerp-color-formulas.sql";
const AUDIT = process.argv[3] || "/tmp/kyerp-color-formulas-audit.json";
const EXPECTED_RECORDS = 737;
const EXPECTED_SHA256 = "0ae72d3392cd5b7acef8d5b11aa0c49a4c4073774e6534d53cf1436bb11bcb28";
const COLOR_SOURCE = "RENK_KAYIT_XLSM_CLEAN_2026_08_25";
const FORMULA_SOURCE = "RENK_KAYIT_XLSM_PANTONE_FORMUL_2026_08_25";
const SCOPE = "BOYAHANE_REGISTERED_COLOR";
const SLUG = "mecit-hakan";

function sqlString(value) {
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

const parts = readdirSync(SEED_DIR).filter((name) => /^part-\d+\.b64$/.test(name)).sort();
if (parts.length !== 5) throw new Error(`Formül seed parça sayısı 5 olmalı; bulunan: ${parts.length}`);
const encoded = parts.map((name) => readFileSync(join(SEED_DIR, name), "utf8").trim()).join("");
const compressed = Buffer.from(encoded, "base64");
const sha256 = createHash("sha256").update(compressed).digest("hex");
if (sha256 !== EXPECTED_SHA256) throw new Error(`Formül seed SHA256 uyuşmuyor: ${sha256}`);
const payload = JSON.parse(gunzipSync(compressed).toString("utf8"));
const records = Array.isArray(payload.r) ? payload.r : [];
if (records.length !== EXPECTED_RECORDS) throw new Error(`Formül kaydı ${EXPECTED_RECORDS} olmalı; bulunan: ${records.length}`);

const keys = new Set();
let lineCount = 0;
const sql = [
  "-- KY ERP Boyahane arşiv Pantone formülü önizleme aktarımı",
  "-- Non-destructive: renk kimliği, onaylı reçete, lot, stok ve üretim geçmişi korunur.",
];
const now = new Date().toISOString();

for (const record of records) {
  const pantone = String(record.p || "").trim();
  const paintType = String(record.t || "").trim();
  const totalGr = Number(record.g || 0);
  const rawLines = Array.isArray(record.l) ? record.l : [];
  if (!/^\d{2}-\d{4}$/.test(pantone)) throw new Error(`Geçersiz Pantone: ${pantone}`);
  if (!paintType) throw new Error(`Boya türü eksik: ${pantone}`);
  if (!(totalGr > 0) || !rawLines.length) throw new Error(`Formül eksik: ${pantone} ${paintType}`);
  const key = `${pantone}|${paintType}`;
  if (keys.has(key)) throw new Error(`Tekrarlı formül anahtarı: ${key}`);
  keys.add(key);

  const lines = rawLines.map((item, index) => {
    const productName = String(item?.[0] || "").trim();
    const gram = Number(item?.[1] || 0);
    if (!productName || !(gram > 0)) throw new Error(`Geçersiz bileşen: ${key} satır ${index + 1}`);
    lineCount += 1;
    return {
      id: `catalog-line-${index + 1}`,
      productName,
      referenceGram: Number(gram.toFixed(4)),
      totalGr: Number(gram.toFixed(4)),
      percentage: Number(((gram / totalGr) * 100).toFixed(4)),
      source: FORMULA_SOURCE,
    };
  });

  const formula = {
    source: FORMULA_SOURCE,
    status: "ARCHIVE_REFERENCE",
    productionSafe: false,
    note: "Excel PANTONE FORMUL sayfasından temizlenmiş arşiv referansıdır. Gerçek sarf için ürün ve lot eşleşmesi üretim ekranında doğrulanır.",
    pantone,
    paintType,
    totalGr: Number(totalGr.toFixed(4)),
    lines,
    importedAt: now,
  };
  const patch = JSON.stringify({ catalogFormulaAvailable: true, catalogFormula: formula });
  const where = [
    `scope=${sqlString(SCOPE)}`,
    `main_company_slug=${sqlString(SLUG)}`,
    "json_valid(data)=1",
    `json_extract(data,'$.source')=${sqlString(COLOR_SOURCE)}`,
    `trim(COALESCE(json_extract(data,'$.pantone'),''))=${sqlString(pantone)}`,
    `trim(COALESCE(json_extract(data,'$.dyeType'),json_extract(data,'$.paintType'),''))=${sqlString(paintType)}`,
  ].join(" AND ");
  sql.push(`UPDATE json_store SET data=json_patch(data, ${sqlString(patch)}), updated_at=${sqlString(now)} WHERE ${where};`);
}

writeFileSync(OUTPUT, `${sql.join("\n")}\n`, "utf8");
const audit = {
  ok: true,
  generatedAt: now,
  sha256,
  records: records.length,
  uniqueKeys: keys.size,
  componentLines: lineCount,
  colorSource: COLOR_SOURCE,
  formulaSource: FORMULA_SOURCE,
  output: OUTPUT,
};
writeFileSync(AUDIT, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify(audit));
