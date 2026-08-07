import process from "node:process";

const ACCOUNT_ID = "ab49b099fee10183fa65951e5077d14a";
const DATABASE_ID = "b504b712-6927-499d-815d-0b954c8ee246";
const API_URL = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`;

async function query(sql, params = []) {
  const token = String(process.env.CLOUDFLARE_API_TOKEN || "").trim();
  if (!token) throw new Error("CLOUDFLARE_API_TOKEN ortam değişkeni bulunamadı.");
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ sql, params }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success || payload?.errors?.length) {
    throw new Error(`D1 salt-okunur kapsam denetimi başarısız oldu (HTTP ${response.status}).`);
  }
  return payload.result?.[0]?.results || [];
}

function quoteIdentifier(value) {
  if (!/^[A-Za-z0-9_]+$/.test(value)) throw new Error("Güvenli olmayan tablo adı reddedildi.");
  return `"${value}"`;
}

async function main() {
  const tables = await query("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name");
  const work = [];
  for (const table of tables) {
    const definition = String(table.sql || "").toLowerCase();
    for (const column of ["main_company_id", "main_company_slug"]) {
      if (definition.includes(`\"${column}\"`) || definition.includes(column)) {
        work.push({ table: String(table.name), column });
      }
    }
  }

  const aggregate = new Map();
  const anomalies = [];
  for (let offset = 0; offset < work.length; offset += 8) {
    const batch = work.slice(offset, offset + 8);
    const results = await Promise.all(batch.map(async ({ table, column }) => ({
      table,
      column,
      rows: await query(`SELECT CAST(${quoteIdentifier(column)} AS TEXT) AS tenant_value, COUNT(*) AS row_count FROM ${quoteIdentifier(table)} GROUP BY ${quoteIdentifier(column)}`),
    })));
    for (const result of results) {
      for (const row of result.rows) {
        const key = `${result.column}\u0000${String(row.tenant_value ?? "<NULL>")}`;
        const current = aggregate.get(key) || { column: result.column, value: String(row.tenant_value ?? "<NULL>"), tables: 0, rows: 0 };
        current.tables += 1;
        current.rows += Number(row.row_count || 0);
        aggregate.set(key, current);
        const value = String(row.tenant_value ?? "<NULL>");
        const canonical = result.column === "main_company_slug"
          ? value === "mecit-hakan"
          : value === "mecit-hakan" || value === "main-mecit-hakan";
        if (!canonical && Number(row.row_count || 0) > 0) {
          anomalies.push({ table: result.table, column: result.column, value, rows: Number(row.row_count || 0) });
        }
      }
    }
  }
  console.log(JSON.stringify({ inspectedScopes: work.length, tenantValues: [...aggregate.values()].sort((a, b) => `${a.column}:${a.value}`.localeCompare(`${b.column}:${b.value}`)), anomalies }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Tenant kapsam denetimi başarısız oldu.");
  process.exitCode = 1;
});
