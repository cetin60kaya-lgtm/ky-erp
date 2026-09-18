(() => {
  const RANGE_KEY = "ikDailyDateRange.v2";
  const SELECTED_DATE_KEY = "ikDailySelectedDate.v2";
  const BUTTON_ID = "kyerp-current-work-week";
  const PRINT_ROOT_ID = "kyerp-direct-print-root";
  const PRINT_STYLE_ID = "kyerp-direct-print-style";
  const SLIP_STYLE_ID = "kyerp-slip-print-style";
  let printBusy = false;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const pad = (value) => String(value).padStart(2, "0");

  function normalizedText(node) {
    return String(node?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function dateOnly(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function parseDateOnly(value) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  function addDays(value, amount) {
    const date = parseDateOnly(value);
    if (!date) return "";
    date.setDate(date.getDate() + amount);
    return dateOnly(date);
  }

  function currentWorkWeek() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekday = today.getDay() || 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() + (1 - weekday));
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    const start = dateOnly(monday);
    const end = dateOnly(friday);
    const rawToday = dateOnly(today);
    return { start, end, selected: rawToday >= start && rawToday <= end ? rawToday : end };
  }

  function readRange() {
    try {
      const parsed = JSON.parse(localStorage.getItem(RANGE_KEY) || "null");
      return {
        start: String(parsed?.startDate || parsed?.start || ""),
        end: String(parsed?.endDate || parsed?.end || ""),
      };
    } catch {
      return { start: "", end: "" };
    }
  }

  function writeRange(week) {
    try {
      localStorage.setItem(RANGE_KEY, JSON.stringify({ startDate: week.start, endDate: week.end }));
      const selected = String(localStorage.getItem(SELECTED_DATE_KEY) || "");
      if (selected < week.start || selected > week.end) localStorage.setItem(SELECTED_DATE_KEY, week.selected);
    } catch {}
  }

  function setReactInputValue(input, value) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    descriptor?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const storedAtBoot = readRange();
  if (!storedAtBoot.start || !storedAtBoot.end) writeRange(currentWorkWeek());

  function updateButtonState(button, active) {
    button.dataset.active = active ? "1" : "0";
    button.setAttribute("aria-pressed", active ? "true" : "false");
    button.style.borderColor = active ? "#2563eb" : "#cbd5e1";
    button.style.background = active ? "#eff6ff" : "#ffffff";
    button.style.color = active ? "#1d4ed8" : "#334155";
    button.style.fontWeight = active ? "700" : "600";
  }

  function syncButtonFromInputs(actions, button) {
    const inputs = [...actions.querySelectorAll('input[type="date"]')];
    if (inputs.length < 2) return;
    const week = currentWorkWeek();
    updateButtonState(button, inputs[0].value === week.start && inputs[1].value === week.end);
  }

  function applyCurrentWeek(actions, button) {
    const inputs = [...actions.querySelectorAll('input[type="date"]')];
    if (inputs.length < 2) return;
    const week = currentWorkWeek();
    writeRange(week);
    setReactInputValue(inputs[0], week.start);
    setReactInputValue(inputs[1], week.end);
    setTimeout(() => syncButtonFromInputs(actions, button), 0);
  }

  function ensureButton() {
    const actions = document.querySelector(".kyik-safe-actions");
    if (!actions) return;
    let button = document.getElementById(BUTTON_ID);
    if (!button) {
      button = document.createElement("button");
      button.id = BUTTON_ID;
      button.type = "button";
      button.textContent = "Bu Hafta";
      button.title = "Güncel Pazartesi-Cuma aralığına geç";
      button.style.height = "34px";
      button.style.padding = "0 12px";
      button.style.border = "1px solid #cbd5e1";
      button.style.borderRadius = "7px";
      button.style.cursor = "pointer";
      button.style.whiteSpace = "nowrap";
      const dateBlocks = [...actions.children].filter((child) => child?.querySelector?.('input[type="date"]'));
      const anchor = dateBlocks[dateBlocks.length - 1];
      if (anchor?.nextSibling) actions.insertBefore(button, anchor.nextSibling);
      else actions.appendChild(button);
      button.addEventListener("click", () => applyCurrentWeek(actions, button));
      actions.addEventListener("change", (event) => {
        if (!(event.target instanceof HTMLInputElement) || event.target.type !== "date") return;
        setTimeout(() => syncButtonFromInputs(actions, button), 0);
      });
    }
    syncButtonFromInputs(actions, button);
  }

  function ensurePaymentLabels() {
    if (!location.pathname.includes("/gunluk-operasyon/odeme-fisleri")) return;
    const panel = [...document.querySelectorAll(".kyik-screen")].find((node) => normalizedText(node).includes("Günlük Ödeme Fişleri"));
    if (!panel) return;
    [...panel.querySelectorAll("button")].forEach((button) => {
      const text = normalizedText(button);
      if (text === "A4 Önizle") button.dataset.kyerpPrintMode = "control";
      if (text === "Yazdır") {
        button.dataset.kyerpPrintMode = "slips";
        const spans = button.querySelectorAll("span");
        if (!spans.length) button.textContent = "Fişleri Yazdır";
        else if (normalizedText(button) === "Yazdır") spans[spans.length - 1].textContent = "Fişleri Yazdır";
      }
    });
  }

  function showNotice(message, tone = "ok") {
    document.getElementById("kyerp-print-notice")?.remove();
    const notice = document.createElement("div");
    notice.id = "kyerp-print-notice";
    notice.style.cssText = tone === "ok"
      ? "position:fixed;z-index:99999;right:18px;top:76px;background:#ecfdf5;color:#166534;border:1px solid #86efac;border-radius:8px;padding:12px 14px;font:700 13px Segoe UI,Arial,sans-serif;box-shadow:0 8px 24px rgba(15,23,42,.16)"
      : "position:fixed;z-index:99999;right:18px;top:76px;background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;border-radius:8px;padding:12px 14px;font:700 13px Segoe UI,Arial,sans-serif;box-shadow:0 8px 24px rgba(15,23,42,.16)";
    notice.textContent = message;
    document.body.appendChild(notice);
    setTimeout(() => notice.remove(), 4500);
  }

  async function waitFor(condition, timeout = 1800) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (condition()) return true;
      await sleep(35);
    }
    return false;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function parseTRY(value) {
    let raw = String(value ?? "").trim().replace(/[₺\s]/g, "");
    if (!raw) return 0;
    if (raw.includes(",")) raw = raw.replace(/\./g, "").replace(",", ".");
    else if (/^-?\d{1,3}(\.\d{3})+$/.test(raw)) raw = raw.replace(/\./g, "");
    raw = raw.replace(/[^0-9.-]/g, "");
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function formatTRY(value) {
    return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(Number(value) || 0);
  }

  function formatHeaderDate(value) {
    const date = parseDateOnly(value);
    if (!date) return value;
    const weekday = new Intl.DateTimeFormat("tr-TR", { weekday: "short" }).format(date).replace(".", "");
    return `${weekday.toLocaleUpperCase("tr-TR")}<br>${pad(date.getDate())}.${pad(date.getMonth() + 1)}`;
  }

  function scrapeActiveRows() {
    return [...document.querySelectorAll(".kyik-safe-table-wrap tbody tr.kyik-safe-row.selected-entry")].map((row) => {
      const name = row.querySelector(".kyik-safe-name-title strong")?.textContent?.trim() || row.querySelector("td strong")?.textContent?.trim() || "Personel";
      const noNode = [...row.querySelectorAll(".kyik-safe-name-row > small")].find((node) => !node.classList.contains("kyik-safe-entry-status"));
      const personnelNo = noNode?.textContent?.trim() || "";
      const role = row.cells?.[1]?.textContent?.trim() || "";
      const dayRate = parseTRY(row.cells?.[3]?.textContent || "");
      const nightRate = parseTRY(row.cells?.[4]?.textContent || "");
      return { key: personnelNo || name, name, personnelNo, role, dayRate, nightRate };
    });
  }

  async function selectDay(dayButton) {
    if (!dayButton.classList.contains("active")) dayButton.click();
    await waitFor(() => dayButton.classList.contains("active"));
    await sleep(60);
  }

  async function selectMode(mode) {
    const selector = mode === "night" ? ".kyik-safe-mode button.night" : ".kyik-safe-mode button.day";
    const button = document.querySelector(selector);
    if (!button) return false;
    if (!button.classList.contains("active")) button.click();
    await waitFor(() => button.classList.contains("active"));
    await sleep(60);
    return true;
  }

  async function collectWeeklyPersonnel() {
    const root = document.querySelector(".kyik-safe-daily");
    if (!root) throw new Error("Günlük giriş ekranı bulunamadı.");
    const inputs = [...root.querySelectorAll(".kyik-safe-actions input[type=date]")];
    const start = inputs[0]?.value || readRange().start;
    const end = inputs[1]?.value || readRange().end;
    const dayButtons = [...root.querySelectorAll(".kyik-safe-days > button")];
    if (!dayButtons.length) throw new Error("Hafta günleri bulunamadı.");

    const originalDayIndex = Math.max(0, dayButtons.findIndex((button) => button.classList.contains("active")));
    const originalMode = root.querySelector(".kyik-safe-mode button.night.active") ? "night" : "day";
    const dayCount = Math.min(dayButtons.length, 5);
    const dayDates = Array.from({ length: dayCount }, (_, index) => addDays(start, index));
    const people = new Map();

    try {
      for (let dayIndex = 0; dayIndex < dayCount; dayIndex += 1) {
        await selectDay(dayButtons[dayIndex]);
        for (const mode of ["day", "night"]) {
          if (!(await selectMode(mode))) continue;
          scrapeActiveRows().forEach((person) => {
            const current = people.get(person.key) || { ...person, shifts: Array.from({ length: dayCount }, () => ({ day: false, night: false })) };
            current.name = person.name || current.name;
            current.personnelNo = person.personnelNo || current.personnelNo;
            current.role = person.role || current.role;
            current.dayRate = person.dayRate || current.dayRate || 0;
            current.nightRate = person.nightRate || current.nightRate || 0;
            current.shifts[dayIndex][mode] = true;
            people.set(person.key, current);
          });
        }
      }
    } finally {
      await selectDay(dayButtons[originalDayIndex] || dayButtons[0]);
      await selectMode(originalMode);
    }

    const list = [...people.values()].sort((a, b) => {
      const roleCompare = String(a.role).localeCompare(String(b.role), "tr");
      return roleCompare || String(a.name).localeCompare(String(b.name), "tr");
    });
    return { start, end, dayDates, list };
  }

  function cleanupCustomPrint() {
    document.getElementById(PRINT_ROOT_ID)?.remove();
    document.getElementById(PRINT_STYLE_ID)?.remove();
    printBusy = false;
  }

  function printCustomHtml(html, orientation = "landscape") {
    document.getElementById(PRINT_ROOT_ID)?.remove();
    document.getElementById(PRINT_STYLE_ID)?.remove();
    const style = document.createElement("style");
    style.id = PRINT_STYLE_ID;
    style.textContent = `
      #${PRINT_ROOT_ID}{display:none}
      @media print{
        @page{size:A4 ${orientation};margin:6mm}
        body *{visibility:hidden!important}
        #${PRINT_ROOT_ID},#${PRINT_ROOT_ID} *{visibility:visible!important}
        #${PRINT_ROOT_ID}{display:block!important;position:absolute!important;left:0!important;top:0!important;width:100%!important;background:#fff!important;color:#111!important;font-family:Arial,Helvetica,sans-serif!important}
        #${PRINT_ROOT_ID} .title{text-align:center;font-size:14px;font-weight:900;margin:0 0 2px}
        #${PRINT_ROOT_ID} .sub{text-align:center;font-size:9px;font-weight:700;margin:0 0 6px}
        #${PRINT_ROOT_ID} table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8.4px}
        #${PRINT_ROOT_ID} th,#${PRINT_ROOT_ID} td{border:1px solid #111;padding:3px 2px;text-align:center;line-height:1.15}
        #${PRINT_ROOT_ID} th{background:#eef2f7!important;font-weight:900}
        #${PRINT_ROOT_ID} td.left,#${PRINT_ROOT_ID} th.left{text-align:left}
        #${PRINT_ROOT_ID} tbody tr{break-inside:avoid}
        #${PRINT_ROOT_ID} tfoot td{font-weight:900;background:#f8fafc!important}
        #${PRINT_ROOT_ID} .money{white-space:nowrap;font-weight:800}
        #${PRINT_ROOT_ID} .mark{font-size:12px;font-weight:900}
        #${PRINT_ROOT_ID} .foot{display:flex;justify-content:space-between;gap:12px;margin-top:5px;font-size:8px;font-weight:700}
      }
    `;
    document.head.appendChild(style);
    const root = document.createElement("section");
    root.id = PRINT_ROOT_ID;
    root.innerHTML = html;
    document.body.appendChild(root);
    const finish = () => setTimeout(cleanupCustomPrint, 100);
    window.addEventListener("afterprint", finish, { once: true });
    setTimeout(() => window.print(), 120);
    setTimeout(() => { if (document.getElementById(PRINT_ROOT_ID)) cleanupCustomPrint(); }, 60000);
  }

  async function printWeeklyDirect() {
    if (printBusy) return;
    printBusy = true;
    showNotice("Haftalık kontrol listesi hazırlanıyor...");
    try {
      const data = await collectWeeklyPersonnel();
      let grandDayCount = 0, grandNightCount = 0, grandDayAmount = 0, grandNightAmount = 0;
      const dayHeaders = data.dayDates.map((date) => `<th colspan="2">${formatHeaderDate(date)}</th>`).join("");
      const shiftHeaders = data.dayDates.map(() => "<th>G</th><th>N</th>").join("");
      const body = data.list.map((person, index) => {
        let dayCount = 0, nightCount = 0;
        const marks = person.shifts.map((shift) => {
          if (shift.day) dayCount += 1;
          if (shift.night) nightCount += 1;
          return `<td class="mark">${shift.day ? "✓" : ""}</td><td class="mark">${shift.night ? "✓" : ""}</td>`;
        }).join("");
        const dayAmount = dayCount * (person.dayRate || 0);
        const nightAmount = nightCount * (person.nightRate || 0);
        const total = dayAmount + nightAmount;
        grandDayCount += dayCount; grandNightCount += nightCount; grandDayAmount += dayAmount; grandNightAmount += nightAmount;
        return `<tr><td>${index + 1}</td><td>${escapeHtml(person.personnelNo || "-")}</td><td class="left">${escapeHtml(person.name)}</td><td class="left">${escapeHtml(person.role || "-")}</td><td class="money">${escapeHtml(formatTRY(person.dayRate))}</td><td class="money">${escapeHtml(formatTRY(person.nightRate))}</td>${marks}<td>${dayCount}</td><td class="money">${escapeHtml(formatTRY(dayAmount))}</td><td>${nightCount}</td><td class="money">${escapeHtml(formatTRY(nightAmount))}</td><td class="money">${escapeHtml(formatTRY(total))}</td></tr>`;
      }).join("");
      const grandTotal = grandDayAmount + grandNightAmount;
      const html = `<div class="title">HAFTALIK PERSONEL KONTROL LİSTESİ</div><div class="sub">${escapeHtml(data.start)} — ${escapeHtml(data.end)}</div><table><thead><tr><th rowspan="2">#</th><th rowspan="2">No</th><th rowspan="2" class="left">Personel</th><th rowspan="2" class="left">Vasıf</th><th rowspan="2">Gündüz Ücret</th><th rowspan="2">Gece Ücret</th>${dayHeaders}<th colspan="5">HAFTA TOPLAMI</th></tr><tr>${shiftHeaders}<th>G Gün</th><th>G Tutar</th><th>N Gün</th><th>N Tutar</th><th>Genel</th></tr></thead><tbody>${body || '<tr><td colspan="99">Kayıt yok</td></tr>'}</tbody><tfoot><tr><td colspan="${6 + data.dayDates.length * 2}" class="left">GENEL TOPLAM</td><td>${grandDayCount}</td><td class="money">${escapeHtml(formatTRY(grandDayAmount))}</td><td>${grandNightCount}</td><td class="money">${escapeHtml(formatTRY(grandNightAmount))}</td><td class="money">${escapeHtml(formatTRY(grandTotal))}</td></tr></tfoot></table><div class="foot"><span>G: Gündüz · N: Gece</span><span>${data.list.length} personel</span></div>`;
      showNotice(`${data.list.length} personel hazır. Yazdırma açılıyor...`);
      printCustomHtml(html, "landscape");
    } catch (error) {
      printBusy = false;
      showNotice(error?.message || "Haftalık kontrol listesi hazırlanamadı.", "warn");
    }
  }

  function readPaymentRows() {
    const cards = [...document.querySelectorAll(".kyik-slip-grid .kyik-slip")];
    return cards.map((card) => {
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

  function paymentRange() {
    const screen = [...document.querySelectorAll(".kyik-screen")].find((node) => normalizedText(node).includes("Günlük Ödeme Fişleri"));
    const inputs = [...(screen?.querySelectorAll('input[type="date"]') || [])];
    return { start: inputs[0]?.value || "", end: inputs[1]?.value || "" };
  }

  function printPaymentControl() {
    const rows = readPaymentRows();
    if (!rows.length) {
      showNotice("Kontrol listesinde yazdırılacak personel yok.", "warn");
      return;
    }
    const range = paymentRange();
    let dayCount = 0, nightCount = 0, dayAmount = 0, nightAmount = 0, total = 0;
    const body = rows.map((row, index) => {
      dayCount += row.dayCount; nightCount += row.nightCount; dayAmount += row.dayAmount; nightAmount += row.nightAmount; total += row.total;
      return `<tr><td>${index + 1}</td><td class="left">${escapeHtml(row.name)}</td><td class="left">${escapeHtml(row.role || "-")}</td><td>${row.dayCount}</td><td class="money">${escapeHtml(formatTRY(row.dayAmount))}</td><td>${row.nightCount}</td><td class="money">${escapeHtml(formatTRY(row.nightAmount))}</td><td>${row.dayCount + row.nightCount}</td><td class="money">${escapeHtml(formatTRY(row.total))}</td></tr>`;
    }).join("");
    const html = `<div class="title">HAFTALIK ÖDEME KONTROL LİSTESİ</div><div class="sub">${escapeHtml(range.start)} — ${escapeHtml(range.end)}</div><table><thead><tr><th>#</th><th class="left">Personel</th><th class="left">Vasıf</th><th>Gündüz Gün</th><th>Gündüz Tutar</th><th>Gece Gün</th><th>Gece Tutar</th><th>Toplam Gün</th><th>Ödenecek</th></tr></thead><tbody>${body}</tbody><tfoot><tr><td colspan="3" class="left">GENEL TOPLAM</td><td>${dayCount}</td><td class="money">${escapeHtml(formatTRY(dayAmount))}</td><td>${nightCount}</td><td class="money">${escapeHtml(formatTRY(nightAmount))}</td><td>${dayCount + nightCount}</td><td class="money">${escapeHtml(formatTRY(total))}</td></tr></tfoot></table><div class="foot"><span>Ödeme ön kontrol listesi</span><span>${rows.length} personel</span></div>`;
    printCustomHtml(html, "landscape");
  }

  function printPaymentSlips() {
    document.getElementById(SLIP_STYLE_ID)?.remove();
    const style = document.createElement("style");
    style.id = SLIP_STYLE_ID;
    style.textContent = `@media print{@page{size:A4 portrait;margin:6mm}body *{visibility:hidden!important}.printable.daily-print,.printable.daily-print *{visibility:visible!important}.printable.daily-print{display:block!important;position:absolute!important;left:0!important;top:0!important;width:198mm!important;max-width:198mm!important;margin:0!important;padding:0!important;border:0!important;box-shadow:none!important;background:#fff!important}.daily-control-page,.daily-slip-page-summary{display:none!important}.daily-print-page{display:block!important;width:198mm!important;max-width:198mm!important;height:auto!important;overflow:visible!important;page-break-after:always!important;break-after:page!important}.daily-print-page:last-child{page-break-after:auto!important;break-after:auto!important}.daily-slip-print-grid{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;grid-template-rows:repeat(5,50mm)!important;gap:2mm 5mm!important}.daily-slip-card{height:50mm!important;overflow:hidden!important;break-inside:avoid!important;page-break-inside:avoid!important}}`;
    document.head.appendChild(style);
    const finish = () => setTimeout(() => style.remove(), 100);
    window.addEventListener("afterprint", finish, { once: true });
    setTimeout(() => window.print(), 80);
  }

  function interceptClicks(event) {
    const button = event.target?.closest?.("button");
    if (!button) return;
    const text = normalizedText(button);

    if (location.pathname.includes("/gunluk-operasyon/gunluk-giris") && button.closest(".kyik-safe-daily") && text === "Haftalık Liste Yazdır") {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      printWeeklyDirect();
      return;
    }

    if (location.pathname.includes("/gunluk-operasyon/odeme-fisleri")) {
      if (button.dataset.kyerpPrintMode === "control" || text === "A4 Önizle") {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
        printPaymentControl();
        return;
      }
      if (button.dataset.kyerpPrintMode === "slips" || text === "Yazdır" || text === "Fişleri Yazdır") {
        event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
        printPaymentSlips();
      }
    }
  }

  document.addEventListener("click", interceptClicks, true);
  const observer = new MutationObserver(() => { ensureButton(); ensurePaymentLabels(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", () => { ensureButton(); ensurePaymentLabels(); });
  window.addEventListener("pageshow", () => { ensureButton(); ensurePaymentLabels(); });
  ensureButton();
  ensurePaymentLabels();
})();
