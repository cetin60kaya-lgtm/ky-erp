const { execFileSync } = require("child_process");

const DB =
  "D:\\Onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ\\DATA\\KYERP.db";

const SQLITE = "sqlite3.exe";

const TABLES = [
  "documents",
  "document_intakes",
  "json_store"
];

function run(sql) {
  const out = execFileSync(
    SQLITE,
    ["-json", DB, sql],
    {
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 1024,
      windowsHide: true
    }
  ).trim();

  return out ? JSON.parse(out) : [];
}

function qi(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

console.log("");
console.log("======================================================");
console.log(" KY ERP - KRITIK KOLON ANALIZI");
console.log("======================================================");

for (const table of TABLES) {
  console.log("");
  console.log("######################################################");
  console.log("TABLO:", table);
  console.log("######################################################");

  const columns = run(
    `PRAGMA table_info(${qi(table)});`
  );

  const stats = [];

  for (const col of columns) {
    const name = col.name;

    const r = run(`
      SELECT
        COUNT(${qi(name)}) AS dolu,
        COALESCE(
          SUM(LENGTH(CAST(${qi(name)} AS BLOB))),
          0
        ) AS toplam,
        COALESCE(
          MAX(LENGTH(CAST(${qi(name)} AS BLOB))),
          0
        ) AS maksimum
      FROM ${qi(table)};
    `)[0] || {};

    stats.push({
      column: name,
      type: col.type || "",
      nonNull: Number(r.dolu || 0),
      totalBytes: Number(r.toplam || 0),
      maxBytes: Number(r.maksimum || 0)
    });
  }

  stats.sort(
    (a, b) => b.totalBytes - a.totalBytes
  );

  for (const x of stats) {
    console.log(
      `${x.column.padEnd(35)} ` +
      `tip=${x.type.padEnd(14)} ` +
      `toplam=${(x.totalBytes / 1024 / 1024).toFixed(3)} MB ` +
      `max=${(x.maxBytes / 1024 / 1024).toFixed(3)} MB ` +
      `dolu=${x.nonNull}`
    );
  }

  if (table === "json_store") {
    console.log("");
    console.log("JSON_STORE SCOPE DAGILIMI:");

    const scopes = run(`
      SELECT
        scope,
        COUNT(*) AS adet,
        COALESCE(
          SUM(LENGTH(CAST(data AS BLOB))),
          0
        ) AS toplam_byte
      FROM json_store
      GROUP BY scope
      ORDER BY toplam_byte DESC;
    `);

    for (const x of scopes) {
      console.log(
        `${String(x.scope || "(NULL)").padEnd(40)} ` +
        `${String(x.adet).padStart(6)} kayit ` +
        `${(
          Number(x.toplam_byte || 0) /
          1024 /
          1024
        ).toFixed(3)} MB`
      );
    }

    console.log("");
    console.log("JSON_STORE EN BUYUK 30 KAYIT:");

    const biggest = run(`
      SELECT
        id,
        scope,
        file_name,
        LENGTH(CAST(data AS BLOB)) AS byte_size
      FROM json_store
      ORDER BY byte_size DESC
      LIMIT 30;
    `);

    for (const x of biggest) {
      console.log(
        `${String(x.scope || "").padEnd(25)} ` +
        `${(
          Number(x.byte_size || 0) /
          1024
        ).toFixed(1).padStart(10)} KB ` +
        `${String(x.file_name || "").slice(0, 80)}`
      );
    }
  }
}

console.log("");
console.log("HICBIR VERI DEGISTIRILMEDI.");
console.log("D1'E YUKLEME YAPILMADI.");
console.log("");
