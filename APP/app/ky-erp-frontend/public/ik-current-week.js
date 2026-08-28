(() => {
  const RANGE_KEY = "ikDailyDateRange.v2";
  const SELECTED_DATE_KEY = "ikDailySelectedDate.v2";
  const CURRENT_WEEK_KEY = "ikDailyCurrentWeek.v1";
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

  function writeRange(week) {
    try {
      window.localStorage.setItem(
        RANGE_KEY,
        JSON.stringify({ startDate: week.start, endDate: week.end }),
      );
      const selected = String(window.localStorage.getItem(SELECTED_DATE_KEY) || "");
      if (selected < week.start || selected > week.end) {
        window.localStorage.setItem(SELECTED_DATE_KEY, week.selected);
      }
    } catch {
      // localStorage kullanılamıyorsa React kendi state'i ile devam eder.
    }
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

  function isCurrentWeekMode() {
    try {
      return window.localStorage.getItem(CURRENT_WEEK_KEY) === "1";
    } catch {
      return false;
    }
  }

  function setCurrentWeekMode(active) {
    try {
      if (active) window.localStorage.setItem(CURRENT_WEEK_KEY, "1");
      else window.localStorage.removeItem(CURRENT_WEEK_KEY);
    } catch {
      // noop
    }
  }

  // İlk kullanımda varsayılan aralık Cumartesi/Pazar içermeyen güncel iş haftasıdır.
  const weekAtBoot = currentWorkWeek();
  const storedAtBoot = readRange();
  if (!storedAtBoot.start || !storedAtBoot.end || isCurrentWeekMode()) {
    writeRange(weekAtBoot);
  }

  function updateButtonState(button, active) {
    button.dataset.active = active ? "1" : "0";
    button.setAttribute("aria-pressed", active ? "true" : "false");
    button.style.borderColor = active ? "#2563eb" : "#cbd5e1";
    button.style.background = active ? "#eff6ff" : "#ffffff";
    button.style.color = active ? "#1d4ed8" : "#334155";
    button.style.fontWeight = active ? "700" : "600";
  }

  function syncModeFromInputs(actions, button) {
    const inputs = [...actions.querySelectorAll('input[type="date"]')];
    if (inputs.length < 2) return;
    const week = currentWorkWeek();
    const active = inputs[0].value === week.start && inputs[1].value === week.end;
    setCurrentWeekMode(active);
    updateButtonState(button, active);
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
      button.title = "Güncel haftayı Pazartesi-Cuma (5 gün) aç";
      button.style.height = "34px";
      button.style.padding = "0 12px";
      button.style.border = "1px solid #cbd5e1";
      button.style.borderRadius = "7px";
      button.style.cursor = "pointer";
      button.style.whiteSpace = "nowrap";

      const dateBlocks = [...actions.children].filter((child) =>
        child?.querySelector?.('input[type="date"]'),
      );
      const anchor = dateBlocks[dateBlocks.length - 1];
      if (anchor?.nextSibling) actions.insertBefore(button, anchor.nextSibling);
      else actions.appendChild(button);

      button.addEventListener("click", () => {
        const week = currentWorkWeek();
        setCurrentWeekMode(true);
        writeRange(week);
        window.location.reload();
      });

      actions.addEventListener("change", (event) => {
        if (!(event.target instanceof HTMLInputElement) || event.target.type !== "date") return;
        window.setTimeout(() => syncModeFromInputs(actions, button), 0);
      });
    }

    const inputs = [...actions.querySelectorAll('input[type="date"]')];
    if (inputs.length >= 2) {
      const week = currentWorkWeek();
      const active = inputs[0].value === week.start && inputs[1].value === week.end;
      updateButtonState(button, active);
      if (active) setCurrentWeekMode(true);
    }
  }

  const observer = new MutationObserver(ensureButton);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("popstate", ensureButton);
  window.addEventListener("pageshow", ensureButton);
  ensureButton();
})();
