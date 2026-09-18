(() => {
  const RANGE_KEY = "ikDailyDateRange.v2";
  const SELECTED_DATE_KEY = "ikDailySelectedDate.v2";
  const BUTTON_ID = "kyerp-current-work-week";
  const AUTO_PRINT_KEY = "kyerp.weeklyPrint.autoprint.v2";
  const RETURN_URL_KEY = "kyerp.weeklyPrint.returnUrl.v2";
  const WEEKLY_LANDING_ROUTE = "/gunluk-operasyon/ana-ekran";

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function dateOnly(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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
      button.title = "Guncel Pazartesi-Cuma araligina gec";
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

  function startWeeklyPrintRoute() {
    try {
      sessionStorage.setItem(AUTO_PRINT_KEY, "1");
      sessionStorage.setItem(RETURN_URL_KEY, window.location.pathname + window.location.search + window.location.hash);
    } catch {}
    window.location.assign(WEEKLY_LANDING_ROUTE);
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
    startWeeklyPrintRoute();
  }

  let autoPrintStarted = false;
  let weeklyOpenClicked = false;

  function findDailyOperationWeeklyButton() {
    return [...document.querySelectorAll(".gop-quick button")].find((button) =>
      normalizedText(button).includes("Haftalık Özet"),
    );
  }

  function maybeAutoPrintWeekly(attempt = 0) {
    if (autoPrintStarted) return;
    let requested = false;
    try { requested = sessionStorage.getItem(AUTO_PRINT_KEY) === "1"; } catch {}
    if (!requested) return;

    const printable = document.querySelector(".printable.weekly-print");
    const rows = printable?.querySelectorAll?.("tbody tr")?.length || 0;
    if (printable && rows > 0) {
      autoPrintStarted = true;
      try { sessionStorage.removeItem(AUTO_PRINT_KEY); } catch {}
      showNotice("Günlük Operasyon haftalık listesi hazır. Yazdırma açılıyor...", "ok");
      const returnAfterPrint = () => {
        let returnUrl = "/gunluk-operasyon/gunluk-giris";
        try {
          returnUrl = sessionStorage.getItem(RETURN_URL_KEY) || returnUrl;
          sessionStorage.removeItem(RETURN_URL_KEY);
        } catch {}
        window.setTimeout(() => window.location.assign(returnUrl), 150);
      };
      window.addEventListener("afterprint", returnAfterPrint, { once: true });
      window.setTimeout(() => window.print(), 250);
      return;
    }

    if (!weeklyOpenClicked) {
      const dailyWeeklyButton = findDailyOperationWeeklyButton();
      if (dailyWeeklyButton) {
        weeklyOpenClicked = true;
        dailyWeeklyButton.click();
      }
    }

    if (attempt >= 120) {
      try { sessionStorage.removeItem(AUTO_PRINT_KEY); } catch {}
      showNotice("Günlük Operasyon haftalık listesi yüklenemedi. Tekrar deneyin.");
      return;
    }
    window.setTimeout(() => maybeAutoPrintWeekly(attempt + 1), 100);
  }

  document.addEventListener("click", interceptSafeWeeklyPrint, true);

  const observer = new MutationObserver(() => {
    ensureButton();
    maybeAutoPrintWeekly(0);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", () => {
    ensureButton();
    maybeAutoPrintWeekly(0);
  });
  window.addEventListener("pageshow", () => {
    ensureButton();
    maybeAutoPrintWeekly(0);
  });

  ensureButton();
  maybeAutoPrintWeekly(0);
})();
