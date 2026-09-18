(() => {
  const PRINT_ROOT_ID = "kyerp-weekly-direct-print-root";
  const PRINT_STYLE_ID = "kyerp-weekly-direct-print-style";
  let busy = false;

  const text = (node) => String(node?.textContent || "").replace(/\s+/g, " ").trim();
  const esc = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  const money = (value) => new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(Number(value) || 0);

  function unwrap(payload) {
    return payload && typeof payload === "object" && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, "data")
      ? payload.data
      : payload;
  }

  function activeCompanySlug() {
    const raw = String(window.localStorage.getItem("kyerp.activeCompany") || "").trim();
    if (!raw) return "";
    try {
      const parsed = JSON.parse(raw);
      return String(parsed?.slug || parsed?.mainCompanySlug || parsed?.id || raw).trim();
    } catch {
      return raw;
    }
  }

  async function apiGet(path, params = {}) {
    const token = String(window.localStorage.getItem("kyerp_auth_token") || "").trim();
    const url = new URL(`https://api.kyerp.net/api${path}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
    });
    const slug = activeCompanySlug();
    if (slug && !url.searchParams.has("mainCompanySlug")) url.searchParams.set("mainCompanySlug", slug);
    const response = await fetch(url.toString(), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: "include",
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message || `Sunucu hatası (${response.status})`);
    return unwrap(payload);
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
        @page{size:A4 landscape;margin:10mm}
        html,body{margin:0!important;padding:0!important;height:auto!important;overflow:visible!important}
        body *{visibility:hidden!important}
        #${PRINT_ROOT_ID},#${PRINT_ROOT_ID} *{visibility:visible!important}
        #${PRINT_ROOT_ID}{display:block!important;position:absolute!important;left:0!important;top:0!important;width:100%!important;margin:0!important;padding:0!important;background:#fff!important;color:#111!important;font-family:Arial,Helvetica,sans-serif!important}
        #${PRINT_ROOT_ID} .sheet{width:252mm!important;max-width:252mm!important;margin:0 auto!important;padding:0!important}
        #${PRINT_ROOT_ID} .title{text-align:center;font-size:16px;font-weight:900;margin:0 0 2mm}
        #${PRINT_ROOT_ID} .sub{text-align:center;font-size:9px;font-weight:700;margin:0 0 4mm}
        #${PRINT_ROOT_ID} table{width:252mm!important;max-width:252mm!important;margin:0 auto!important;border-collapse:collapse;table-layout:fixed;font-size:9.5px}
        #${PRINT_ROOT_ID} thead{display:table-header-group!important}
        #${PRINT_ROOT_ID} th,#${PRINT_ROOT_ID} td{border:1px solid #111;padding:4px 4px;text-align:center;line-height:1.18;overflow:hidden;word-break:break-word}
        #${PRINT_ROOT_ID} th{background:#eef2f7!important;font-weight:900}
        #${PRINT_ROOT_ID} .left{text-align:left!important}
        #${PRINT_ROOT_ID} .money{white-space:nowrap;font-weight:800}
        #${PRINT_ROOT_ID} tfoot td{font-weight:900;background:#f8fafc!important}
        #${PRINT_ROOT_ID} tbody tr{break-inside:avoid!important;page-break-inside:avoid!important}
        #${PRINT_ROOT_ID} col.c1{width:4%} #${PRINT_ROOT_ID} col.c2{width:10%}
        #${PRINT_ROOT_ID} col.c3{width:22%} #${PRINT_ROOT_ID} col.c4{width:14%}
        #${PRINT_ROOT_ID} col.c5{width:8%} #${PRINT_ROOT_ID} col.c6{width:12%}
        #${PRINT_ROOT_ID} col.c7{width:8%} #${PRINT_ROOT_ID} col.c8{width:12%}
        #${PRINT_ROOT_ID} col.c9{width:10%}
      }
    `;
    document.head.appendChild(style);

    const root = document.createElement("section");
    root.id = PRINT_ROOT_ID;
    root.innerHTML = html;
    document.body.appendChild(root);
    window.addEventListener("afterprint", () => setTimeout(cleanupPrint, 100), { once: true });
    setTimeout(() => window.print(), 50);
  }

  function employeeName(employee = {}) {
    return String(employee.name || employee.fullName || employee.adSoyad || employee.employeeName || "Personel").trim();
  }

  function employeeRole(employee = {}) {
    return String(employee.role || employee.qualification || employee.title || employee.department || "-").trim();
  }

  function employeeNo(employee = {}) {
    return String(employee.personnelNo || employee.code || employee.personnelCode || "-").trim();
  }

  async function printWeeklyDirect() {
    if (busy) return;
    const root = document.querySelector(".kyik-safe-daily");
    if (!root) return;

    const rangeInputs = [...root.querySelectorAll('.kyik-safe-actions input[type="date"]')];
    const startDate = String(rangeInputs[0]?.value || "").trim();
    const endDate = String(rangeInputs[1]?.value || "").trim();
    if (!startDate || !endDate) {
      window.alert("Önce başlangıç ve bitiş tarihini seçin.");
      return;
    }

    busy = true;
    try {
      const [summaryRaw, employeesRaw] = await Promise.all([
        apiGet("/ik/daily-attendance/weekly-summary", { startDate, endDate }),
        apiGet("/ik/daily-employees", { includePassive: true }),
      ]);

      const summary = Array.isArray(summaryRaw) ? summaryRaw : [];
      const employees = Array.isArray(employeesRaw) ? employeesRaw : [];
      const employeeMap = new Map(employees.map((employee) => [String(employee.id), employee]));

      const rows = summary
        .filter((row) => Number(row?.dayCount || 0) + Number(row?.nightCount || 0) > 0)
        .map((row) => {
          const employee = employeeMap.get(String(row.employeeId)) || {};
          return {
            employeeId: row.employeeId,
            no: employeeNo(employee),
            name: employeeName(employee),
            role: employeeRole(employee),
            dayCount: Number(row.dayCount || 0),
            dayTotal: Number(row.dayTotal || 0),
            nightCount: Number(row.nightCount || 0),
            nightTotal: Number(row.nightTotal || 0),
            total: Number(row.totalAmount || 0),
          };
        })
        .sort((a, b) =>
          String(a.role).localeCompare(String(b.role), "tr") || String(a.name).localeCompare(String(b.name), "tr"),
        );

      if (!rows.length) {
        busy = false;
        window.alert("Seçili tarih aralığında vardiya kaydı bulunan personel yok.");
        return;
      }

      const totals = rows.reduce((acc, row) => ({
        dayCount: acc.dayCount + row.dayCount,
        dayTotal: acc.dayTotal + row.dayTotal,
        nightCount: acc.nightCount + row.nightCount,
        nightTotal: acc.nightTotal + row.nightTotal,
        total: acc.total + row.total,
      }), { dayCount: 0, dayTotal: 0, nightCount: 0, nightTotal: 0, total: 0 });

      const body = rows.map((row, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${esc(row.no)}</td>
          <td class="left">${esc(row.name)}</td>
          <td class="left">${esc(row.role)}</td>
          <td>${row.dayCount}</td>
          <td class="money">${esc(money(row.dayTotal))}</td>
          <td>${row.nightCount}</td>
          <td class="money">${esc(money(row.nightTotal))}</td>
          <td class="money">${esc(money(row.total))}</td>
        </tr>`).join("");

      const html = `
        <div class="sheet">
          <div class="title">HAFTALIK PERSONEL ÖZETİ</div>
          <div class="sub">${esc(startDate)} — ${esc(endDate)} · ${rows.length} personel</div>
          <table>
            <colgroup><col class="c1"><col class="c2"><col class="c3"><col class="c4"><col class="c5"><col class="c6"><col class="c7"><col class="c8"><col class="c9"></colgroup>
            <thead><tr><th>#</th><th>No</th><th class="left">Personel</th><th class="left">Vasıf</th><th>Gündüz Adet</th><th>Gündüz Tutar</th><th>Gece Adet</th><th>Gece Tutar</th><th>Toplam</th></tr></thead>
            <tbody>${body}</tbody>
            <tfoot><tr><td colspan="4" class="left">GENEL TOPLAM</td><td>${totals.dayCount}</td><td class="money">${esc(money(totals.dayTotal))}</td><td>${totals.nightCount}</td><td class="money">${esc(money(totals.nightTotal))}</td><td class="money">${esc(money(totals.total))}</td></tr></tfoot>
          </table>
        </div>`;

      printHtml(html);
    } catch (error) {
      busy = false;
      window.alert(error?.message || "Haftalık liste hazırlanamadı.");
    }
  }

  document.addEventListener("click", (event) => {
    const button = event.target?.closest?.("button");
    if (!button || !button.closest(".kyik-safe-daily")) return;
    if (text(button) !== "Haftalık Liste Yazdır") return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    printWeeklyDirect();
  }, true);
})();
