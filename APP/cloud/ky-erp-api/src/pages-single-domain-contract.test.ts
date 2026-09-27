import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../..");
const agents = readFileSync(resolve(repoRoot, "AGENTS.md"), "utf8");
const frontendWorkflow = readFileSync(resolve(repoRoot, ".github/workflows/frontend-hotfix-deploy.yml"), "utf8");
const deployAgent = readFileSync(resolve(repoRoot, ".github/agents/ky-erp-production-deploy.agent.md"), "utf8");

test("repository exposes one canonical user-facing ERP origin", () => {
  assert.match(agents, /KYERP_PUBLIC_SITE=https:\/\/kyerp\.net\//);
  assert.match(agents, /KYERP_PUBLIC_APP=https:\/\/kyerp\.net\//);
  assert.match(agents, /KYERP_API_ORIGIN=https:\/\/api\.kyerp\.net/);
  assert.doesNotMatch(agents, /app\.kyerp\.net/);
});

test("frontend production verification uses only kyerp.net", () => {
  assert.match(frontendWorkflow, /https:\/\/kyerp\.net\//);
  assert.doesNotMatch(frontendWorkflow, /app\.kyerp\.net/);
});

test("production agent treats the old app subdomain as non-canonical", () => {
  assert.match(deployAgent, /Only user-facing live app URL|canonical/i);
  assert.match(deployAgent, /app\.kyerp\.net/);
  assert.match(deployAgent, /legacy\/non-canonical|legacy|non-canonical/i);
});