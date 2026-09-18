(() => {
  const PRINT_ROOT_ID = "kyerp-weekly-hidden-print-root";
  const PRINT_STYLE_ID = "kyerp-weekly-hidden-print-style";
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
        await sleep(180);
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
        await sleep(190);
        return true;
      }
      await sleep(40);
    }
    return false;
  }

  function parsePersonRow(row) {
    const name = row.querySelector(".kyik-safe-name-title strong")?.textContent?.trim() || row.querySelector("td strong")?.textContent?.trim() || "Personel";
    const noNode = [...row.querySelectorAll(".kyik-safe-name-row > small")].find((node) => !node.classList.contains("kyik-safe-entry-status"));
    const no = noNode?.textContent?.trim() || "";
    return {
      key: no || name,
      no,
      name,
      role: row.cells?.[1]?.textContent?.trim() || "",
      dayRate: parseTRY(row.cells?.[3]?.textContent || ""),
      nightRate: parseTRY(row.cells?.[4]?.textContent || ""),
    };
  }

  function scrapeAllRows(root) {
    return [...root.querySelectorAll(".kyik-safe-table-wrap tbody tr.kyik-safe-row")].map(parsePersonRow);
  }

  function scrapeSelectedRows(root) {
    return [...root.querySelectorAll(".kyik-safe-table-wrap tbody tr.kyik-safe-row.selected-entry")].map(parsePersonRow);
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
        @page{size:A4 landscape;margin:7mm}
        html,body{margin:0!important;padding:0!important;height:auto!important;overflow:visible!important}
        body *{visibility:hidden!important}
        #${PRINT_ROOT_ID},#${PRINT_ROOT_ID} *{visibility:visible!important}
        #${PRINT_ROOT_ID}{display:block!important;position:absolute!important;left:0!important;top:0!important;width:100%!important;margin:0!important;padding:0!important;background:#fff!important;color:#111!important;font-family:Arial,Helvetica,sans-serif!important}
        #${PRINT_ROOT_ID} .sheet{width:270mm!important;max-width:100%!important;margin-left:auto!important;margin-right:auto!important;padding:0!important}
        #${PRINT_ROOT_ID} .title{text-align:center;font-size:16px;font-weight:900;margin:0 0 2mm}
        #${PRINT_ROOT_ID} .sub{text-align:center;font-size:9px;font-weight:700;margin:0 0 4mm}
        #${PRINT_ROOT_ID} table{width:100%!important;margin-left:auto!important;margin-right:auto!important;border-collapse:collapse;table-layout:fixed;font-size:10px}
        #${PRINT_ROOT_ID} th,#${PRINT_ROOT_ID} td{border:1px solid #111;padding:4px 5px;text-align:center;line-height:1.2}
        #${PRINT_ROOT_ID} th{background:#eef2f7!important;font-weight:900}
        #${PRINT_ROOT_ID} .left{text-align:left!important}
        #${PRINT_ROOT_ID} .money{white-space:nowrap;font-weight:800}
        #${PRINT_ROOT_ID} tfoot td{font-weight:900;background:#f8fafc!important}
        #${PRINT_ROOT_ID} tbody tr{break-inside:avoid!important;page-break-inside:avoid!important}
        #${PRINT_ROOT_ID} .c-no{width:12mm}
        #${PRINT_ROOT_ID} .c-code{width:28mm}
        #${PRINT_ROOT_ID} .c-name{width:58mm}
        #${PRINT_ROOT_ID} .c-role{width:38mm}
        #${PRINT_ROOT_ID} .c-count{width:25mm}
        #${PRINT_ROOT_ID} .c-amount{width:36mm}
      }
    `;
    document.head.appendChild(style);
    const root = document.createElement("section");
    root.id = PRINT_ROOT_ID;
    root.innerHTML = html;
    document.body.appendChild(root);
    window.addEventListener("afterprint", () => setTimeout(cleanupPrint, 100), { once: true });
    setTimeout(() => window.print(), 60);
  }

  async function printWeeklyHidden() {
    if (busy) return;
    const root = document.querySelector(".kyik-safe-daily");
    if (!root) return;
    const dayButtons = [...root.querySelectorAll(".kyik-safe-days > button")];
    if (!dayButtons.length) return;

    busy = true;
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
            const current = people.get(person.key) || { ...person, dayCount: 0, nightCount: 0 };
            current.name = person.name || current.name;
            current.no = person.no || current.no;
            current.role = person.role || current.role;
            current.dayRate = person.dayRate || current.dayRate || 0;
            current.nightRate = person.nightRate || current.nightRate || 0;
            if (mode === "day") current.dayCount += 1;
            else current.nightCount += 1;
            people.set(person.key, current);
          }
        }
      }
    } catch (error) {
      try { await selectDay(root, originalDay); await selectMode(root, originalMode); } catch {}
      busy = false;
      window.alert(error?.message || "Haftalık liste hazırlanamadı.");
      return;
    }

    await selectDay(root, originalDay);
    await selectMode(root, originalMode);

    const list = [...people.values()]
      .filter((person) => Number(person.dayCount || 0) + Number(person.nightCount || 0) > 0)
      .sort((a, b) =>
        String(a.role || "").localeCompare(String(b.role || ""), "tr") ||
        String(a.name || "").localeCompare(String(b.name || ""), "tr"),
      );

    if (!list.length) {
      busy = false;
      window.alert("Seçili tarih aralığında vardiya kaydı bulunan personel yok.");
      return;
    }

    let dayCount = 0;
    let nightCount = 0;
    let dayAmount = 0;
    let nightAmount = 0;
    const body = list.map((person, index) => {
      const dc = Number(person.dayCount || 0);
      const nc = Number(person.nightCount || 0);
      const da = dc * (person.dayRate || 0);
      const na = nc * (person.nightRate || 0);
      dayCount += dc;
      nightCount += nc;
      dayAmount += da;
      nightAmount += na;
      return `<tr><td>${index + 1}</td><td>${esc(person.no || "-")}</td><td class="left">${esc(person.name)}</td><td class="left">${esc(person.role || "-")}</td><td>${dc}</td><td class="money">${esc(money(da))}</td><td>${nc}</td><td class="money">${esc(money(na))}</td><td class="money">${esc(money(da + na))}</td></tr>`;
    }).join("");

    const rangeInputs = [...root.querySelectorAll('.kyik-safe-actions input[type="date"]')];
    const start = rangeInputs[0]?.value || "";
    const end = rangeInputs[1]?.value || "";
    const html = `<div class="sheet"><div class="title">HAFTALIK PERSONEL ÖZETİ</div><div class="sub">${esc(start)} — ${esc(end)} · Bu aralıkta vardiya kaydı olan ${list.length} personel</div><table><thead><tr><th class="c-no">#</th><th class="c-code">No</th><th class="c-name left">Personel</th><th class="c-role left">Vasıf</th><th class="c-count">Gündüz Adet</th><th class="c-amount">Gündüz Tutar</th><th class="c-count">Gece Adet</th><th class="c-amount">Gece Tutar</th><th class="c-amount">Toplam</th></tr></thead><tbody>${body}</tbody><tfoot><tr><td colspan="4" class="left">GENEL TOPLAM</td><td>${dayCount}</td><td class="money">${esc(money(dayAmount))}</td><td>${nightCount}</td><td class="money">${esc(money(nightAmount))}</td><td class="money">${esc(money(dayAmount + nightAmount))}</td></tr></tfoot></table></div>`;
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
