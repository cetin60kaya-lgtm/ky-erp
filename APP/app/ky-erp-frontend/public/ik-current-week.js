(() => {
  const RANGE_KEY = "ikDailyDateRange.v2";
  const SELECTED_DATE_KEY = "ikDailySelectedDate.v2";
  const BUTTON_ID = "kyerp-current-work-week";

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
    } catch {
      // localStorage opsiyoneldir; React state ana kaynaktır.
    }
  }

  function setReactInputValue(input, value) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    descriptor?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  const storedAtBoot = readRange();
  if (!storedAtBoot.start || !storedAtBoot.end) {
    writeRange(currentWorkWeek());
  }

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
    // Tam sayfa yenileme YOK. React'in mevcut controlled input akışını tetikler;
    // auth provider, token ve açık uygulama oturumu yeniden başlatılmaz.
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
      button.title = "Güncel Pazartesi-Cuma aralığına uygulamadan çıkmadan geç";
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

  function findButtonByText(text) {
    return [...document.querySelectorAll("button")].find(
      (button) => normalizedText(button) === text,
    );
  }

  function waitForWeeklyPrint(attempt = 0) {
    const printable = document.querySelector(".printable.weekly-print");
    const rows = printable?.querySelectorAll?.("tbody tr")?.length || 0;
    if (printable && rows > 0) {
      window.setTimeout(() => {
        window.print();
        window.setTimeout(() => {
          const back = findButtonByText("Günlük Giriş");
          back?.click?.();
        }, 100);
      }, 80);
      return;
    }

    if (attempt >= 60) {
      const weeklyScreen = document.querySelector(".kyik-screen");
      if (weeklyScreen) {
        const notice = document.createElement("div");
        notice.style.cssText = "position:fixed;z-index:99999;right:18px;top:76px;background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;border-radius:8px;padding:12px 14px;font:600 13px Segoe UI,Arial,sans-serif;box-shadow:0 8px 24px rgba(15,23,42,.16)";
        notice.textContent = "Haftalık yazdırma listesi hazırlanamadı. Haftalık Özet ekranındaki kayıtları kontrol edin.";
        document.body.appendChild(notice);
        window.setTimeout(() => notice.remove(), 5000);
      }
      return;
    }

    window.setTimeout(() => waitForWeeklyPrint(attempt + 1), 100);
  }

  function interceptSafeWeeklyPrint(event) {
    const button = event.target?.closest?.("button");
    if (!button) return;
    if (!button.closest(".kyik-safe-daily")) return;
    if (normalizedText(button) !== "Haftalık Liste Yazdır") return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const weeklyButton = findButtonByText("Haftalık Özet");
    if (!weeklyButton) {
      return;
    }
    weeklyButton.click();
    window.setTimeout(() => waitForWeeklyPrint(0), 50);
  }

  // SafeDailyEntry içindeki eski window.print() boş sayfa üretiyordu.
  // Capture listener React onClick'ten önce devreye girer; ortak tarih aralığını kullanan
  // gerçek Haftalık Özet çıktısını açıp yazdırır ve işlem bitince Günlük Giriş'e geri döner.
  document.addEventListener("click", interceptSafeWeeklyPrint, true);

  const observer = new MutationObserver(ensureButton);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", ensureButton);
  window.addEventListener("pageshow", ensureButton);
  ensureButton();
})();
