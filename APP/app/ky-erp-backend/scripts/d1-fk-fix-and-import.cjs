const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const DB =
  "D:\\Onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ\\DATA\\KYERP.db";

const BACKEND =
  "D:\\Onedrive-Hkn\\OneDrive\\KY-ERP-MERKEZ\\APP\\app\\ky-erp-backend";

const OUT_DIR =
  "D:\\KYERP-YEDEK\\D1-GECIS-20260711";

const PATCH_FILE =
  path.join(OUT_DIR, "KYERP_D1_FK_PATCH.sql");

const REPORT_FILE =
  path.join(OUT_DIR, "KYERP_D1_FK_PATCH_REPORT.json");

const DATA_FILE =
  path.join(OUT_DIR, "KYERP_D1_DATA.sql");

const SQLITE = "sqlite3.exe";
const DB_NAME = "ky-erp-db";

function localSql(sql) {
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

function runWrangler(args) {
  const command =
    `npx wrangler ${args.map(arg => {
      if (/[ \\"']/g.test(arg)) {
        return `"${arg.replace(/"/g, '\\"')}"`;
      }
      return arg;
    }).join(" ")}`;

  console.log("");
  console.log(">", command);
  console.log("");

  const out = execFileSync(
    "cmd.exe",
    ["/d", "/s", "/c", command],
    {
      cwd: BACKEND,
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 500,
      windowsHide: false,
      stdio: "inherit"
    }
  );

  return out;
}

function getUniqueSets(table) {
  const sets = [];

  const columns =
    localSql(`PRAGMA table_info(${qi(table)});`);

  const pkCols = columns
    .filter(c => Number(c.pk) > 0)
    .sort((a, b) => Number(a.pk) - Number(b.pk))
    .map(c => c.name);

  if (pkCols.length > 0) {
    sets.push(pkCols);
  }

  const indexes =
    localSql(`PRAGMA index_list(${qi(table)});`);

  for (const idx of indexes) {
    if (Number(idx.unique) !== 1) continue;

    const cols =
      localSql(`PRAGMA index_info(${qi(idx.name)});`)
        .sort((a, b) => Number(a.seqno) - Number(b.seqno))
        .map(x => x.name);

    if (cols.length > 0) {
      sets.push(cols);
    }
  }

  return sets;
}

function sameColumns(a, b) {
  if (a.length !== b.length) return false;

  return a.every(
    (value, index) =>
      String(value).toLowerCase() ===
      String(b[index]).toLowerCase()
  );
}

console.log("");
console.log("======================================================");
console.log(" KY ERP - D1 FOREIGN KEY DUZELTME VE VERI AKTARIMI");
console.log("======================================================");
console.log("");

if (!fs.existsSync(DATA_FILE)) {
  console.error("VERI DOSYASI BULUNAMADI:");
  console.error(DATA_FILE);
  process.exit(1);
}

const tables =
  localSql(`
    SELECT name
    FROM sqlite_master
    WHERE type='table'
      AND name NOT LIKE 'sqlite_%'
    ORDER BY name;
  `);

const fixes = [];
const blockingProblems = [];

for (const row of tables) {
  const childTable = row.name;

  const fks =
    localSql(
      `PRAGMA foreign_key_list(${qi(childTable)});`
    );

  const groups = new Map();

  for (const fk of fks) {
    const key = `${fk.id}|${fk.table}`;

    if (!groups.has(key)) {
      groups.set(key, {
        childTable,
        parentTable: fk.table,
        rows: []
      });
    }

    groups.get(key).rows.push(fk);
  }

  for (const group of groups.values()) {
    group.rows.sort(
      (a, b) => Number(a.seq) - Number(b.seq)
    );

    const parentCols =
      group.rows.map(x => x.to);

    if (parentCols.some(x => !x)) {
      continue;
    }

    const uniqueSets =
      getUniqueSets(group.parentTable);

    const alreadyValid =
      uniqueSets.some(
        set => sameColumns(set, parentCols)
      );

    if (alreadyValid) {
      continue;
    }

    const notNull =
      parentCols
        .map(col => `${qi(col)} IS NOT NULL`)
        .join(" AND ");

    const grouped =
      parentCols.map(qi).join(", ");

    const duplicates =
      localSql(`
        SELECT
          ${grouped},
          COUNT(*) AS adet
        FROM ${qi(group.parentTable)}
        WHERE ${notNull}
        GROUP BY ${grouped}
        HAVING COUNT(*) > 1
        LIMIT 20;
      `);

    if (duplicates.length > 0) {
      blockingProblems.push({
        childTable: group.childTable,
        parentTable: group.parentTable,
        parentColumns: parentCols,
        duplicates
      });

      continue;
    }

    const indexName =
      `d1_fk_fix_${group.parentTable}_${parentCols.join("_")}`
        .replace(/[^a-zA-Z0-9_]/g, "_")
        .slice(0, 60);

    fixes.push({
      childTable: group.childTable,
      parentTable: group.parentTable,
      parentColumns: parentCols,
      indexName
    });
  }
}

console.log("Otomatik duzeltilebilir FK sayisi:", fixes.length);
console.log("Tekrarlı veri nedeniyle bloklanan FK:", blockingProblems.length);
console.log("");

for (const fix of fixes) {
  console.log(
    `DUZELTILECEK: ${fix.childTable} -> ` +
    `${fix.parentTable}(${fix.parentColumns.join(", ")})`
  );
}

if (blockingProblems.length > 0) {
  console.log("");
  console.log("======================================================");
  console.log(" OTOMATIK DUZELTILEMEYEN FOREIGN KEYLER");
  console.log("======================================================");

  for (const problem of blockingProblems) {
    console.log("");
    console.log(
      `${problem.childTable} -> ` +
      `${problem.parentTable}` +
      `(${problem.parentColumns.join(", ")})`
    );

    console.log(
      JSON.stringify(problem.duplicates, null, 2)
    );
  }

  fs.writeFileSync(
    REPORT_FILE,
    JSON.stringify(
      {
        status: "BLOCKED_BY_DUPLICATES",
        fixes,
        blockingProblems
      },
      null,
      2
    ),
    "utf8"
  );

  console.log("");
  console.log("VERI IMPORTU BASLATILMADI.");
  process.exit(2);
}

let patchSql = "";

patchSql += "-- KY ERP D1 FOREIGN KEY PATCH\n";
patchSql += `-- Created: ${new Date().toISOString()}\n\n`;

for (const fix of fixes) {
  patchSql +=
    `CREATE UNIQUE INDEX IF NOT EXISTS ` +
    `${qi(fix.indexName)} ON ` +
    `${qi(fix.parentTable)} (` +
    `${fix.parentColumns.map(qi).join(", ")});\n`;
}

fs.writeFileSync(
  PATCH_FILE,
  patchSql,
  "utf8"
);

fs.writeFileSync(
  REPORT_FILE,
  JSON.stringify(
    {
      status: "READY",
      fixes,
      blockingProblems
    },
    null,
    2
  ),
  "utf8"
);

console.log("");
console.log("PATCH DOSYASI:");
console.log(PATCH_FILE);
console.log("");

if (fixes.length > 0) {
  console.log("1/4 FOREIGN KEY PATCH D1'E UYGULANIYOR...");

  runWrangler([
    "d1",
    "execute",
    DB_NAME,
    "--remote",
    `--file=${PATCH_FILE}`
  ]);
} else {
  console.log("1/4 Ek UNIQUE patch gerekmiyor.");
}

console.log("");
console.log("2/4 VERI D1'E YUKLENIYOR...");

runWrangler([
  "d1",
  "execute",
  DB_NAME,
  "--remote",
  `--file=${DATA_FILE}`
]);

console.log("");
console.log("3/4 KRITIK KAYIT SAYILARI KONTROL EDILIYOR...");

const checks = [
  ["personnel", 118],
  ["invoice_items", 1221],
  ["documents", 462],
  ["hr_daily_attendance", 909],
  ["companies", 56],
  ["json_store", 122]
];

for (const [table, expected] of checks) {
  console.log("");
  console.log(
    `KONTROL: ${table} | BEKLENEN: ${expected}`
  );

  runWrangler([
    "d1",
    "execute",
    DB_NAME,
    "--remote",
    `--command=SELECT COUNT(*) AS adet FROM ${table};`
  ]);
}

console.log("");
console.log("4/4 FOREIGN KEY KONTROLU...");

runWrangler([
  "d1",
  "execute",
  DB_NAME,
  "--remote",
  "--command=PRAGMA foreign_key_check;"
]);

console.log("");
console.log("======================================================");
console.log(" KY ERP D1 AKTARIM TAMAMLANDI");
console.log("======================================================");
console.log("");
console.log("Ana veritabani: ky-erp-db");
console.log("D1 ID: b504b712-6927-499d-815d-0b954c8ee246");
console.log("");
