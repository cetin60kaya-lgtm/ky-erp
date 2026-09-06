import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./main.ts", import.meta.url), "utf8");

test("main.ts import section does not contain escaped newline source text", () => {
  assert.doesNotMatch(source, /;\\nimport\s/);
});
