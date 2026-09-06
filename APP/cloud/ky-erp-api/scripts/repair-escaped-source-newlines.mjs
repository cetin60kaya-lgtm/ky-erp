import { access, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const sourceFiles = [
  new URL("../src/index.ts", import.meta.url),
  new URL("../src/main.ts", import.meta.url),
];
const brokenToken = ";\\nimport ";
const fixedToken = ";\nimport ";

let repairedSourceNewlines = 0;
let repairedTestImports = 0;

for (const fileUrl of sourceFiles) {
  const filePath = fileURLToPath(fileUrl);
  const source = await readFile(filePath, "utf8");
  const occurrences = source.split(brokenToken).length - 1;
  if (!occurrences) continue;

  const next = source.replaceAll(brokenToken, fixedToken);
  await writeFile(filePath, next, "utf8");
  repairedSourceNewlines += occurrences;
  console.log(`SOURCE_SYNTAX_REPAIRED=${filePath}:${occurrences}`);
}

for (const fileUrl of sourceFiles) {
  const filePath = fileURLToPath(fileUrl);
  const source = await readFile(filePath, "utf8");
  if (source.includes(brokenToken)) {
    throw new Error(`SOURCE_SYNTAX_REPAIR_FAILED=${filePath}`);
  }
}

// Node's --experimental-strip-types test runner follows native ESM rules.
// Relative imports in *.test.ts therefore need an explicit .ts extension even
// though Wrangler/TypeScript bundler source imports can remain extensionless.
const srcDir = fileURLToPath(new URL("../src/", import.meta.url));
const testFiles = (await readdir(srcDir)).filter((name) => name.endsWith(".test.ts"));
const relativeImport = /\bfrom\s+(["'])(\.\.?\/[^"']+)\1/g;

for (const fileName of testFiles) {
  const filePath = join(srcDir, fileName);
  let source = await readFile(filePath, "utf8");
  const matches = [...source.matchAll(relativeImport)];
  let changed = false;

  for (const match of matches) {
    const specifier = match[2];
    if (/\.(?:[cm]?[jt]s|json)$/i.test(specifier)) continue;

    const candidate = join(dirname(filePath), `${specifier}.ts`);
    try {
      await access(candidate);
    } catch {
      continue;
    }

    const original = match[0];
    const replacement = original.replace(specifier, `${specifier}.ts`);
    source = source.replace(original, replacement);
    repairedTestImports += 1;
    changed = true;
    console.log(`TEST_ESM_IMPORT_REPAIRED=${fileName}:${specifier}->${specifier}.ts`);
  }

  if (changed) await writeFile(filePath, source, "utf8");
}

// Fail closed if a root unit test still imports an existing local TypeScript
// module without its extension.
for (const fileName of testFiles) {
  const filePath = join(srcDir, fileName);
  const source = await readFile(filePath, "utf8");
  for (const match of source.matchAll(relativeImport)) {
    const specifier = match[2];
    if (/\.(?:[cm]?[jt]s|json)$/i.test(specifier)) continue;
    try {
      await access(join(dirname(filePath), `${specifier}.ts`));
      throw new Error(`TEST_ESM_IMPORT_REPAIR_FAILED=${fileName}:${specifier}`);
    } catch (error) {
      if (String(error?.message || error).startsWith("TEST_ESM_IMPORT_REPAIR_FAILED=")) throw error;
    }
  }
}

console.log(`SOURCE_SYNTAX_READY=true sourceNewlines=${repairedSourceNewlines} testImports=${repairedTestImports}`);
