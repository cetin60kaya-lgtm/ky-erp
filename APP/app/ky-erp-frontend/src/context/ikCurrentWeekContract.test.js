import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../../public/ik-current-week.js", import.meta.url), "utf8");

test("IK current week helper never performs a full page reload", () => {
  assert.doesNotMatch(source, /location\.reload\s*\(/);
  assert.doesNotMatch(source, /window\.location\.reload\s*\(/);
});

test("IK current week helper updates the existing React date inputs in place", () => {
  assert.match(source, /setReactInputValue/);
  assert.match(source, /dispatchEvent\(new Event\("input"/);
  assert.match(source, /dispatchEvent\(new Event\("change"/);
});
