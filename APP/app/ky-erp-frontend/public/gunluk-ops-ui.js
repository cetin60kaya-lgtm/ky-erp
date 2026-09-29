(() => {
  const VERSION = '20260918-1512-ops-polish';
  const STYLE_ID = 'kyerp-gunluk-ops-polish-style';
  const DASH_ID = 'kyerp-gop-patron-summary';
  const QUICK_INPUT_ID = 'kyerp-quick-add-search';
  const QUICK_LIST_ID = 'kyerp-quick-add-options';
  let queued = false;
  let dashboardBusy = false;
  let lastDashboardRange = '';

  const text = (node) => String(node?.textContent || '').replace(/\s+/g, ' ').trim();
  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const money = (value) => new Intl.NumberFormat('tr-TR', {
    style: 'currency', currency: 'TRY', maximumFractionDigits: 0,
  }).format(Number(value) || 0);
  const normalize = (value) => String(value || '')
    .trim().toLocaleUpperCase('tr-TR').replace(/\s+/g, ' ');

  function token() {
    return String(
      sessionStorage.getItem('kyerp_auth_token') ||
      localStorage.getItem('kyerp_auth_token') ||
      ''
    ).trim();
  }

  function companySlug() {
    const raw = String(localStorage.getItem('kyerp.activeCompany') || '').trim();
    if (!raw) return '';
    try {
      const parsed = JSON.parse(raw);
      return String(parsed?.slug || parsed?.mainCompanySlug || parsed?.id || '').trim();
    } catch {
      return raw;
    }
  }

  async function apiGet(path, params = {}) {
    const auth = token();
    if (!auth) throw new Error('Oturum anahtarı bulunamadı.');
    const url = new URL(`https://api.kyerp.net/api${path}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });
    const slug = companySlug();
    if (slug && !url.searchParams.has('mainCompanySlug')) url.searchParams.set('mainCompanySlug', slug);
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json', Authorization: `Bearer ${auth}` },
      cache: 'no-store', mode: 'cors',
    });
    const raw = await response.text();
    let payload = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch {}
    if (!response.ok) throw new Error(payload?.error?.message || payload?.message || `Sunucu hatası (${response.status})`);
    return payload?.ok === true && Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload;
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .kyik-slip{position:relative!important;transition:border-color .15s ease,box-shadow .15s ease,background .15s ease}
      .kyik-slip.kyerp-print-selected{border-color:#2563eb!important;box-shadow:0 0 0 2px rgba(37,99,235,.12)!important;background:#f8fbff!important}
      .kyik-slip-line b{font-size:13px!important;letter-spacing:-.01em}
      .kyik-slip-line.total b{font-size:17px!important;color:#075bd8!important;font-weight:900!important}
      .kyik-slip-line.total span{font-weight:850!important}
      .kyerp-pay-card-pick{position:absolute;right:8px;top:8px;z-index:3;display:inline-flex;align-items:center;gap:5px;height:25px;padding:0 7px;border:1px solid #cbd8ea;border-radius:7px;background:#fff;color:#475569;font-size:8px;font-weight:850;cursor:pointer}
      .kyerp-pay-card-pick[data-selected="1"]{border-color:#2563eb;background:#eaf3ff;color:#1d4ed8}
      .kyerp-pay-card-pick i{display:grid;place-items:center;width:12px;height:12px;border:1px solid currentColor;border-radius:3px;font-style:normal;font-size:9px;line-height:1}
      .kyerp-pay-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
      .kyerp-pay-actions button{min-height:34px;padding:0 10px;border:1px solid #cddbec;border-radius:7px;background:#fff;color:#24405f;font-weight:800;cursor:pointer}
      .kyerp-pay-actions button.primary{border-color:#236ee8;background:#236ee8;color:#fff}
      .kyerp-pay-actions button:disabled{opacity:.5;cursor:not-allowed}
      .kyerp-pay-actions .count{font-size:9px;color:#64748b;font-weight:800;padding-left:4px}
      .kyerp-quick-search-wrap{position:relative;min-width:260px;flex:1}
      .kyerp-quick-search-wrap input{width:100%;min-height:34px;border:1px solid #cfdceb;border-radius:7px;padding:0 10px;background:#fff;color:#17324e;font-size:10px;outline:none}
      .kyerp-quick-search-wrap input:focus{border-color:#4b91ea;box-shadow:0 0 0 2px rgba(37,99,235,.09)}
      .kyerp-quick-search-wrap small{display:block;margin-top:3px;color:#64748b;font-size:7px}
      #${DASH_ID}{overflow:hidden;background:linear-gradient(135deg,#ffffff 0%,#f7fbff 55%,#f5f3ff 100%);border-color:#cadcf2}
      #${DASH_ID} .kyerp-patron-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:10px}
      #${DASH_ID} .kyerp-patron-head span{font-size:9px;font-weight:900;letter-spacing:.1em;color:#2563eb}
      #${DASH_ID} .kyerp-patron-head h2{margin:2px 0 0;font-size:16px;color:#102548}
      #${DASH_ID} .kyerp-patron-head b{font-size:9px;color:#475569}
      #${DASH_ID} .kyerp-week-compare{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px}
      #${DASH_ID} .kyerp-week-compare article{padding:10px 12px;border:1px solid #dce7f4;border-radius:10px;background:rgba(255,255,255,.88)}
      #${DASH_ID} .kyerp-week-compare article.current{border-color:#9fc4f1;background:#f4f8ff}
      #${DASH_ID} .kyerp-week-compare span,#${DASH_ID} .kyerp-week-compare small{display:block;color:#64748b}
      #${DASH_ID} .kyerp-week-compare span{font-size:8px;font-weight:850}
      #${DASH_ID} .kyerp-week-compare strong{display:block;margin:2px 0;font-size:17px;color:#102548}
      #${DASH_ID} .kyerp-week-compare small{font-size:8px}
      #${DASH_ID} .kyerp-week-compare b{display:block;margin-top:5px;font-size:12px;color:#075bd8}
      #${DASH_ID} .kyerp-role-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}
      #${DASH_ID} .kyerp-role-card{padding:9px 10px;border:1px solid #e1e8f2;border-radius:9px;background:#fff}
      #${DASH_ID} .kyerp-role-card>div{display:flex;align-items:center;justify-content:space-between;gap:8px}
      #${DASH_ID} .kyerp-role-card strong{font-size:10px;color:#17345d}
      #${DASH_ID} .kyerp-role-card em{font-style:normal;font-size:8px;font-weight:850;color:#2563eb}
      #${DASH_ID} .kyerp-role-card span{display:block;margin-top:4px;font-size:8px;color:#64748b}
      #${DASH_ID} .kyerp-role-card b{display:block;margin-top:4px;font-size:11px;color:#0f2344}
      .gop-kpis strong{font-size:21px!important}
      .gop-person-amount{font-size:11px!important;font-weight:900!important}
      @media(max-width:1200px){#${DASH_ID} .kyerp-role-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;
    document.head.appendChild(style);
  }

  function enhanceQuickAdd() {
    document.querySelectorAll('.kyik-quick-person-add').forEach((box) => {
      const select = box.querySelector('select');
      if (!select || select.dataset.kyerpSearchEnhanced === '1') return;
      select.dataset.kyerpSearchEnhanced = '1';
      select.style.display = 'none';

      const wrap = document.createElement('div');
      wrap.className = 'kyerp-quick-search-wrap';
      const input = document.createElement('input');
      input.id = QUICK_INPUT_ID + '-' + Math.random().toString(36).slice(2, 8);
      input.setAttribute('list', QUICK_LIST_ID + '-' + Math.random().toString(36).slice(2, 8));
      input.placeholder = 'Listeye eklenecek personeli ara…';
      input.autocomplete = 'off';
      const list = document.createElement('datalist');
      list.id = input.getAttribute('list');
      const hint = document.createElement('small');
      hint.textContent = 'Ad veya vasıf yaz · yalnız listeye eklenebilecek kişiler';
      wrap.append(input, list, hint);
      box.insertBefore(wrap, select);

      const syncOptions = () => {
        list.innerHTML = '';
        [...select.options].slice(1).forEach((option) => {
          const item = document.createElement('option');
          item.value = text(option);
          item.dataset.value = option.value;
          list.appendChild(item);
        });
      };
      const commitInput = () => {
        const wanted = normalize(input.value);
        const option = [...select.options].slice(1).find((item) => normalize(text(item)) === wanted)
          || [...select.options].slice(1).find((item) => normalize(text(item)).startsWith(wanted));
        if (!wanted || !option) return;
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      };
      input.addEventListener('change', commitInput);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); commitInput(); }
      });
      select.addEventListener('change', () => {
        const option = select.options[select.selectedIndex];
        if (option && option.value) input.value = text(option);
      });
      const addButton = [...box.querySelectorAll('button')].find((button) => text(button).includes('Listeye Ekle'));
      addButton?.addEventListener('click', () => setTimeout(() => { input.value = ''; syncOptions(); }, 80));
      syncOptions();
    });
  }

  const MONTHS = {
    OCA:1,OCAK:1,SUB:2,ŞUB:2,ŞUBAT:2,MAR:3,MART:3,NIS:4,NİS:4,NİSAN:4,MAY:5,MAYIS:5,
    HAZ:6,HAZIRAN:6,TEM:7,TEMMUZ:7,AGU:8,AĞU:8,AĞUSTOS:8,EYL:9,EYLÜL:9,
    EKI:10,EKİ:10,EKİM:10,KAS:11,KASIM:11,ARA:12,ARALIK:12,
  };
  const pad2 = (value) => String(value).padStart(2, '0');

  function parseCompact(part, year) {
    const clean = normalize(part).replace(/[.,]/g, '');
    const match = clean.match(/(\d{1,2})\s+([A-ZÇĞİÖŞÜ]+)/);
    if (!match) return '';
    const month = MONTHS[match[2]];
    if (!month) return '';
    return `${year}-${pad2(month)}-${pad2(Number(match[1]))}`;
  }

  function dashboardRange() {
    const main = document.querySelector('.gop-period-main span');
    const hero = document.querySelector('.gop-hero p');
    if (!main || !hero) return null;
    const yearMatch = text(hero).match(/(20\d{2})/);
    const year = Number(yearMatch?.[1] || new Date().getFullYear());
    const parts = text(main).split('—').map((item) => item.trim());
    if (parts.length !== 2) return null;
    let startDate = parseCompact(parts[0], year);
    let endDate = parseCompact(parts[1], year);
    if (!startDate || !endDate) return null;
    if (endDate < startDate) endDate = parseCompact(parts[1], year + 1);
    return { startDate, endDate };
  }

  function previousRange(startDate, endDate) {
    const shift = (value, days) => {
      const [y,m,d] = value.split('-').map(Number);
      const date = new Date(y, m - 1, d + days);
      return `${date.getFullYear()}-${pad2(date.getMonth()+1)}-${pad2(date.getDate())}`;
    };
    return { startDate: shift(startDate, -7), endDate: shift(endDate, -7) };
  }

  function personRole(row = {}) {
    return String(row.role || row.qualification || row.title || row.department || 'Diğer').trim() || 'Diğer';
  }
  function personDayRate(row = {}) {
    return Number(row.dayRate ?? row.dayWage ?? row.daytimeWage ?? row.gunduzUcreti ?? 0) || 0;
  }
  function personNightRate(row = {}) {
    return Number(row.nightRate ?? row.nightWage ?? row.nighttimeWage ?? row.geceUcreti ?? 0) || 0;
  }

  function normalizeSummary(summaryRaw, employeesRaw) {
    const summary = Array.isArray(summaryRaw) ? summaryRaw : [];
    const employees = Array.isArray(employeesRaw) ? employeesRaw : [];
    const map = new Map(employees.map((person) => [String(person.id), person]));
    return summary.map((row) => {
      const person = map.get(String(row.employeeId)) || {};
      const dayCount = Number(row.dayCount || 0);
      const nightCount = Number(row.nightCount || 0);
      let dayTotal = Number(row.dayTotal || 0);
      let nightTotal = Number(row.nightTotal || 0);
      if (dayCount && !dayTotal) dayTotal = dayCount * personDayRate(person);
      if (nightCount && !nightTotal) nightTotal = nightCount * personNightRate(person);
      const total = Number(row.totalAmount || 0) || dayTotal + nightTotal;
      return { employeeId:String(row.employeeId || ''), role:personRole(person), dayCount, nightCount, dayTotal, nightTotal, total };
    }).filter((row) => row.dayCount + row.nightCount > 0 || row.total > 0);
  }

  function summarizeWeek(rows) {
    return rows.reduce((acc, row) => {
      if (row.employeeId) acc.people.add(row.employeeId);
      acc.day += row.dayCount;
      acc.night += row.nightCount;
      acc.total += row.total;
      const key = row.role || 'Diğer';
      const role = acc.roles.get(key) || { role:key, people:new Set(), day:0, night:0, total:0 };
      if (row.employeeId) role.people.add(row.employeeId);
      role.day += row.dayCount;
      role.night += row.nightCount;
      role.total += row.total;
      acc.roles.set(key, role);
      return acc;
    }, { people:new Set(), day:0, night:0, total:0, roles:new Map() });
  }

  function rangeLabel(range) {
    const fmt = (value) => {
      const [y,m,d] = value.split('-').map(Number);
      return new Intl.DateTimeFormat('tr-TR',{day:'2-digit',month:'short'}).format(new Date(y,m-1,d));
    };
    return `${fmt(range.startDate)} — ${fmt(range.endDate)}`;
  }

  async function enhanceDashboard() {
    const page = document.querySelector('.gop-page');
    if (!page) { lastDashboardRange = ''; return; }
    const range = dashboardRange();
    if (!range || dashboardBusy) return;
    const key = `${range.startDate}|${range.endDate}`;
    if (key === lastDashboardRange && document.getElementById(DASH_ID)) return;
    dashboardBusy = true;
    try {
      const prev = previousRange(range.startDate, range.endDate);
      const [currentRaw, previousRaw, employeesRaw] = await Promise.all([
        apiGet('/ik/daily-attendance/weekly-summary', range),
        apiGet('/ik/daily-attendance/weekly-summary', prev),
        apiGet('/ik/daily-employees', { includePassive:true }),
      ]);
      const current = summarizeWeek(normalizeSummary(currentRaw, employeesRaw));
      const previous = summarizeWeek(normalizeSummary(previousRaw, employeesRaw));
      const roles = [...current.roles.values()].sort((a,b) => b.total - a.total || a.role.localeCompare(b.role,'tr'));
      const section = document.getElementById(DASH_ID) || document.createElement('section');
      section.id = DASH_ID;
      section.className = 'gop-card';
      section.innerHTML = `
        <div class="kyerp-patron-head"><div><span>PATRON HAFTALIK ÖZETİ</span><h2>Bu hafta nerede duruyor?</h2></div><b>${esc(rangeLabel(range))}</b></div>
        <div class="kyerp-week-compare">
          <article class="current"><span>BU HAFTA · ${esc(rangeLabel(range))}</span><strong>${current.people.size} kişi</strong><small>G ${current.day} · N ${current.night} · ${current.day + current.night} vardiya</small><b>${esc(money(current.total))}</b></article>
          <article><span>GEÇEN HAFTA · ${esc(rangeLabel(prev))}</span><strong>${previous.people.size} kişi</strong><small>G ${previous.day} · N ${previous.night} · ${previous.day + previous.night} vardiya</small><b>${esc(money(previous.total))}</b></article>
        </div>
        <div class="kyerp-role-grid">${roles.map((role) => `<article class="kyerp-role-card"><div><strong>${esc(role.role)}</strong><em>${role.people.size} kişi</em></div><span>G ${role.day} · N ${role.night}</span><b>${esc(money(role.total))}</b></article>`).join('') || '<article class="kyerp-role-card"><strong>Bu hafta kayıt yok</strong></article>'}</div>`;
      const monthCard = page.querySelector('.gop-month-card');
      if (!section.isConnected) page.insertBefore(section, monthCard || null);
      lastDashboardRange = key;
    } catch (error) {
      console.warn('[KY ERP] Günlük Operasyon patron özeti yüklenemedi:', error);
    } finally {
      dashboardBusy = false;
    }
  }

  function enhance() {
    installStyle();
    enhanceQuickAdd();
    enhanceDashboard();
  }

  function queue() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      enhance();
    });
  }

  const observer = new MutationObserver(queue);
  observer.observe(document.documentElement, { subtree:true, childList:true, characterData:true });
  window.addEventListener('pageshow', queue);
  window.addEventListener('popstate', queue);
  queue();
  window.__KYERP_GUNLUK_OPS_UI__ = { version:VERSION };
})();
