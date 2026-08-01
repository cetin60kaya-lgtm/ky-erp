import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const frontendRoot = path.join(root, "APP/app/ky-erp-frontend/src");
const workerRoot = path.join(root, "APP/cloud/ky-erp-api/src");

function walk(directory, extensions) {
  if (!fs.existsSync(directory)) return [];
  const rows = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) rows.push(...walk(full, extensions));
    else if (extensions.some((extension) => entry.name.endsWith(extension))) rows.push(full);
  }
  return rows;
}

function normalizeRoute(value) {
  let route = String(value || "").trim();
  if (!route.startsWith("/")) return "";
  route = route.replace(/\?.*$/, "");
  route = route.replace(/\$\{[^}]+\}/g, ":param");
  route = route.replace(/\/:([^/]+)/g, "/:param");
  route = route.replace(/\/{2,}/g, "/");
  return route;
}

function routePattern(route) {
  const escaped = normalizeRoute(route)
    .split("/")
    .map((segment) => {
      if (!segment) return "";
      if (segment === ":param" || segment === "*") return "[^/]+";
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return new RegExp(`^${escaped}$`);
}

function extractFrontendRoutes(file) {
  const text = fs.readFileSync(file, "utf8");
  const found = new Set();
  const patterns = [
    /api(?:Get|Post|Put|Patch|Delete|Upload|Fetch)\(\s*([`'"])(\/[^`'"]+)\1/g,
    /downloadFile\(\s*([`'"])(\/[^`'"]+)\1/g,
    /API_BASE\}\s*(\/[^`'"\s]+)/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const raw = match[2] || match[1];
      const normalized = normalizeRoute(raw);
      if (normalized) found.add(normalized);
    }
  }
  for (const match of text.matchAll(/([`'"])(\/api\/[^`'"]+)\1/g)) {
    const normalized = normalizeRoute(match[2]);
    if (normalized) found.add(normalized.replace(/^\/api/, ""));
  }
  return [...found];
}

function extractWorkerRoutes(file) {
  const text = fs.readFileSync(file, "utf8");
  const found = [];
  for (const match of text.matchAll(/\b(?:app|shell)\.(?:get|post|put|patch|delete|all|use)\(\s*([`'"])(\/api\/[^`'"]+)\1/g)) {
    const normalized = normalizeRoute(match[2]);
    if (normalized) found.push(normalized.replace(/^\/api/, ""));
  }
  return found;
}

const frontendFiles = walk(frontendRoot, [".js", ".jsx", ".ts", ".tsx"]);
const workerFiles = walk(workerRoot, [".ts", ".js"]);

const frontendRows = new Map();
for (const file of frontendFiles) {
  for (const route of extractFrontendRoutes(file)) {
    if (!frontendRows.has(route)) frontendRows.set(route, []);
    frontendRows.get(route).push(path.relative(root, file));
  }
}

const workerRoutes = [...new Set(workerFiles.flatMap(extractWorkerRoutes))].sort();
const workerPatterns = workerRoutes.map((route) => ({ route, pattern: routePattern(route) }));

const missing = [];
for (const [route, files] of [...frontendRows.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const comparable = route.replace(/^\/api/, "");
  const matched = workerPatterns.some(({ pattern }) => pattern.test(comparable));
  if (!matched) missing.push({ route: comparable, files });
}

const groups = new Map();
for (const row of missing) {
  const prefix = row.route.split("/").filter(Boolean)[0] || "root";
  if (!groups.has(prefix)) groups.set(prefix, []);
  groups.get(prefix).push(row);
}

console.log("\n=== KY ERP API SÖZLEŞME DENETİMİ ===");
console.log(`Frontend dosyaları: ${frontendFiles.length}`);
console.log(`Worker dosyaları: ${workerFiles.length}`);
console.log(`Frontend benzersiz rota: ${frontendRows.size}`);
console.log(`Worker benzersiz rota: ${workerRoutes.length}`);
console.log(`Eşleşmeyen rota: ${missing.length}`);

for (const [prefix, rows] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`\n[${prefix.toUpperCase()}] ${rows.length} eksik rota`);
  for (const row of rows) {
    console.log(`- ${row.route}`);
    for (const file of row.files.slice(0, 3)) console.log(`  • ${file}`);
  }
}

const output = {
  generatedAt: new Date().toISOString(),
  frontendRouteCount: frontendRows.size,
  workerRouteCount: workerRoutes.length,
  missingCount: missing.length,
  missing,
};
fs.mkdirSync(path.join(root, "test-results"), { recursive: true });
fs.writeFileSync(
  path.join(root, "test-results/api-contract-audit.json"),
  JSON.stringify(output, null, 2),
  "utf8",
);

const criticalPrefixes = new Set(["isnet", "ik", "admin", "ai"]);
const criticalMissing = missing.filter((row) =>
  criticalPrefixes.has(row.route.split("/").filter(Boolean)[0]),
);
if (criticalMissing.length) {
  console.error(`\nKRİTİK: ${criticalMissing.length} İşNet/İK/Yönetim/Asistan rotası Worker'da bulunamadı.`);
  process.exitCode = 2;
}
