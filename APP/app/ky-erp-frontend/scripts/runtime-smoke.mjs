import { writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = String(process.env.SMOKE_URL || "http://127.0.0.1:4173").replace(/\/$/, "");
const baseOrigin = new URL(baseUrl).origin;
const targetUrl = `${baseUrl}/boyahane/is-akisi?runtime-smoke=1`;
const expectedMenuLabels = [
  "Ana Ekran",
  "Numune Çalışmaları",
  "İmalat Boyaları",
  "Kayıtlı Renkler",
  "Stok, Lot ve Ürünler",
  "Raporlar ve İşlem Logları",
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const runtimeErrors = [];
const runtimeWarnings = [];
let result = null;

page.on("pageerror", (error) => runtimeErrors.push(`PAGE_ERROR: ${error.message}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const text = message.text();
  if (/^Failed to load resource:/i.test(text)) {
    runtimeWarnings.push(`CONSOLE_RESOURCE_WARNING: ${text}`);
    return;
  }
  runtimeErrors.push(`CONSOLE_ERROR: ${text}`);
});
page.on("response", (response) => {
  if (response.status() < 400) return;
  const url = response.url();
  const entry = `HTTP_${response.status()}: ${response.request().method()} ${url}`;
  let origin = "";
  try {
    origin = new URL(url).origin;
  } catch {
    origin = "";
  }

  if (origin === baseOrigin && /\.(?:js|css|mjs|json|wasm)(?:\?|$)/i.test(url)) {
    runtimeErrors.push(entry);
  } else {
    runtimeWarnings.push(entry);
  }
});
page.on("requestfailed", (request) => {
  const url = request.url();
  let origin = "";
  try {
    origin = new URL(url).origin;
  } catch {
    origin = "";
  }
  const entry = `REQUEST_FAILED: ${request.method()} ${url} ${request.failure()?.errorText || ""}`;
  if (origin === baseOrigin) runtimeErrors.push(entry);
  else runtimeWarnings.push(entry);
});

try {
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(1_500);

  const root = page.locator("#root");
  const rootHtmlBeforeLogin = await root.innerHTML().catch(() => "");
  if (!rootHtmlBeforeLogin.trim()) runtimeErrors.push("ROOT_EMPTY_BEFORE_LOGIN");

  const username = page.locator('input[name="username"], input[autocomplete="username"]');
  const password = page.locator('input[name="password"], input[type="password"]');
  const loginButton = page.getByRole("button", { name: /giriş yap/i });

  if (await loginButton.isVisible().catch(() => false)) {
    await username.fill("admin");
    await password.fill("2582");
    await loginButton.click();
    await page.waitForTimeout(2_000);
  }

  const bodyText = await page.locator("body").innerText().catch(() => "");
  const missingLabels = expectedMenuLabels.filter((label) => !bodyText.includes(label));
  if (missingLabels.length) runtimeErrors.push(`MISSING_MENU_LABELS: ${missingLabels.join(", ")}`);

  const rootHtmlAfterLogin = await root.innerHTML().catch(() => "");
  if (!rootHtmlAfterLogin.trim()) runtimeErrors.push("ROOT_EMPTY_AFTER_LOGIN");

  await page.screenshot({ path: "runtime-smoke.png", fullPage: true });

  result = {
    ok: runtimeErrors.length === 0,
    targetUrl,
    title: await page.title(),
    finalUrl: page.url(),
    bodyPreview: bodyText.slice(0, 1_500),
    runtimeErrors: [...new Set(runtimeErrors)],
    runtimeWarnings: [...new Set(runtimeWarnings)],
  };
} catch (error) {
  runtimeErrors.push(`SMOKE_EXCEPTION: ${error?.stack || error?.message || String(error)}`);
  result = {
    ok: false,
    targetUrl,
    title: await page.title().catch(() => ""),
    finalUrl: page.url(),
    bodyPreview: await page.locator("body").innerText().catch(() => ""),
    runtimeErrors: [...new Set(runtimeErrors)],
    runtimeWarnings: [...new Set(runtimeWarnings)],
  };
} finally {
  await writeFile("runtime-result.json", `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
}

if (!result?.ok) process.exitCode = 1;
