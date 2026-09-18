(() => {
  const RANGE_KEY = "ikDailyDateRange.v2";
  const SELECTED_DATE_KEY = "ikDailySelectedDate.v2";
  const BUTTON_ID = "kyerp-current-work-week";

  const pad = (value) => String(value).padStart(2, "0");

  function dateOnly(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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
      if (selected < week.start || selected > week.end) {
        localStorage.setItem(SELECTED_DATE_KEY, week.selected);
      }
    } catch {}
  }

  function setReactInputValue(input, value) {
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    descriptor?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
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
    setReactInputValue(inputs[0], week.start);
    setReactInputValue(inputs[1], week.end);
    setTimeout(() => syncButtonFromInputs(actions, button), 0);
  }

  function ensureButton() {
    if (!location.pathname.includes("/gunluk-operasyon/")) return;
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

  const storedAtBoot = readRange();
  if (!storedAtBoot.start || !storedAtBoot.end) writeRange(currentWorkWeek());

  const observer = new MutationObserver(ensureButton);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("pageshow", ensureButton);
  window.addEventListener("popstate", ensureButton);
  ensureButton();
})();
