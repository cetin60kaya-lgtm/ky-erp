import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";

const HERE = dirname(fileURLToPath(import.meta.url));
const SEED_DIR = join(HERE, "color-catalog-seed");
const OUTPUT = process.argv[2] || "/tmp/kyerp-color-catalog.sql";
const AUDIT_OUTPUT = process.argv[3] || "/tmp/kyerp-color-catalog-audit.json";
const COLOR_SCOPE = "BOYAHANE_REGISTERED_COLOR";
const EXPECTED_ROWS = 908;
const EXPECTED_UNIQUE_PANTONES = 893;
const CLEAN_SOURCE = "RENK_KAYIT_XLSM_CLEAN_2026_08_25";

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLocaleUpperCase("tr-TR")
    .replace(/İ/g, "I")
    .replace(/[^A-Z0-9ÇĞÖŞÜ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sqlString(value) {
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

function stableId(pantone, paintType) {
  const key = `${normalize(pantone)}|${normalize(paintType)}`;
  const hash = createHash("sha1").update(key).digest("hex").slice(0, 18);
  return `rk-color-${hash}`;
}

const partFiles = readdirSync(SEED_DIR)
  .filter((name) => /^part-\d+\.b64$/.test(name))
  .sort();

if (partFiles.length !== 7) {
  throw new Error(`Seed parça sayısı 7 olmalı; bulunan: ${partFiles.length}`);
}

const encoded = partFiles
  .map((name) => readFileSync(join(SEED_DIR, name), "utf8").trim())
  .join("");
const payload = JSON.parse(gunzipSync(Buffer.from(encoded, "base64")).toString("utf8"));
const rows = Array.isArray(payload.rows) ? payload.rows : [];
const slug = String(payload.mainCompanySlug || "").trim();

if (slug !== "mecit-hakan") throw new Error(`Beklenmeyen ana firma: ${slug}`);
if (rows.length !== EXPECTED_ROWS) {
  throw new Error(`Temiz katalog ${EXPECTED_ROWS} satır olmalı; bulunan: ${rows.length}`);
}

const keys = new Set();
const namesByPantone = new Map();
const pantones = new Set();
const paintTypeCounts = new Map();
for (const row of rows) {
  const pantone = String(row.pantone || "").trim();
  const paintType = String(row.paintType || row.dyeType || "").trim();
  const colorName = String(row.colorName || "").trim();
  const colorHex = String(row.colorHex || "").trim().toUpperCase();
  if (!/^\d{2}-\d{4}$/.test(pantone)) throw new Error(`Geçersiz Pantone: ${pantone}`);
  if (!/^#[0-9A-F]{6}$/.test(colorHex)) throw new Error(`Geçersiz HEX: ${pantone} ${colorHex}`);
  if (!paintType) throw new Error(`Boya türü eksik: ${pantone}`);
  if (!colorName) throw new Error(`Renk adı eksik: ${pantone}`);
  if (row.source !== CLEAN_SOURCE) throw new Error(`Beklenmeyen kaynak: ${pantone}`);
  const key = `${pantone}|${paintType}`;
  if (keys.has(key)) throw new Error(`Tekrarlı Pantone + boya türü: ${key}`);
  keys.add(key);
  pantones.add(pantone);
  paintTypeCounts.set(paintType, (paintTypeCounts.get(paintType) || 0) + 1);
  const existingName = namesByPantone.get(pantone);
  if (existingName && existingName !== colorName) {
    throw new Error(`Pantone için birden fazla kanonik ad: ${pantone}: ${existingName} / ${colorName}`);
  }
  namesByPantone.set(pantone, colorName);
}

if (pantones.size !== EXPECTED_UNIQUE_PANTONES) {
  throw new Error(`Benzersiz Pantone ${EXPECTED_UNIQUE_PANTONES} olmalı; bulunan: ${pantones.size}`);
}

const now = new Date().toISOString();
const sql = [];
sql.push("-- KY ERP Boyahane temiz renk kataloğu");
sql.push(`-- Satır: ${rows.length}; Pantone: ${pantones.size}; Firma: ${slug}`);
sql.push("-- Non-destructive upsert: reçete/lot/üretim geçmişini silmez.");

for (const row of rows) {
  const pantone = String(row.pantone).trim();
  const paintType = String(row.paintType || row.dyeType).trim();
  const id = stableId(pantone, paintType);
  const identity = {
    id,
    pantone,
    basePantone: pantone,
    colorName: String(row.colorName).trim(),
    pantoneName: String(row.pantoneName || "").trim(),
    colorHex: String(row.colorHex).trim().toUpperCase(),
    colorFamily: String(row.colorFamily || "DİĞER").trim(),
    dyeType: paintType,
    paintType,
    paintTypes: [paintType],
    sourceType: "PANTONE",
    colorSource: "PANTONE",
    isPantoneExact: true,
    status: "ACTIVE",
    source: CLEAN_SOURCE,
    importedFrom: String(payload.source || "Renk Kayıt(2).xlsm"),
    catalogUpdatedAt: now,
    updatedAt: now,
  };
  const identityJson = JSON.stringify(identity);
  const matchWhere = [
    `scope = ${sqlString(COLOR_SCOPE)}`,
    `main_company_slug = ${sqlString(slug)}`,
    "json_valid(data) = 1",
    `trim(COALESCE(json_extract(data, '$.pantone'), json_extract(data, '$.basePantone'), '')) = ${sqlString(pantone)}`,
    `trim(COALESCE(json_extract(data, '$.dyeType'), json_extract(data, '$.paintType'), json_extract(data, '$.paintTypes[0]'), '')) = ${sqlString(paintType)}`,
  ].join(" AND ");

  // Var olan tek kanonik kaydın kimlik alanlarını güncelle. json_patch diğer tarihçeyi korur.
  sql.push(
    `UPDATE json_store SET data = json_patch(CASE WHEN json_valid(data) THEN data ELSE '{}' END, ${sqlString(identityJson)}), updated_at = ${sqlString(now)} ` +
      `WHERE id = (SELECT id FROM json_store WHERE ${matchWhere} ORDER BY updated_at DESC, id DESC LIMIT 1);`,
  );

  // Aynı Pantone + boya türü yoksa yeni kanonik kart oluştur.
  sql.push(
    `INSERT INTO json_store (id, scope, main_company_slug, file_name, data, created_at, updated_at) ` +
      `SELECT ${sqlString(id)}, ${sqlString(COLOR_SCOPE)}, ${sqlString(slug)}, ${sqlString(id)}, ${sqlString(JSON.stringify({ ...identity, createdAt: now }))}, ${sqlString(now)}, ${sqlString(now)} ` +
      `WHERE NOT EXISTS (SELECT 1 FROM json_store WHERE ${matchWhere});`,
  );
}

writeFileSync(OUTPUT, `${sql.join("\n")}\n`, "utf8");
const audit = {
  ok: true,
  generatedAt: now,
  mainCompanySlug: slug,
  scope: COLOR_SCOPE,
  source: CLEAN_SOURCE,
  rows: rows.length,
  uniquePantones: pantones.size,
  uniquePantonePaintTypeKeys: keys.size,
  paintTypes: Object.fromEntries([...paintTypeCounts.entries()].sort()),
  seedParts: partFiles,
  output: OUTPUT,
};
writeFileSync(AUDIT_OUTPUT, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
console.log(JSON.stringify(audit));
