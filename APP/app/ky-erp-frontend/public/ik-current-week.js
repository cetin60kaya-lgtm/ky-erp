(() => {
  const RANGE_KEY = "ikDailyDateRange.v2";
  const SELECTED_DATE_KEY = "ikDailySelectedDate.v2";
  const BUTTON_ID = "kyerp-current-work-week";
  const PRINT_ROOT_ID = "kyerp-weekly-direct-print";
  const PRINT_STYLE_ID = "kyerp-weekly-direct-print-style";
  let printBusy = false;

  function pad(value) {
    return String(value).padStart(2, "0");
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
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekday = today.getDay() || 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() + (1 - weekday));
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    const start = dateOnly(monday);
    const end = dateOnly(friday);
    const rawToday = dateOnly(today);
    const selected = rawToday >= start && rawToday <= end ? rawToday : end;
    return { start, end, selected };
  }

  function readRange() {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(RANGE_KEY) || "null");
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
      window.localStorage.setItem(RANGE_KEY, JSON.stringify({ startDate: week.start, endDate: week.end }));
      const selected = String(window.localStorage.getItem(SELECTED_DATE_KEY) || "");
      if (selected < week.start || selected > week.end) {
        window.localStorage.setItem(SELECTED_DATE_KEY, week.selected);
      }
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
    window.setTimeout(() => syncButtonFromInputs(actions, button), 0);
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
        window.setTimeout(() => syncButtonFromInputs(actions, button), 0);
      });
    }
    syncButtonFromInputs(actions, button);
  }

  function normalizedText(node) {
    return String(node?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function showNotice(message, tone = "warn") {
    document.getElementById("kyerp-weekly-print-notice")?.remove();
    const notice = document.createElement("div");
    notice.id = "kyerp-weekly-print-notice";
    notice.style.cssText = tone === "ok"
      ? "position:fixed;z-index:99999;right:18px;top:76px;background:#ecfdf5;color:#166534;border:1px solid #86efac;border-radius:8px;padding:12px 14px;font:700 13px Segoe UI,Arial,sans-serif;box-shadow:0 8px 24px rgba(15,23,42,.16)"
      : "position:fixed;z-index:99999;right:18px;top:76px;background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;border-radius:8px;padding:12px 14px;font:700 13px Segoe UI,Arial,sans-serif;box-shadow:0 8px 24px rgba(15,23,42,.16)";
    notice.textContent = message;
    document.body.appendChild(notice);
    window.setTimeout(() => notice.remove(), 5000);
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
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

  function formatHeaderDate(value) {
    const date = parseDateOnly(value);
    if (!date) return value;
    const weekday = new Intl.DateTimeFormat("tr-TR", { weekday: "short" }).format(date).replace(".", "");
    return `${weekday.toLocaleUpperCase("tr-TR")}<br>${pad(date.getDate())}.${pad(date.getMonth() + 1)}`;
  }

  function scrapeActiveRows() {
    const rows = [...document.querySelectorAll(".kyik-safe-table-wrap tbody tr.kyik-safe-row.selected-entry")];
    return rows.map((row) => {
      const name = row.querySelector(".kyik-safe-name-title strong")?.textContent?.trim()
        || row.querySelector("td strong")?.textContent?.trim()
        || "Personel";
      const noNode = [...row.querySelectorAll(".kyik-safe-name-row > small")]
        .find((node) => !node.classList.contains("kyik-safe-entry-status"));
      const personnelNo = noNode?.textContent?.trim() || "";
      const role = row.cells?.[1]?.textContent?.trim() || "";
      return { key: personnelNo || name, name, personnelNo, role };
    });
  }

  async function selectDay(dayButton) {
    if (!dayButton.classList.contains("active")) dayButton.click();
    await waitFor(() => dayButton.classList.contains("active"));
    await sleep(55);
  }

  async function selectMode(mode) {
    const selector = mode === "night" ? ".kyik-safe-mode button.night" : ".kyik-safe-mode button.day";
    const button = document.querySelector(selector);
    if (!button) return false;
    if (!button.classList.contains("active")) button.click();
    await waitFor(() => button.classList.contains("active"));
    await sleep(55);
    return true;
  }

  async function collectWeeklyPersonnel() {
    const root = document.querySelector(".kyik-safe-daily");
    if (!root) throw new Error("Günlük giriş ekranı bulunamadı.");

    const actions = root.querySelector(".kyik-safe-actions");
    const inputs = [...(actions?.querySelectorAll('input[type="date"]') || [])];
    const start = inputs[0]?.value || readRange().start;
    const end = inputs[1]?.value || readRange().end;
    const dayButtons = [...root.querySelectorAll(".kyik-safe-days > button")];
    if (!dayButtons.length) throw new Error("Hafta günleri bulunamadı.");

    const originalDayIndex = Math.max(0, dayButtons.findIndex((button) => button.classList.contains("active")));
    const originalMode = root.querySelector(".kyik-safe-mode button.night.active") ? "night" : "day";
    const people = new Map();
    const dayCount = Math.min(dayButtons.length, 7);
    const dayDates = Array.from({ length: dayCount }, (_, index) => addDays(start, index));

    try {
      for (let dayIndex = 0; dayIndex < dayCount; dayIndex += 1) {
        const dayButton = dayButtons[dayIndex];
        await selectDay(dayButton);

        for (const mode of ["day", "night"]) {
          const modeReady = await selectMode(mode);
          if (!modeReady) continue;
          const activeRows = scrapeActiveRows();
          activeRows.forEach((person) => {
            const current = people.get(person.key) || {
              ...person,
              shifts: Array.from({ length: dayCount }, () => ({ day: false, night: false })),
            };
            current.name = person.name || current.name;
            current.personnelNo = person.personnelNo || current.personnelNo;
            current.role = person.role || current.role;
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

  function cleanupPrint() {
    document.getElementById(PRINT_ROOT_ID)?.remove();
    document.getElementById(PRINT_STYLE_ID)?.remove();
  }

  function renderAndPrintWeekly(data) {
    cleanupPrint();

    const style = document.createElement("style");
    style.id = PRINT_STYLE_ID;
    style.textContent = `
      #${PRINT_ROOT_ID}{display:none}
      @media print{
        @page{size:A4 landscape;margin:7mm}
        body *{visibility:hidden!important}
        #${PRINT_ROOT_ID},#${PRINT_ROOT_ID} *{visibility:visible!important}
        #${PRINT_ROOT_ID}{display:block!important;position:absolute!important;left:0!important;top:0!important;width:100%!important;background:#fff!important;color:#111!important;font-family:Arial,Helvetica,sans-serif!important}
        #${PRINT_ROOT_ID} .title{text-align:center;font-size:15px;font-weight:900;letter-spacing:.04em;margin:0 0 2px}
        #${PRINT_ROOT_ID} .sub{text-align:center;font-size:10px;font-weight:700;margin:0 0 7px}
        #${PRINT_ROOT_ID} table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9px}
        #${PRINT_ROOT_ID} th,#${PRINT_ROOT_ID} td{border:1px solid #111;padding:3px 2px;text-align:center;line-height:1.15}
        #${PRINT_ROOT_ID} th{background:#f1f5f9!important;font-weight:900}
        #${PRINT_ROOT_ID} th.person,#${PRINT_ROOT_ID} td.person{text-align:left;width:23%}
        #${PRINT_ROOT_ID} th.role,#${PRINT_ROOT_ID} td.role{text-align:left;width:12%}
        #${PRINT_ROOT_ID} th.no,#${PRINT_ROOT_ID} td.no{width:7%}
        #${PRINT_ROOT_ID} th.sum,#${PRINT_ROOT_ID} td.sum{width:4.8%;font-weight:900}
        #${PRINT_ROOT_ID} td.mark{font-size:13px;font-weight:900}
        #${PRINT_ROOT_ID} tbody tr{break-inside:avoid}
        #${PRINT_ROOT_ID} .foot{margin-top:5px;display:flex;justify-content:space-between;font-size:8.5px;font-weight:700}
      }
    `;
    document.head.appendChild(style);

    const root = document.createElement("section");
    root.id = PRINT_ROOT_ID;

    const dayHeaders = data.dayDates.map((date) => `<th colspan="2">${formatHeaderDate(date)}</th>`).join("");
    const shiftHeaders = data.dayDates.map(() => "<th>G</th><th>N</th>").join("");

    const body = data.list.map((person, index) => {
      let dayTotal = 0;
      let nightTotal = 0;
      const cells = person.shifts.map((shift) => {
        if (shift.day) dayTotal += 1;
        if (shift.night) nightTotal += 1;
        return `<td class="mark">${shift.day ? "✓" : ""}</td><td class="mark">${shift.night ? "✓" : ""}</td>`;
      }).join("");
      return `<tr><td>${index + 1}</td><td class="no">${escapeHtml(person.personnelNo || "-")}</td><td class="person">${escapeHtml(person.name)}</td><td class="role">${escapeHtml(person.role || "-")}</td>${cells}<td class="sum">${dayTotal}</td><td class="sum">${nightTotal}</td><td class="sum">${dayTotal + nightTotal}</td></tr>`;
    }).join("");

    root.innerHTML = `
      <div class="title">GÜNLÜK PERSONEL HAFTALIK LİSTESİ</div>
      <div class="sub">${escapeHtml(data.start)} — ${escapeHtml(data.end)}</div>
      <table>
        <thead>
          <tr><th rowspan="2">#</th><th rowspan="2" class="no">No</th><th rowspan="2" class="person">Personel</th><th rowspan="2" class="role">Vasıf</th>${dayHeaders}<th colspan="3">TOPLAM</th></tr>
          <tr>${shiftHeaders}<th class="sum">G</th><th class="sum">N</th><th class="sum">T</th></tr>
        </thead>
        <tbody>${body || '<tr><td colspan="99">Bu hafta için personel kaydı bulunamadı.</td></tr>'}</tbody>
      </table>
      <div class="foot"><span>G: Gündüz &nbsp; N: Gece</span><span>Toplam personel: ${data.list.length}</span></div>
    `;
    document.body.appendChild(root);

    const finish = () => {
      window.setTimeout(() => {
        cleanupPrint();
        printBusy = false;
      }, 100);
    };
    window.addEventListener("afterprint", finish, { once: true });
    window.setTimeout(() => window.print(), 120);
    window.setTimeout(() => {
      if (printBusy) finish();
    }, 60000);
  }

  async function printWeeklyDirect() {
    if (printBusy) return;
    printBusy = true;
    showNotice("Haftalık personel listesi hazırlanıyor...", "ok");
    try {
      const data = await collectWeeklyPersonnel();
      showNotice(`${data.list.length} personel hazır. A4 yazdırma açılıyor...`, "ok");
      renderAndPrintWeekly(data);
    } catch (error) {
      printBusy = false;
      showNotice(error?.message || "Haftalık personel listesi hazırlanamadı.");
    }
  }

  function interceptSafeWeeklyPrint(event) {
    const button = event.target?.closest?.("button");
    if (!button) return;
    if (!window.location.pathname.startsWith("/gunluk-operasyon/")) return;
    if (!button.closest(".kyik-safe-daily")) return;
    if (normalizedText(button) !== "Haftalık Liste Yazdır") return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    printWeeklyDirect();
  }

  document.addEventListener("click", interceptSafeWeeklyPrint, true);

  const observer = new MutationObserver(ensureButton);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", ensureButton);
  window.addEventListener("pageshow", ensureButton);
  ensureButton();
})();
