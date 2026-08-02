import { readFile } from "node:fs/promises";
import path from "node:path";

const releasePath = path.resolve(process.cwd(), "../../../RELEASES/kyerp-production-release.json");
let release = {};
try {
  release = JSON.parse(await readFile(releasePath, "utf8"));
} catch {
  release = {};
}

if (release?.mode !== "pages-domain-audit") {
  process.exit(0);
}

const token = String(process.env.CLOUDFLARE_API_TOKEN || "").trim();
const accountId = String(process.env.CLOUDFLARE_ACCOUNT_ID || "ab49b099fee10183fa65951e5077d14a").trim();
const projectName = "ky-erp-frontend";
const customDomain = "kyerp.net";

if (!token) {
  console.error("PAGES_DOMAIN_AUDIT_ERROR=CLOUDFLARE_API_TOKEN eksik");
  process.exit(1);
}

async function cf(pathname) {
  const url = `https://api.cloudflare.com/client/v4${pathname}`;
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 500) };
    }
    return { httpStatus: response.status, ok: response.ok, body };
  } catch (error) {
    return { httpStatus: 0, ok: false, body: { error: error?.message || String(error) } };
  }
}

async function publicHtml(url) {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
    const html = await response.text();
    const title = html.match(/<title>([^<]*)<\/title>/i)?.[1] || "";
    const script = html.match(/<script[^>]+src=["']([^"']+)["']/i)?.[1] || "";
    return {
      httpStatus: response.status,
      finalUrl: response.url,
      title,
      script,
      bytes: html.length,
    };
  } catch (error) {
    return { httpStatus: 0, finalUrl: url, title: "", script: "", bytes: 0, error: error?.message || String(error) };
  }
}

const projectsRes = await cf(`/accounts/${accountId}/pages/projects`);
const projectRes = await cf(`/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}`);
const domainsRes = await cf(`/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}/domains`);
const deploymentsRes = await cf(`/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}/deployments?env=production&page=1&per_page=20`);

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

const deployments = Array.isArray(deploymentsRes?.body?.result) ? deploymentsRes.body.result : [];
const latest = deployments[0] || {};
const latestUrl = String(latest?.url || "").trim();

const zonesRes = await cf(`/zones?name=${encodeURIComponent(customDomain)}`);
const zones = Array.isArray(zonesRes?.body?.result) ? zonesRes.body.result : [];
const zoneId = String(zones[0]?.id || "");
const dnsRes = zoneId
  ? await cf(`/zones/${zoneId}/dns_records?name=${encodeURIComponent(customDomain)}&page=1&per_page=100`)
  : { httpStatus: 0, ok: false, body: { result: [] } };
const dnsRows = Array.isArray(dnsRes?.body?.result) ? dnsRes.body.result : [];

const targetDomains = Array.isArray(domainsRes?.body?.result)
  ? domainsRes.body.result.map((row) => ({ name: row?.name || "", status: row?.status || "" }))
  : [];

const result = {
  accountId,
  projectApi: { httpStatus: projectRes.httpStatus, success: Boolean(projectRes?.body?.success) },
  productionBranch: projectRes?.body?.result?.production_branch || "",
  latest: {
    id: latest?.id || "",
    url: latestUrl,
    environment: latest?.environment || "",
    branch: latest?.deployment_trigger?.metadata?.branch || "",
    aliases: Array.isArray(latest?.aliases) ? latest.aliases : [],
    createdOn: latest?.created_on || "",
    latestStage: latest?.latest_stage || null,
  },
  targetDomains,
  domainOwners,
  liveHtml: await publicHtml(`https://${customDomain}/`),
  latestHtml: latestUrl ? await publicHtml(`${latestUrl.replace(/\/$/, "")}/`) : null,
  dnsApi: { httpStatus: dnsRes.httpStatus, success: Boolean(dnsRes?.body?.success) },
  dns: dnsRows.map((row) => ({
    id: row?.id || "",
    type: row?.type || "",
    name: row?.name || "",
    content: row?.content || "",
    proxied: Boolean(row?.proxied),
  })),
  apiErrors: {
    projects: projectsRes?.body?.errors || [],
    project: projectRes?.body?.errors || [],
    domains: domainsRes?.body?.errors || [],
    deployments: deploymentsRes?.body?.errors || [],
    zones: zonesRes?.body?.errors || [],
    dns: dnsRes?.body?.errors || [],
  },
};

console.log(`PAGES_DOMAIN_AUDIT_JSON=${JSON.stringify(result)}`);
console.error("PAGES_DOMAIN_AUDIT_STOP=Denetim modu tamamlandı; canlı değişiklik yapılmadan yayın durduruldu.");
process.exit(1);
