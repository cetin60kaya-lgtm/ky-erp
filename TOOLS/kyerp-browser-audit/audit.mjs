import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright-core';

const baseUrl = process.env.KYERP_BASE_URL || 'https://kyerp.net';
const apiBase = process.env.KYERP_API_URL || 'https://api.kyerp.net/api';
const chromePath = process.env.KYERP_CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outDir = path.resolve('TOOLS/kyerp-browser-audit/results');
const viewports = [
  { name: 'desktop-1920', width: 1920, height: 1080 },
  { name: 'laptop-1366', width: 1366, height: 768 },
  { name: 'tablet-768', width: 768, height: 1024 },
];

await fs.mkdir(outDir, { recursive: true });
const report = {
  startedAt: new Date().toISOString(),
  baseUrl,
  apiBase,
  host: process.env.COMPUTERNAME || '',
  publicSmoke: {},
  screens: [],
  consoleErrors: [],
  pageErrors: [],
  failedRequests: [],
  serverErrors: [],
  authenticatedAudit: { attempted: false, reason: 'Test hesabı henüz yapılandırılmadı.' },
};

try {
  const health = await fetch(`${apiBase}/health`, { headers: { accept: 'application/json' } });
  report.publicSmoke.apiHealth = { status: health.status, ok: health.ok, body: await health.text() };
} catch (error) {
  report.publicSmoke.apiHealth = { status: 0, ok: false, error: String(error?.message || error) };
}

const browser = await chromium.launch({ executablePath: chromePath, headless: true, args: ['--disable-dev-shm-usage'] });
try {
  for (const vp of viewports) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: 'tr-TR' });
    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') report.consoleErrors.push({ viewport: vp.name, text: msg.text() });
    });
    page.on('pageerror', (error) => report.pageErrors.push({ viewport: vp.name, text: String(error?.message || error) }));
    page.on('requestfailed', (req) => report.failedRequests.push({ viewport: vp.name, url: req.url(), failure: req.failure()?.errorText || '' }));
    page.on('response', (response) => {
      if (response.status() >= 500) report.serverErrors.push({ viewport: vp.name, status: response.status(), url: response.url() });
    });

    const started = Date.now();
    const response = await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 45000 });
    const file = path.join(outDir, `${vp.name}-landing.png`);
    await page.screenshot({ path: file, fullPage: true });
    report.screens.push({ viewport: vp, status: response?.status() || 0, ms: Date.now() - started, title: await page.title(), file });
    await context.close();
  }
} finally {
  await browser.close();
}

report.finishedAt = new Date().toISOString();
report.ok = Boolean(report.publicSmoke.apiHealth?.ok) && report.serverErrors.length === 0 && report.pageErrors.length === 0;
await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 2;
