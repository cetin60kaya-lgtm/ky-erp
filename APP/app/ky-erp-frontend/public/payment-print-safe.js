(() => {
  const STYLE_ID = "kyerp-payment-safe-style";
  const ROOT_ID = "kyerp-payment-safe-root";
  const SLIP_STYLE_ID = "kyerp-payment-slip-style";

  const txt = (node) => String(node?.textContent || "").replace(/\s+/g, " ").trim();
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

  function paymentScreen() {
    return [...document.querySelectorAll(".kyik-screen")].find((node) => txt(node).includes("Günlük Ödeme Fişleri"));
  }

  function ensureLabels() {
    if (!location.pathname.includes("/gunluk-operasyon/odeme-fisleri")) return;
    const screen = paymentScreen();
    if (!screen) return;
    [...screen.querySelectorAll("button")].forEach((button) => {
      const t = txt(button);
      if (t === "A4 Önizle") {
        button.dataset.kyerpSafePrint = "summary";
        const span = button.querySelector("span:last-child");
        if (span) span.textContent = "Haftalık Ödeme Özeti";
        else button.textContent = "Haftalık Ödeme Özeti";
      } else if (t === "Haftalık Ödeme Özeti") {
        button.dataset.kyerpSafePrint = "summary";
      }

      if (t === "Yazdır" || t === "Fişleri Yazdır") {
        button.dataset.kyerpSafePrint = "slips";
        const span = button.querySelector("span:last-child");
        if (span) span.textContent = "Ödeme Fişleri · A4 10 Kişi";
        else button.textContent = "Ödeme Fişleri · A4 10 Kişi";
      } else if (t === "Ödeme Fişleri · A4 10 Kişi") {
        button.dataset.kyerpSafePrint = "slips";
      }
    });
  }

  function range() {
    const inputs = [...(paymentScreen()?.querySelectorAll('input[type="date"]') || [])];
    return { start: inputs[0]?.value || "", end: inputs[1]?.value || "" };
  }

  function readRows() {
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

  function cleanupSummary() {
    document.getElementById(ROOT_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
  }

  function printSummary() {
    const rows = readRows();
    if (!rows.length) return;
    const r = range();
    let dc = 0, nc = 0, da = 0, na = 0, total = 0;
    const body = rows.map((row, index) => {
      dc += row.dayCount; nc += row.nightCount; da += row.dayAmount; na += row.nightAmount; total += row.total;
      return `<tr><td>${index + 1}</td><td class="left">${esc(row.name)}</td><td class="left">${esc(row.role || "-")}</td><td>${row.dayCount}</td><td class="money">${esc(money(row.dayAmount))}</td><td>${row.nightCount}</td><td class="money">${esc(money(row.nightAmount))}</td><td>${row.dayCount + row.nightCount}</td><td class="money">${esc(money(row.total))}</td></tr>`;
    }).join("");

    const root = document.createElement("section");
    root.id = ROOT_ID;
    root.innerHTML = `<div class="title">HAFTALIK ÖDEME ÖZETİ</div><div class="sub">${esc(r.start)} — ${esc(r.end)}</div><table><thead><tr><th>#</th><th class="left">Personel</th><th class="left">Vasıf</th><th>Gündüz Gün</th><th>Gündüz Tutar</th><th>Gece Gün</th><th>Gece Tutar</th><th>Toplam Gün</th><th>Ödenecek</th></tr></thead><tbody>${body}</tbody><tfoot><tr><td colspan="3" class="left">GENEL TOPLAM</td><td>${dc}</td><td class="money">${esc(money(da))}</td><td>${nc}</td><td class="money">${esc(money(na))}</td><td>${dc + nc}</td><td class="money">${esc(money(total))}</td></tr></tfoot></table>`;
    document.body.appendChild(root);

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `@media print{
      @page{size:A4 landscape;margin:6mm}
      body *{visibility:hidden!important}
      .printable{display:none!important;visibility:hidden!important}
      #${ROOT_ID},#${ROOT_ID} *{visibility:visible!important}
      #${ROOT_ID}{display:block!important;position:absolute!important;left:0!important;top:0!important;width:100%!important;background:#fff!important;color:#111!important;font-family:Arial,Helvetica,sans-serif!important}
      #${ROOT_ID} .title{text-align:center;font-size:14px;font-weight:900;margin-bottom:2px}
      #${ROOT_ID} .sub{text-align:center;font-size:9px;font-weight:700;margin-bottom:6px}
      #${ROOT_ID} table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9px}
      #${ROOT_ID} th,#${ROOT_ID} td{border:1px solid #111;padding:3px 4px;text-align:center}
      #${ROOT_ID} .left{text-align:left!important}
      #${ROOT_ID} .money{white-space:nowrap;font-weight:800}
      #${ROOT_ID} tfoot td{font-weight:900;background:#f8fafc!important}
    }`;
    document.head.appendChild(style);
    window.addEventListener("afterprint", () => setTimeout(cleanupSummary, 100), { once: true });
    setTimeout(() => window.print(), 80);
  }

  function printSlips() {
    const printable = document.querySelector(".printable.daily-print");
    if (!printable) return;
    document.getElementById(SLIP_STYLE_ID)?.remove();
    const style = document.createElement("style");
    style.id = SLIP_STYLE_ID;
    style.textContent = `@media print{
      @page{size:A4 portrait;margin:6mm}
      body *{visibility:hidden!important}
      .printable:not(.daily-print){display:none!important;visibility:hidden!important}
      .printable.daily-print,.printable.daily-print *{visibility:visible!important}
      .printable.daily-print{display:block!important;position:absolute!important;left:0!important;top:0!important;width:198mm!important;max-width:198mm!important;margin:0!important;padding:0!important;border:0!important;box-shadow:none!important;background:#fff!important}
      .printable.daily-print>.kyik-panel-head,.daily-control-page,.daily-slip-page-summary{display:none!important}
      .daily-print-page{display:block!important;width:198mm!important;height:277mm!important;min-height:277mm!important;max-height:277mm!important;overflow:hidden!important;box-sizing:border-box!important;page-break-after:always!important;break-after:page!important}
      .daily-print-page:last-child{page-break-after:auto!important;break-after:auto!important}
      .daily-print-title{font-size:11px!important;line-height:1!important;margin:0 0 .4mm!important;text-align:center!important}
      .daily-print-subtitle{font-size:7px!important;line-height:1!important;margin:0 0 1mm!important;text-align:center!important}
      .daily-slip-print-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;grid-template-rows:repeat(5,50mm)!important;gap:2mm 5mm!important;width:198mm!important;align-content:start!important;box-sizing:border-box!important}
      .daily-slip-card{display:flex!important;flex-direction:column!important;height:50mm!important;min-height:50mm!important;max-height:50mm!important;margin:0!important;padding:1.5mm 3mm!important;box-sizing:border-box!important;border:1.2px dashed #111!important;background:#fff!important;color:#111!important;overflow:hidden!important;break-inside:avoid!important;page-break-inside:avoid!important}
      .daily-slip-card h4{font-size:8px!important;margin:0 0 .4mm!important;text-align:center!important}
      .daily-slip-card>strong{font-size:13px!important;line-height:1.05!important;text-align:center!important;margin:0 0 .4mm!important;text-transform:uppercase!important}
      .daily-slip-card>span,.daily-slip-card>b{font-size:7.5px!important;margin:.2mm 0!important}
      .daily-slip-card table{width:100%!important;border-collapse:collapse!important;font-size:7.7px!important}
      .daily-slip-card th,.daily-slip-card td{border:1px solid #111!important;padding:1px 2px!important}
      .daily-slip-note{display:none!important}
      .daily-slip-total{display:flex!important;justify-content:space-between!important;align-items:flex-end!important;margin-top:auto!important;padding-top:.7mm!important;border-top:1.2px solid #111!important}
      .daily-slip-total span{font-size:8px!important;font-weight:800!important}
      .daily-slip-total strong{font-size:20px!important;line-height:1!important;color:#111!important}
    }`;
    document.head.appendChild(style);
    window.addEventListener("afterprint", () => setTimeout(() => style.remove(), 100), { once: true });
    setTimeout(() => window.print(), 80);
  }

  document.addEventListener("click", (event) => {
    if (!location.pathname.includes("/gunluk-operasyon/odeme-fisleri")) return;
    const button = event.target?.closest?.("button");
    if (!button) return;
    const t = txt(button);
    if (button.dataset.kyerpSafePrint === "summary" || t === "Haftalık Ödeme Özeti" || t === "A4 Önizle") {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      printSummary();
      return;
    }
    if (button.dataset.kyerpSafePrint === "slips" || t === "Ödeme Fişleri · A4 10 Kişi" || t === "Fişleri Yazdır" || t === "Yazdır") {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      printSlips();
    }
  }, true);

  setInterval(ensureLabels, 700);
  window.addEventListener("pageshow", ensureLabels);
  window.addEventListener("popstate", ensureLabels);
  ensureLabels();
})();
