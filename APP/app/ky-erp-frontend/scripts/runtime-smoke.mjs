import { chromium } from "playwright";

const baseUrl = String(process.env.SMOKE_URL || "http://127.0.0.1:4173").replace(/\/$/, "");
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

page.on("pageerror", (error) => runtimeErrors.push(`PAGE_ERROR: ${error.message}`));
page.on("console", (message) => {
  if (message.type() === "error") runtimeErrors.push(`CONSOLE_ERROR: ${message.text()}`);
});
page.on("requestfailed", (request) => {
  const url = request.url();
  if (url.startsWith(baseUrl)) {
    runtimeErrors.push(`REQUEST_FAILED: ${request.method()} ${url} ${request.failure()?.errorText || ""}`);
  }
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

  console.log(JSON.stringify({
    ok: runtimeErrors.length === 0,
    targetUrl,
    title: await page.title(),
    finalUrl: page.url(),
    bodyPreview: bodyText.slice(0, 1_500),
    runtimeErrors,
  }, null, 2));

  if (runtimeErrors.length) process.exitCode = 1;
} finally {
  await browser.close();
}
