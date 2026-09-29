import { readFile } from "node:fs/promises";
import path from "node:path";

const releasePath = path.resolve(process.cwd(), "../../../RELEASES/kyerp-production-release.json");
let release = {};
try {
  release = JSON.parse(await readFile(releasePath, "utf8"));
} catch {
  release = {};
}

const mode = String(release?.mode || "production");
if (!["pages-domain-audit", "pages-domain-repair"].includes(mode)) {
  process.exit(0);
}

const token = String(process.env.CLOUDFLARE_API_TOKEN || "").trim();
const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || "ab49b099fee10183fa65951e5077d14a").trim();
const projectName = "ky-erp-frontend";
const customDomain = "kyerp.net";
const apiBase = `https://api.cloudflare.com/client/v4/accounts/${accountId}`;

if (!token) {
  console.error("PAGES_DOMAIN_ERROR=CLOUDFLARE_API_TOKEN eksik");
  process.exit(1);
}

async function cf(pathname, options = {}) {
  const url = pathname.startsWith("http") ? pathname : `https://api.cloudflare.com/client/v4${pathname}`;
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 1_000) };
    }
    return { httpStatus: response.status, ok: response.ok, body };
  } catch (error) {
    return { httpStatus: 0, ok: false, body: { error: error?.message || String(error) } };
  }
}

const projectPath = `/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}`;
const projectsRes = await cf(`/accounts/${accountId}/pages/projects`);
const projectRes = await cf(projectPath);
const domainsRes = await cf(`${projectPath}/domains`);
const deploymentsRes = await cf(`${projectPath}/deployments?env=production&page=1&per_page=20`);
const workersDomainsRes = await cf(`/accounts/${accountId}/workers/domains?hostname=${encodeURIComponent(customDomain)}`);

const projects = Array.isArray(projectsRes?.body?.result) ? projectsRes.body.result : [];
const domainOwners = [];
for (const project of projects) {
  const name = String(project?.name || "").trim();
  if (!name) continue;
  const response = await cf(`/accounts/${accountId}/pages/projects/${encodeURIComponent(name)}/domains`);
  const domains = Array.isArray(response?.body?.result) ? response.body.result : [];
  for (const domain of domains) {
    if (String(domain?.name || "").toLowerCase() === customDomain) {
      domainOwners.push({ project: name, name: domain?.name || "", status: domain?.status || "" });
    }
  }
}

const workerDomains = Array.isArray(workersDomainsRes?.body?.result)
  ? workersDomainsRes.body.result
      .filter((row) => String(row?.hostname || "").toLowerCase() === customDomain)
      .map((row) => ({
        id: row?.id || "",
        hostname: row?.hostname || "",
        service: row?.service || "",
        environment: row?.environment || "",
      }))
  : [];

const targetDomains = Array.isArray(domainsRes?.body?.result)
  ? domainsRes.body.result.map((row) => ({ name: row?.name || "", status: row?.status || "" }))
  : [];

const deployments = Array.isArray(deploymentsRes?.body?.result) ? deploymentsRes.body.result : [];
const latest = deployments[0] || {};

const auditResult = {
  mode,
  productionBranch: projectRes?.body?.result?.production_branch || "",
  latest: {
    id: latest?.id || "",
    url: latest?.url || "",
    branch: latest?.deployment_trigger?.metadata?.branch || "",
    environment: latest?.environment || "",
    aliases: Array.isArray(latest?.aliases) ? latest.aliases : [],
  },
  targetDomains,
  domainOwners,
  workerDomains,
  apiErrors: {
    project: projectRes?.body?.errors || [],
    domains: domainsRes?.body?.errors || [],
    deployments: deploymentsRes?.body?.errors || [],
    workersDomains: workersDomainsRes?.body?.errors || [],
  },
};

console.log(`PAGES_DOMAIN_AUDIT_JSON=${JSON.stringify(auditResult)}`);

if (mode === "pages-domain-audit") {
  console.error("PAGES_DOMAIN_AUDIT_STOP=Denetim tamamlandı; canlı değişiklik yapılmadı.");
  process.exit(1);
}

if (!projectRes.ok || projectRes?.body?.success !== true) {
  console.error(`PAGES_DOMAIN_REPAIR_ERROR=Pages projesi okunamadı: ${JSON.stringify(projectRes.body)}`);
  process.exit(1);
}

if (workerDomains.length > 0) {
  console.error(`PAGES_DOMAIN_REPAIR_ERROR=${customDomain} bir Worker custom domainine bağlı: ${JSON.stringify(workerDomains)}`);
  process.exit(1);
}

const conflictingPagesOwners = domainOwners.filter((row) => row.project !== projectName);
if (conflictingPagesOwners.length > 0) {
  console.error(`PAGES_DOMAIN_REPAIR_ERROR=${customDomain} başka Pages projesine bağlı: ${JSON.stringify(conflictingPagesOwners)}`);
  process.exit(1);
}

let domainState = targetDomains.find((row) => String(row.name).toLowerCase() === customDomain) || null;
let createResponse = null;

if (!domainState) {
  createResponse = await cf(`${projectPath}/domains`, {
    method: "POST",
    body: JSON.stringify({ name: customDomain }),
  });

  if (!createResponse.ok || createResponse?.body?.success !== true) {
    const refreshed = await cf(`${projectPath}/domains`);
    const refreshedDomains = Array.isArray(refreshed?.body?.result) ? refreshed.body.result : [];
    domainState = refreshedDomains.find((row) => String(row?.name || "").toLowerCase() === customDomain) || null;
    if (!domainState) {
      console.error(`PAGES_DOMAIN_REPAIR_ERROR=Alan adı eklenemedi: ${JSON.stringify(createResponse.body)}`);
      process.exit(1);
    }
  }
}

for (let attempt = 1; attempt <= 60; attempt += 1) {
  const statusResponse = await cf(`${projectPath}/domains/${encodeURIComponent(customDomain)}`);
  const row = statusResponse?.body?.result || domainState || {};
  const status = String(row?.status || "").toLowerCase();
  const validationStatus = String(row?.validation_data?.status || "").toLowerCase();
  const verificationStatus = String(row?.verification_data?.status || "").toLowerCase();

  console.log(`PAGES_DOMAIN_REPAIR_POLL=${JSON.stringify({ attempt, status, validationStatus, verificationStatus })}`);

  if (status === "active") {
    console.log(`PAGES_DOMAIN_REPAIR_JSON=${JSON.stringify({
      ok: true,
      project: projectName,
      domain: customDomain,
      status,
      created: Boolean(createResponse),
      productionBranch: projectRes?.body?.result?.production_branch || "",
    })}`);
    process.exit(0);
  }

  if (["failed", "error"].includes(status) || ["failed", "error"].includes(validationStatus)) {
    console.error(`PAGES_DOMAIN_REPAIR_ERROR=Alan adı doğrulaması başarısız: ${JSON.stringify(row)}`);
    process.exit(1);
  }

  if (attempt < 60) {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
}

console.error(`PAGES_DOMAIN_REPAIR_ERROR=${customDomain} 300 saniye içinde active olmadı.`);
process.exit(1);
