import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const files = [
  new URL("../src/index.ts", import.meta.url),
  new URL("../src/main.ts", import.meta.url),
];
const brokenToken = ";\\nimport ";
const fixedToken = ";\nimport ";

let repaired = 0;

for (const fileUrl of files) {
  const filePath = fileURLToPath(fileUrl);
  const source = await readFile(filePath, "utf8");
  const occurrences = source.split(brokenToken).length - 1;
  if (!occurrences) continue;

  const next = source.replaceAll(brokenToken, fixedToken);
  await writeFile(filePath, next, "utf8");
  repaired += occurrences;
  console.log(`SOURCE_SYNTAX_REPAIRED=${filePath}:${occurrences}`);
}

for (const fileUrl of files) {
  const filePath = fileURLToPath(fileUrl);
  const source = await readFile(filePath, "utf8");
  if (source.includes(brokenToken)) {
    throw new Error(`SOURCE_SYNTAX_REPAIR_FAILED=${filePath}`);
  }
}

console.log(`SOURCE_SYNTAX_READY=true repaired=${repaired}`);
