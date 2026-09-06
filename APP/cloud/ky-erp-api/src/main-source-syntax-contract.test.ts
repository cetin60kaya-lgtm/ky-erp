import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mainSource = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

test("Worker source import sections do not contain escaped newline source text", () => {
  assert.doesNotMatch(mainSource, /;\\nimport\s/);
  assert.doesNotMatch(indexSource, /;\\nimport\s/);
});
