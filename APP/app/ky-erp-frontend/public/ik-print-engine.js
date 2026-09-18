(() => {
  const VERSION = '20260918-1412-final';
  const ROOT_ID = 'kyerp-ik-print-engine-root';
  const STYLE_ID = 'kyerp-ik-print-engine-style';
  let busy = false;

  const text = (node) => String(node?.textContent || '').replace(/\s+/g, ' ').trim();
  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const money = (value) => new Intl.NumberFormat('tr-TR', {
    style: 'currency', currency: 'TRY', maximumFractionDigits: 0,
  }).format(Number(value) || 0);

  function cleanup() {
    document.getElementById(ROOT_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    busy = false;
  }

  function installPrint(css, html) {
    document.getElementById(ROOT_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = css;
    document.head.appendChild(style);
    const root = document.createElement('section');
    root.id = ROOT_ID;
    root.innerHTML = html;
    document.body.appendChild(root);
    window.addEventListener('afterprint', () => setTimeout(cleanup, 80), { once: true });
    setTimeout(() => window.print(), 60);
  }

  function activeCompanySlug() {
    const raw = String(window.localStorage.getItem('kyerp.activeCompany') || '').trim();
    if (!raw) return '';
    try {
      const parsed = JSON.parse(raw);
      return String(parsed?.slug || parsed?.mainCompanySlug || parsed?.id || raw).trim();
    } catch { return raw; }
  }

  function authToken() {
    return String(
      window.sessionStorage.getItem('kyerp_auth_token') ||
      window.localStorage.getItem('kyerp_auth_token') ||
      ''
    ).trim();
  }

  async function apiGet(path, params = {}) {
    const token = authToken();
    if (!token) throw new Error('Oturum anahtarı bulunamadı. Sayfayı yenileyip tekrar deneyin.');
    const url = new URL(`https://api.kyerp.net/api${path}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });
    const slug = activeCompanySlug();
    if (slug && !url.searchParams.has('mainCompanySlug')) url.searchParams.set('mainCompanySlug', slug);
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      cache: 'no-store', mode: 'cors',
    });
    const raw = await response.text();
    let payload = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }
    if (!response.ok) {
      if (response.status === 401) throw new Error('Oturum süresi dolmuş. Sayfayı bir kez yenileyip tekrar deneyin.');
      throw new Error(payload?.error?.message || payload?.message || `Sunucu hatası (${response.status})`);
    }
    return payload && typeof payload === 'object' && payload.ok === true && Object.prototype.hasOwnProperty.call(payload, 'data')
      ? payload.data : payload;
  }

  function employeeName(employee = {}) {
    return String(employee.name || employee.fullName || employee.adSoyad || employee.employeeName || 'Personel').trim();
  }
  function employeeRole(employee = {}) {
    return String(employee.role || employee.qualification || employee.title || employee.department || '-').trim();
  }
  function employeeNo(employee = {}) {
    return String(employee.personnelNo || employee.code || employee.personnelCode || '-').trim();
  }

  async function printWeekly(root) {
    if (busy) return;
    const inputs = [...root.querySelectorAll('.kyik-safe-actions input[type="date"]')];
    const startDate = String(inputs[0]?.value || '').trim();
    const endDate = String(inputs[1]?.value || '').trim();
    if (!startDate || !endDate) return window.alert('Önce başlangıç ve bitiş tarihini seçin.');
    busy = true;
    try {
      const [summaryRaw, employeesRaw] = await Promise.all([
        apiGet('/ik/daily-attendance/weekly-summary', { startDate, endDate }),
        apiGet('/ik/daily-employees', { includePassive: true }),
      ]);
      const summary = Array.isArray(summaryRaw) ? summaryRaw : [];
      const employees = Array.isArray(employeesRaw) ? employeesRaw : [];
      const employeeMap = new Map(employees.map((item) => [String(item.id), item]));
      const rows = summary
        .filter((row) => Number(row?.dayCount || 0) + Number(row?.nightCount || 0) > 0)
        .map((row) => {
          const employee = employeeMap.get(String(row.employeeId)) || {};
          return {
            no: employeeNo(employee), name: employeeName(employee), role: employeeRole(employee),
            dayCount: Number(row.dayCount || 0), dayTotal: Number(row.dayTotal || 0),
            nightCount: Number(row.nightCount || 0), nightTotal: Number(row.nightTotal || 0),
            total: Number(row.totalAmount || 0),
          };
        })
        .sort((a, b) => String(a.role).localeCompare(String(b.role), 'tr') || String(a.name).localeCompare(String(b.name), 'tr'));
      if (!rows.length) throw new Error('Seçili tarih aralığında vardiya kaydı bulunan personel yok.');
      const totals = rows.reduce((a, r) => ({
        dayCount: a.dayCount + r.dayCount, dayTotal: a.dayTotal + r.dayTotal,
        nightCount: a.nightCount + r.nightCount, nightTotal: a.nightTotal + r.nightTotal,
        total: a.total + r.total,
      }), { dayCount: 0, dayTotal: 0, nightCount: 0, nightTotal: 0, total: 0 });
      const body = rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.no)}</td><td class="left">${esc(r.name)}</td><td class="left">${esc(r.role)}</td><td>${r.dayCount}</td><td>${esc(money(r.dayTotal))}</td><td>${r.nightCount}</td><td>${esc(money(r.nightTotal))}</td><td>${esc(money(r.total))}</td></tr>`).join('');
      const html = `<div class="weekly-sheet"><h1>HAFTALIK ÖDEME LİSTESİ</h1><p>${esc(startDate)} - ${esc(endDate)} · ${rows.length} kişi</p><table><colgroup><col class="n"><col class="no"><col class="name"><col class="role"><col class="cnt"><col class="amt"><col class="cnt"><col class="amt"><col class="amt"></colgroup><thead><tr><th>#</th><th>No</th><th class="left">Personel</th><th class="left">Vasıf</th><th>Gündüz Adet</th><th>Gündüz Tutar</th><th>Gece Adet</th><th>Gece Tutar</th><th>Ödenecek</th></tr></thead><tbody>${body}</tbody><tfoot><tr><td colspan="4" class="left">GENEL TOPLAM</td><td>${totals.dayCount}</td><td>${esc(money(totals.dayTotal))}</td><td>${totals.nightCount}</td><td>${esc(money(totals.nightTotal))}</td><td>${esc(money(totals.total))}</td></tr></tfoot></table></div>`;
      const css = `#${ROOT_ID}{display:none}@media print{@page{size:A4 landscape;margin:8mm}html,body{margin:0!important;padding:0!important}body *{visibility:hidden!important}#${ROOT_ID},#${ROOT_ID} *{visibility:visible!important}#${ROOT_ID}{display:block!important;position:absolute!important;inset:0 auto auto 0!important;width:100%!important;background:#fff!important;color:#111!important;font-family:Arial,sans-serif!important}.weekly-sheet{width:265mm!important;margin:0 auto!important}.weekly-sheet h1{font-size:15px;text-align:center;margin:0 0 1.5mm}.weekly-sheet p{font-size:8px;text-align:center;margin:0 0 3mm}.weekly-sheet table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8.2px}.weekly-sheet th,.weekly-sheet td{border:1px solid #111;padding:2.1mm 1.3mm;text-align:center;line-height:1.08}.weekly-sheet th{font-weight:700;background:#eef2f7!important}.weekly-sheet .left{text-align:left!important}.weekly-sheet tfoot td{font-weight:700;background:#f8fafc!important}.weekly-sheet tr{break-inside:avoid!important}.weekly-sheet col.n{width:4%}.weekly-sheet col.no{width:9%}.weekly-sheet col.name{width:24%}.weekly-sheet col.role{width:14%}.weekly-sheet col.cnt{width:8%}.weekly-sheet col.amt{width:12.3%}}`;
      installPrint(css, html);
    } catch (error) {
      busy = false;
      window.alert(error?.message || 'Haftalık liste hazırlanamadı.');
    }
  }

  function paymentScreenFor(button) {
    const screen = button.closest('.kyik-screen');
    if (!screen) return null;
    const headingText = text(screen.querySelector('.kyik-panel-head')) || text(screen.querySelector('h2,h3')) || text(screen).slice(0, 160);
    return headingText.toLocaleUpperCase('tr-TR').includes('GÜNLÜK ÖDEME FİŞLERİ') ? screen : null;
  }

  function parseSlipCard(card) {
    const name = text(card.querySelector('.kyik-slip-head strong')) || 'Personel';
    const role = text(card.querySelector(':scope > span')) || '-';
    const lines = [...card.querySelectorAll('.kyik-slip-line')].map((line) => ({
      label: text(line.querySelector('span')).toLocaleUpperCase('tr-TR'),
      value: text(line.querySelector('b')),
    }));
    const pick = (needle) => lines.find((line) => line.label.includes(needle))?.value || '₺0';
    const dayText = pick('GÜNDÜZ');
    const nightText = pick('GECE');
    const totalText = pick('ÖDENECEK');
    return { name, role, dayText, nightText, totalText };
  }

  function printPayment(screen) {
    if (busy) return;
    const cards = [...screen.querySelectorAll('.kyik-slip-grid .kyik-slip')];
    if (!cards.length) return window.alert('Yazdırılacak ödeme fişi bulunamadı.');
    busy = true;
    const rows = cards.map(parseSlipCard);
    const dateInputs = [...screen.querySelectorAll('input[type="date"]')];
    const startDate = String(dateInputs[0]?.value || '').trim();
    const endDate = String(dateInputs[1]?.value || '').trim();
    const range = [startDate, endDate].filter(Boolean).join(' - ');
    const pages = [];
    for (let i = 0; i < rows.length; i += 10) pages.push(rows.slice(i, i + 10));
    const cardHtml = (row) => `<article class="slip"><h2>PERSONEL ÖDEME FİŞİ</h2><h3>${esc(row.name)}</h3><div class="role">${esc(row.role)}</div><div class="date">Tarih: ${esc(range || '-')}</div><div class="label">VARDİYA ÖZETİ</div><table><thead><tr><th>Vardiya</th><th>Özet</th></tr></thead><tbody><tr><td>GÜNDÜZ</td><td>${esc(row.dayText)}</td></tr><tr><td>GECE</td><td>${esc(row.nightText)}</td></tr></tbody></table><div class="pay"><span>TOPLAM ÖDEME</span><strong>${esc(row.totalText)}</strong></div></article>`;
    const html = pages.map((page, pageIndex) => `<section class="pay-page"><header><b>EL ÖDEME FİŞLERİ</b><span>${esc(range)} · Sayfa ${pageIndex + 1}/${pages.length}</span></header><div class="grid">${page.map(cardHtml).join('')}</div></section>`).join('');
    const css = `#${ROOT_ID}{display:none}@media print{@page{size:A4 portrait;margin:7mm}html,body{margin:0!important;padding:0!important;height:auto!important}body *{visibility:hidden!important}#${ROOT_ID},#${ROOT_ID} *{visibility:visible!important}#${ROOT_ID}{display:block!important;position:absolute!important;left:0!important;top:0!important;width:100%!important;background:#fff!important;color:#111!important;font-family:Arial,sans-serif!important}.pay-page{width:196mm!important;height:283mm!important;margin:0 auto!important;box-sizing:border-box!important;page-break-after:always!important;break-after:page!important;overflow:hidden!important}.pay-page:last-child{page-break-after:auto!important;break-after:auto!important}.pay-page header{height:8mm;display:flex;justify-content:space-between;align-items:center;font-size:7px}.pay-page header b{font-size:10px}.grid{display:grid!important;grid-template-columns:96mm 96mm!important;grid-template-rows:repeat(5,52mm)!important;gap:2mm 4mm!important;width:196mm!important;height:268mm!important}.slip{width:96mm!important;height:52mm!important;box-sizing:border-box!important;border:1px solid #777!important;padding:2mm 3mm!important;overflow:hidden!important;break-inside:avoid!important}.slip h2{font-size:7px;text-align:center;margin:0 0 .5mm}.slip h3{font-size:10px;text-align:center;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.slip .role{font-size:6px;text-align:center;margin:.4mm 0}.slip .date{font-size:6px;margin:.5mm 0}.slip .label{font-size:6px;font-weight:700;margin:.5mm 0}.slip table{width:100%;border-collapse:collapse;font-size:6px}.slip th,.slip td{border:1px solid #777;padding:.8mm 1mm;text-align:left}.slip .pay{display:flex;justify-content:space-between;align-items:flex-end;border-top:1px solid #111;margin-top:1.2mm;padding-top:1.2mm}.slip .pay span{font-size:7px;font-weight:700}.slip .pay strong{font-size:14px}}`;
    installPrint(css, html);
  }

  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('button');
    if (!button) return;
    const label = text(button);
    if (label === 'Haftalık Liste Yazdır' && button.closest('.kyik-safe-daily')) {
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      printWeekly(button.closest('.kyik-safe-daily'));
      return;
    }
    if (label === 'PDF İndir') {
      const screen = paymentScreenFor(button);
      if (!screen) return;
      event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
      printPayment(screen);
    }
  }, true);

  window.__KYERP_IK_PRINT_ENGINE__ = { version: VERSION };
})();
