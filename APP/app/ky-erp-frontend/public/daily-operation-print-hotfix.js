(() => {
  const ROOT_ID = "kyerp-hotfix-print-root";
  const STYLE_ID = "kyerp-hotfix-print-style";
  const SLIP_STYLE_ID = "kyerp-hotfix-slip-style";
  let busy = false;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const text = (node) => String(node?.textContent || "").replace(/\s+/g, " ").trim();
  const esc = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  function parseTRY(value) {
    let raw = String(value ?? "").trim().replace(/[₺\s]/g, "");
    if (!raw) return 0;
    if (raw.includes(",")) raw = raw.replace(/\./g, "").replace(",", ".");
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(raw)) raw = raw.replace(/\./g, "");
    raw = raw.replace(/[^0-9.-]/g, "");
    const number = Number(raw);
    return Number.isFinite(number) ? number : 0;
  }

  function money(value) {
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY",
      maximumFractionDigits: 0,
    }).format(Number(value) || 0);
  }

  function notice(message, error = false) {
    document.getElementById("kyerp-hotfix-notice")?.remove();
    const node = document.createElement("div");
    node.id = "kyerp-hotfix-notice";
    node.style.cssText = `position:fixed;z-index:100000;right:18px;top:76px;padding:12px 14px;border-radius:8px;font:700 13px Segoe UI,Arial,sans-serif;box-shadow:0 8px 24px rgba(15,23,42,.16);${error ? "background:#fff7ed;color:#9a3412;border:1px solid #fed7aa" : "background:#ecfdf5;color:#166534;border:1px solid #86efac"}`;
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 4500);
  }

  function cleanupCustom() {
    document.getElementById(ROOT_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    busy = false;
  }

  function printHtml(html, landscape = true) {
    document.getElementById(ROOT_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID}{display:none}
      @media print{
        @page{size:A4 ${landscape ? "landscape" : "portrait"};margin:6mm}
        html,body{margin:0!important;padding:0!important;height:auto!important;overflow:visible!important}
        body *{visibility:hidden!important}
        #${ROOT_ID},#${ROOT_ID} *{visibility:visible!important}
        #${ROOT_ID}{display:block!important;position:absolute!important;left:0!important;top:0!important;width:100%!important;background:#fff!important;color:#111!important;font-family:Arial,Helvetica,sans-serif!important}
        #${ROOT_ID} .title{text-align:center;font-size:14px;font-weight:900;margin:0 0 2px}
        #${ROOT_ID} .sub{text-align:center;font-size:9px;font-weight:700;margin:0 0 6px}
        #${ROOT_ID} table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9px}
        #${ROOT_ID} th,#${ROOT_ID} td{border:1px solid #111;padding:3px 4px;text-align:center;line-height:1.15}
        #${ROOT_ID} th{background:#eef2f7!important;font-weight:900}
        #${ROOT_ID} .left{text-align:left!important}
        #${ROOT_ID} .money{white-space:nowrap;font-weight:800}
        #${ROOT_ID} tfoot td{font-weight:900;background:#f8fafc!important}
        #${ROOT_ID} tbody tr{break-inside:avoid!important;page-break-inside:avoid!important}
        #${ROOT_ID} .foot{display:flex;justify-content:space-between;margin-top:5px;font-size:8px;font-weight:700}
      }
    `;
    document.head.appendChild(style);
    const root = document.createElement("section");
    root.id = ROOT_ID;
    root.innerHTML = html;
    document.body.appendChild(root);
    window.addEventListener("afterprint", () => setTimeout(cleanupCustom, 100), { once: true });
    setTimeout(() => window.print(), 100);
  }

  function getPaymentScreen() {
    return [...document.querySelectorAll(".kyik-screen")].find((node) => text(node).includes("Günlük Ödeme Fişleri"));
  }

  function paymentRange() {
    const screen = getPaymentScreen();
    const inputs = [...(screen?.querySelectorAll('input[type="date"]') || [])];
    return { start: inputs[0]?.value || "", end: inputs[1]?.value || "" };
  }

  function readPaymentRows() {
    return [...document.querySelectorAll(".kyik-slip-grid .kyik-slip")].map((card) => {
      const name = card.querySelector(".kyik-slip-head strong")?.textContent?.trim() || "Personel";
      const role = [...card.children].find((node) => node.tagName === "SPAN")?.textContent?.trim() || "";
      const lines = [...card.querySelectorAll(".kyik-slip-line")];
      const dayText = lines[0]?.querySelector("b")?.textContent || "0 · ₺0";
      const nightText = lines[1]?.querySelector("b")?.textContent || "0 · ₺0";
      const totalText = lines.find((line) => line.classList.contains("total"))?.querySelector("b")?.textContent || "₺0";
      const [dayCountRaw, dayAmountRaw] = dayText.split("·");
      const [nightCountRaw, nightAmountRaw] = nightText.split("·");
      return {
        name,
        role,
        dayCount: Number(String(dayCountRaw || "0").trim()) || 0,
        dayAmount: parseTRY(dayAmountRaw),
        nightCount: Number(String(nightCountRaw || "0").trim()) || 0,
        nightAmount: parseTRY(nightAmountRaw),
        total: parseTRY(totalText),
      };
    });
  }

  function printWeeklyPaymentSummary() {
    const rows = readPaymentRows();
    if (!rows.length) return notice("Haftalık ödeme özetinde personel bulunamadı.", true);
    const range = paymentRange();
    let dc = 0, nc = 0, da = 0, na = 0, total = 0;
    const body = rows.map((row, index) => {
      dc += row.dayCount;
      nc += row.nightCount;
      da += row.dayAmount;
      na += row.nightAmount;
      total += row.total;
      return `<tr><td>${index + 1}</td><td class="left">${esc(row.name)}</td><td class="left">${esc(row.role || "-")}</td><td>${row.dayCount}</td><td class="money">${esc(money(row.dayAmount))}</td><td>${row.nightCount}</td><td class="money">${esc(money(row.nightAmount))}</td><td>${row.dayCount + row.nightCount}</td><td class="money">${esc(money(row.total))}</td></tr>`;
    }).join("");
    const html = `<div class="title">HAFTALIK ÖDEME ÖZETİ</div><div class="sub">${esc(range.start)} — ${esc(range.end)}</div><table><thead><tr><th>#</th><th class="left">Personel</th><th class="left">Vasıf</th><th>Gündüz Gün</th><th>Gündüz Tutar</th><th>Gece Gün</th><th>Gece Tutar</th><th>Toplam Gün</th><th>Ödenecek</th></tr></thead><tbody>${body}</tbody><tfoot><tr><td colspan="3" class="left">GENEL TOPLAM</td><td>${dc}</td><td class="money">${esc(money(da))}</td><td>${nc}</td><td class="money">${esc(money(na))}</td><td>${dc + nc}</td><td class="money">${esc(money(total))}</td></tr></tfoot></table><div class="foot"><span>Haftalık ödeme ön kontrolü</span><span>${rows.length} personel</span></div>`;
    printHtml(html, true);
  }

  function printPaymentSlips10() {
    const printable = document.querySelector(".printable.daily-print");
    if (!printable) return notice("Ödeme fişi çıktısı bulunamadı.", true);
    document.getElementById(SLIP_STYLE_ID)?.remove();
    const style = document.createElement("style");
    style.id = SLIP_STYLE_ID;
    style.textContent = `
      @media print{
        @page{size:A4 portrait;margin:6mm}
        html,body{margin:0!important;padding:0!important;height:auto!important;overflow:visible!important}
        body *{visibility:hidden!important}
        .printable.daily-print,.printable.daily-print *{visibility:visible!important}
        .printable.daily-print{display:block!important;position:absolute!important;left:0!important;top:0!important;width:198mm!important;max-width:198mm!important;margin:0!important;padding:0!important;border:0!important;box-shadow:none!important;background:#fff!important}
        .printable.daily-print>.kyik-panel-head{display:none!important}
        .daily-control-page,.daily-slip-page-summary{display:none!important}
        .daily-print-page{display:block!important;width:198mm!important;max-width:198mm!important;height:277mm!important;min-height:277mm!important;max-height:277mm!important;margin:0!important;padding:0!important;overflow:hidden!important;box-sizing:border-box!important;page-break-after:always!important;break-after:page!important}
        .daily-print-page:last-child{page-break-after:auto!important;break-after:auto!important}
        .daily-print-title{font-size:12px!important;line-height:1!important;margin:0 0 .5mm!important;text-align:center!important}
        .daily-print-subtitle{font-size:7.5px!important;line-height:1!important;margin:0 0 1.5mm!important;text-align:center!important}
        .daily-slip-print-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;grid-template-rows:repeat(5,50mm)!important;gap:2.2mm 5mm!important;width:198mm!important;align-content:start!important;box-sizing:border-box!important}
        .daily-slip-card{display:flex!important;flex-direction:column!important;width:auto!important;height:50mm!important;min-height:50mm!important;max-height:50mm!important;margin:0!important;padding:1.7mm 3mm!important;box-sizing:border-box!important;border:1.2px dashed #111!important;background:#fff!important;color:#111!important;overflow:hidden!important;page-break-inside:avoid!important;break-inside:avoid!important;font-size:8.4px!important}
        .daily-slip-card h4{font-size:8px!important;margin:0 0 .6mm!important;text-align:center!important}
        .daily-slip-card>strong{font-size:13px!important;line-height:1.05!important;text-align:center!important;margin:0 0 .6mm!important;text-transform:uppercase!important}
        .daily-slip-card>span,.daily-slip-card>b{font-size:7.7px!important;margin:.25mm 0!important}
        .daily-slip-card table{width:100%!important;border-collapse:collapse!important;font-size:7.8px!important}
        .daily-slip-card th,.daily-slip-card td{border:1px solid #111!important;padding:1.1px 2px!important}
        .daily-slip-note{display:none!important}
        .daily-slip-total{display:flex!important;justify-content:space-between!important;align-items:flex-end!important;margin-top:auto!important;padding-top:.8mm!important;border-top:1.2px solid #111!important}
        .daily-slip-total span{font-size:8px!important;font-weight:800!important}
        .daily-slip-total strong{font-size:20px!important;line-height:1!important;color:#111!important}
      }
    `;
    document.head.appendChild(style);
    window.addEventListener("afterprint", () => setTimeout(() => style.remove(), 100), { once: true });
    setTimeout(() => window.print(), 80);
  }

  function modeButton(root, mode) {
    const wanted = mode === "night" ? "GECE GİRİŞİ" : "GÜNDÜZ GİRİŞİ";
    return [...root.querySelectorAll(".kyik-safe-mode button")].find(
      (button) => text(button).toLocaleUpperCase("tr-TR").includes(wanted),
    );
  }

  async function selectMode(root, mode) {
    let button = modeButton(root, mode);
    if (!button) return false;
    if (!button.classList.contains("active")) button.click();
    const started = Date.now();
    while (Date.now() - started < 2200) {
      button = modeButton(root, mode);
      if (button?.classList.contains("active")) break;
      await sleep(40);
    }
    await sleep(180);
    return Boolean(modeButton(root, mode)?.classList.contains("active"));
  }

  async function selectDay(button) {
    if (!button.classList.contains("active")) button.click();
    const started = Date.now();
    while (Date.now() - started < 2200 && !button.classList.contains("active")) await sleep(40);
    await sleep(180);
  }

  function scrapeSelectedRows(root) {
    return [...root.querySelectorAll(".kyik-safe-table-wrap tbody tr.kyik-safe-row.selected-entry")].map((row) => {
      const name = row.querySelector(".kyik-safe-name-title strong")?.textContent?.trim() || row.querySelector("td strong")?.textContent?.trim() || "Personel";
      const noNode = [...row.querySelectorAll(".kyik-safe-name-row > small")].find((node) => !node.classList.contains("kyik-safe-entry-status"));
      return {
        key: noNode?.textContent?.trim() || name,
        no: noNode?.textContent?.trim() || "",
        name,
        role: row.cells?.[1]?.textContent?.trim() || "",
        dayRate: parseTRY(row.cells?.[3]?.textContent || ""),
        nightRate: parseTRY(row.cells?.[4]?.textContent || ""),
      };
    });
  }

  function isoFromDateInput(root, index) {
    return [...root.querySelectorAll(".kyik-safe-actions input[type=date]")][index]?.value || "";
  }

  function addDaysIso(iso, amount) {
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return iso;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    d.setDate(d.getDate() + amount);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function dayHeader(iso) {
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return esc(iso);
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    const wd = new Intl.DateTimeFormat("tr-TR", { weekday: "short" }).format(d).replace(".", "").toLocaleUpperCase("tr-TR");
    return `${wd}<br>${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  async function printWeeklyEntry() {
    if (busy) return;
    busy = true;
    const root = document.querySelector(".kyik-safe-daily");
    if (!root) { busy = false; return notice("Günlük giriş ekranı bulunamadı.", true); }
    const days = [...root.querySelectorAll(".kyik-safe-days > button")].slice(0, 5);
    const start = isoFromDateInput(root, 0);
    const end = isoFromDateInput(root, 1);
    const originalDay = Math.max(0, days.findIndex((b) => b.classList.contains("active")));
    const originalMode = modeButton(root, "night")?.classList.contains("active") ? "night" : "day";
    const people = new Map();
    notice("Gündüz + gece haftalık liste hazırlanıyor...");
    try {
      for (let i = 0; i < days.length; i += 1) {
        await selectDay(days[i]);
        for (const mode of ["day", "night"]) {
          if (!(await selectMode(root, mode))) continue;
          for (const p of scrapeSelectedRows(root)) {
            const cur = people.get(p.key) || { ...p, shifts: Array.from({ length: days.length }, () => ({ day: false, night: false })) };
            cur.name = p.name || cur.name;
            cur.no = p.no || cur.no;
            cur.role = p.role || cur.role;
            cur.dayRate = p.dayRate || cur.dayRate || 0;
            cur.nightRate = p.nightRate || cur.nightRate || 0;
            cur.shifts[i][mode] = true;
            people.set(p.key, cur);
          }
        }
      }
    } finally {
      await selectDay(days[originalDay] || days[0]);
      await selectMode(root, originalMode);
    }
    const list = [...people.values()].sort((a, b) => String(a.role).localeCompare(String(b.role), "tr") || String(a.name).localeCompare(String(b.name), "tr"));
    let gCount = 0, nCount = 0, gAmount = 0, nAmount = 0;
    const dateHeaders = days.map((_, i) => `<th colspan="2">${dayHeader(addDaysIso(start, i))}</th>`).join("");
    const shiftHeaders = days.map(() => "<th>G</th><th>N</th>").join("");
    const body = list.map((p, index) => {
      let gc = 0, nc = 0;
      const marks = p.shifts.map((s) => { if (s.day) gc++; if (s.night) nc++; return `<td>${s.day ? "✓" : ""}</td><td>${s.night ? "✓" : ""}</td>`; }).join("");
      const ga = gc * (p.dayRate || 0), na = nc * (p.nightRate || 0);
      gCount += gc; nCount += nc; gAmount += ga; nAmount += na;
      return `<tr><td>${index + 1}</td><td>${esc(p.no || "-")}</td><td class="left">${esc(p.name)}</td><td class="left">${esc(p.role || "-")}</td><td class="money">${esc(money(p.dayRate))}</td><td class="money">${esc(money(p.nightRate))}</td>${marks}<td>${gc}</td><td class="money">${esc(money(ga))}</td><td>${nc}</td><td class="money">${esc(money(na))}</td><td class="money">${esc(money(ga + na))}</td></tr>`;
    }).join("");
    const html = `<div class="title">HAFTALIK PERSONEL KONTROL LİSTESİ</div><div class="sub">${esc(start)} — ${esc(end)}</div><table><thead><tr><th rowspan="2">#</th><th rowspan="2">No</th><th rowspan="2" class="left">Personel</th><th rowspan="2" class="left">Vasıf</th><th rowspan="2">Gündüz Ücret</th><th rowspan="2">Gece Ücret</th>${dateHeaders}<th colspan="5">HAFTA TOPLAMI</th></tr><tr>${shiftHeaders}<th>G Gün</th><th>G Tutar</th><th>N Gün</th><th>N Tutar</th><th>Genel</th></tr></thead><tbody>${body}</tbody><tfoot><tr><td colspan="${6 + days.length * 2}" class="left">GENEL TOPLAM</td><td>${gCount}</td><td class="money">${esc(money(gAmount))}</td><td>${nCount}</td><td class="money">${esc(money(nAmount))}</td><td class="money">${esc(money(gAmount + nAmount))}</td></tr></tfoot></table><div class="foot"><span>G: Gündüz · N: Gece</span><span>${list.length} personel</span></div>`;
    notice(`Hazır: G ${gCount} / N ${nCount}. Yazdırma açılıyor...`);
    printHtml(html, true);
  }

  function ensurePaymentButtons() {
    if (!location.pathname.includes("/gunluk-operasyon/odeme-fisleri")) return;
    const screen = getPaymentScreen();
    if (!screen) return;
    [...screen.querySelectorAll("button")].forEach((button) => {
      const t = text(button);
      if (["A4 Önizle", "Haftalık Ödeme Özeti"].includes(t)) {
        button.dataset.kyerpHotfix = "summary";
        const span = button.querySelector("span:last-child");
        if (span) span.textContent = "Haftalık Ödeme Özeti";
        else button.textContent = "Haftalık Ödeme Özeti";
      }
      if (["Yazdır", "Fişleri Yazdır", "Ödeme Fişleri · A4 10 Kişi"].includes(t)) {
        button.dataset.kyerpHotfix = "slips";
        const span = button.querySelector("span:last-child");
        if (span) span.textContent = "Ödeme Fişleri · A4 10 Kişi";
        else button.textContent = "Ödeme Fişleri · A4 10 Kişi";
      }
    });
  }

  function intercept(event) {
    const button = event.target?.closest?.("button");
    if (!button) return;
    const t = text(button);
    if (location.pathname.includes("/gunluk-operasyon/gunluk-giris") && button.closest(".kyik-safe-daily") && t === "Haftalık Liste Yazdır") {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      printWeeklyEntry();
      return;
    }
    if (location.pathname.includes("/gunluk-operasyon/odeme-fisleri")) {
      if (button.dataset.kyerpHotfix === "summary" || t === "Haftalık Ödeme Özeti" || t === "A4 Önizle") {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
        printWeeklyPaymentSummary();
        return;
      }
      if (button.dataset.kyerpHotfix === "slips" || t === "Ödeme Fişleri · A4 10 Kişi" || t === "Fişleri Yazdır" || t === "Yazdır") {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
        printPaymentSlips10();
      }
    }
  }

  document.addEventListener("click", intercept, true);
  const observer = new MutationObserver(ensurePaymentButtons);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("pageshow", ensurePaymentButtons);
  window.addEventListener("popstate", ensurePaymentButtons);
  ensurePaymentButtons();
})();
