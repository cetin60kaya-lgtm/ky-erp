(() => {
  const PRINT_ROOT_ID = "kyerp-weekly-hidden-print-root";
  const PRINT_STYLE_ID = "kyerp-weekly-hidden-print-style";
  const OVERLAY_ID = "kyerp-weekly-hidden-overlay";
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

  function showOverlay(message = "Haftalık liste hazırlanıyor…") {
    document.getElementById(OVERLAY_ID)?.remove();
    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = `<div><strong>${esc(message)}</strong><span>Gündüz ve gece kayıtları arka planda okunuyor.</span></div>`;
    overlay.style.cssText = "position:fixed;inset:0;z-index:2147483646;background:rgba(244,247,251,.98);display:grid;place-items:center;font-family:Segoe UI,Arial,sans-serif;color:#0f2344;";
    const box = overlay.firstElementChild;
    if (box) box.style.cssText = "display:grid;gap:8px;text-align:center;background:#fff;border:1px solid #dce6f4;border-radius:12px;padding:22px 30px;box-shadow:0 16px 40px rgba(15,35,68,.14);";
    const strong = overlay.querySelector("strong");
    if (strong) strong.style.cssText = "font-size:18px;";
    const span = overlay.querySelector("span");
    if (span) span.style.cssText = "font-size:12px;color:#64748b;font-weight:700;";
    document.body.appendChild(overlay);
  }

  function hideOverlay() {
    document.getElementById(OVERLAY_ID)?.remove();
  }

  function modeButton(root, mode) {
    const wanted = mode === "night" ? "GECE GİRİŞİ" : "GÜNDÜZ GİRİŞİ";
    return [...root.querySelectorAll(".kyik-safe-mode button")].find((button) =>
      text(button).toLocaleUpperCase("tr-TR").includes(wanted),
    );
  }

  async function selectMode(root, mode) {
    let button = modeButton(root, mode);
    if (!button) return false;
    if (!button.classList.contains("active")) button.click();
    const started = Date.now();
    while (Date.now() - started < 2500) {
      button = modeButton(root, mode);
      if (button?.classList.contains("active")) {
        await sleep(220);
        return true;
      }
      await sleep(40);
    }
    return false;
  }

  async function selectDay(root, index) {
    let buttons = [...root.querySelectorAll(".kyik-safe-days > button")];
    let button = buttons[index];
    if (!button) return false;
    if (!button.classList.contains("active")) button.click();
    const started = Date.now();
    while (Date.now() - started < 2500) {
      buttons = [...root.querySelectorAll(".kyik-safe-days > button")];
      button = buttons[index];
      if (button?.classList.contains("active")) {
        await sleep(240);
        return true;
      }
      if ([...document.querySelectorAll("body *")].some((node) => text(node).includes("Kaydedilmemiş girişler var"))) return false;
      await sleep(40);
    }
    return false;
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

  function cleanupPrint() {
    document.getElementById(PRINT_ROOT_ID)?.remove();
    document.getElementById(PRINT_STYLE_ID)?.remove();
    busy = false;
  }

  function printHtml(html) {
    document.getElementById(PRINT_ROOT_ID)?.remove();
    document.getElementById(PRINT_STYLE_ID)?.remove();
    const style = document.createElement("style");
    style.id = PRINT_STYLE_ID;
    style.textContent = `
      #${PRINT_ROOT_ID}{display:none}
      @media print{
        @page{size:A4 landscape;margin:6mm}
        html,body{margin:0!important;padding:0!important;height:auto!important;overflow:visible!important}
        body *{visibility:hidden!important}
        #${PRINT_ROOT_ID},#${PRINT_ROOT_ID} *{visibility:visible!important}
        #${PRINT_ROOT_ID}{display:block!important;position:absolute!important;left:0!important;top:0!important;width:100%!important;background:#fff!important;color:#111!important;font-family:Arial,Helvetica,sans-serif!important}
        #${PRINT_ROOT_ID} .title{text-align:center;font-size:14px;font-weight:900;margin:0 0 2px}
        #${PRINT_ROOT_ID} .sub{text-align:center;font-size:9px;font-weight:700;margin:0 0 6px}
        #${PRINT_ROOT_ID} table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8.5px}
        #${PRINT_ROOT_ID} th,#${PRINT_ROOT_ID} td{border:1px solid #111;padding:3px;text-align:center;line-height:1.15}
        #${PRINT_ROOT_ID} th{background:#eef2f7!important;font-weight:900}
        #${PRINT_ROOT_ID} .left{text-align:left!important}
        #${PRINT_ROOT_ID} .money{white-space:nowrap;font-weight:800}
        #${PRINT_ROOT_ID} tfoot td{font-weight:900;background:#f8fafc!important}
        #${PRINT_ROOT_ID} tbody tr{break-inside:avoid!important;page-break-inside:avoid!important}
      }
    `;
    document.head.appendChild(style);
    const root = document.createElement("section");
    root.id = PRINT_ROOT_ID;
    root.innerHTML = html;
    document.body.appendChild(root);
    window.addEventListener("afterprint", () => setTimeout(cleanupPrint, 100), { once: true });
    setTimeout(() => window.print(), 80);
  }

  async function printWeeklyHidden() {
    if (busy) return;
    const root = document.querySelector(".kyik-safe-daily");
    if (!root) return;
    const dayButtons = [...root.querySelectorAll(".kyik-safe-days > button")];
    if (!dayButtons.length) return;

    busy = true;
    showOverlay();

    const dayLabels = dayButtons.map((button) => {
      const weekday = text(button.querySelector("small"));
      const date = text(button.querySelector("strong"));
      return `${weekday}${weekday && date ? " " : ""}${date}`.trim();
    });
    const originalDay = Math.max(0, dayButtons.findIndex((button) => button.classList.contains("active")));
    const originalMode = modeButton(root, "night")?.classList.contains("active") ? "night" : "day";
    const people = new Map();

    try {
      for (let dayIndex = 0; dayIndex < dayButtons.length; dayIndex += 1) {
        const dayOk = await selectDay(root, dayIndex);
        if (!dayOk) throw new Error("Gün değiştirilemedi. Kaydedilmemiş kayıt varsa önce kaydedin.");
        for (const mode of ["day", "night"]) {
          const modeOk = await selectMode(root, mode);
          if (!modeOk) continue;
          for (const person of scrapeSelectedRows(root)) {
            const current = people.get(person.key) || {
              ...person,
              shifts: Array.from({ length: dayButtons.length }, () => ({ day: false, night: false })),
            };
            current.name = person.name || current.name;
            current.no = person.no || current.no;
            current.role = person.role || current.role;
            current.dayRate = person.dayRate || current.dayRate || 0;
            current.nightRate = person.nightRate || current.nightRate || 0;
            current.shifts[dayIndex][mode] = true;
            people.set(person.key, current);
          }
        }
      }
    } catch (error) {
      hideOverlay();
      try { await selectDay(root, originalDay); await selectMode(root, originalMode); } catch {}
      busy = false;
      window.alert(error?.message || "Haftalık liste hazırlanamadı.");
      return;
    }

    await selectDay(root, originalDay);
    await selectMode(root, originalMode);
    hideOverlay();

    const list = [...people.values()].sort((a, b) =>
      String(a.role || "").localeCompare(String(b.role || ""), "tr") ||
      String(a.name || "").localeCompare(String(b.name || ""), "tr"),
    );

    if (!list.length) {
      busy = false;
      window.alert("Haftalık listede yazdırılacak kayıt bulunamadı.");
      return;
    }

    let dayCount = 0;
    let nightCount = 0;
    let dayAmount = 0;
    let nightAmount = 0;
    const dateHeaders = dayLabels.map((label) => `<th colspan="2">${esc(label)}</th>`).join("");
    const shiftHeaders = dayLabels.map(() => "<th>G</th><th>N</th>").join("");
    const body = list.map((person, index) => {
      let dc = 0;
      let nc = 0;
      const marks = person.shifts.map((shift) => {
        if (shift.day) dc += 1;
        if (shift.night) nc += 1;
        return `<td>${shift.day ? "✓" : ""}</td><td>${shift.night ? "✓" : ""}</td>`;
      }).join("");
      const da = dc * (person.dayRate || 0);
      const na = nc * (person.nightRate || 0);
      dayCount += dc;
      nightCount += nc;
      dayAmount += da;
      nightAmount += na;
      return `<tr><td>${index + 1}</td><td>${esc(person.no || "-")}</td><td class="left">${esc(person.name)}</td><td class="left">${esc(person.role || "-")}</td><td class="money">${esc(money(person.dayRate))}</td><td class="money">${esc(money(person.nightRate))}</td>${marks}<td>${dc}</td><td class="money">${esc(money(da))}</td><td>${nc}</td><td class="money">${esc(money(na))}</td><td class="money">${esc(money(da + na))}</td></tr>`;
    }).join("");

    const html = `<div class="title">HAFTALIK PERSONEL KONTROL LİSTESİ</div><div class="sub">${esc(dayLabels.join(" · "))}</div><table><thead><tr><th rowspan="2">#</th><th rowspan="2">No</th><th rowspan="2" class="left">Personel</th><th rowspan="2" class="left">Vasıf</th><th rowspan="2">Gündüz Ücret</th><th rowspan="2">Gece Ücret</th>${dateHeaders}<th colspan="5">HAFTA TOPLAMI</th></tr><tr>${shiftHeaders}<th>G Gün</th><th>G Tutar</th><th>N Gün</th><th>N Tutar</th><th>Genel</th></tr></thead><tbody>${body}</tbody><tfoot><tr><td colspan="${6 + dayLabels.length * 2}" class="left">GENEL TOPLAM</td><td>${dayCount}</td><td class="money">${esc(money(dayAmount))}</td><td>${nightCount}</td><td class="money">${esc(money(nightAmount))}</td><td class="money">${esc(money(dayAmount + nightAmount))}</td></tr></tfoot></table>`;
    printHtml(html);
  }

  document.addEventListener("click", (event) => {
    const button = event.target?.closest?.("button");
    if (!button || !button.closest(".kyik-safe-daily")) return;
    if (text(button) !== "Haftalık Liste Yazdır") return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    printWeeklyHidden();
  }, true);
})();
