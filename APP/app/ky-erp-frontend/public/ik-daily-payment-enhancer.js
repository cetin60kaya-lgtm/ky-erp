(() => {
  const V = '20260925-1320-paylog-control-v2';
  const API = 'https://api.kyerp.net/api';
  const STYLE_ID = 'ky-pay-enh-style';
  const CONTROL_TAB = 'person-control';
  const originalFetch = window.fetch.bind(window);
  let syncTimer = 0;
  let logTimer = 0;
  let enhanceQueued = false;
  let controlCache = null;

  const textOf = (node) => String(node?.textContent || '').replace(/\s+/g, ' ').trim();
  const norm = (value) => String(value || '').trim().toLocaleUpperCase('tr-TR').replace(/\s+/g, ' ');
  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const money = (value) => new Intl.NumberFormat('tr-TR', {
    style: 'currency', currency: 'TRY', maximumFractionDigits: 0,
  }).format(Number(value) || 0);
  const fmtDate = (iso) => {
    const [y, m, d] = String(iso || '').slice(0, 10).split('-').map(Number);
    if (!y || !m || !d) return String(iso || '-');
    return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
      .format(new Date(y, m - 1, d));
  };
  const addDays = (iso, amount) => {
    const [y, m, d] = String(iso || '').slice(0, 10).split('-').map(Number);
    const date = new Date(y, (m || 1) - 1, (d || 1) + amount);
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  };
  const truthy = (value) => value === true || value === 1 || value === '1';
  const token = () => String(sessionStorage.getItem('kyerp_auth_token') || localStorage.getItem('kyerp_auth_token') || '').trim();
  const company = () => {
    const raw = String(localStorage.getItem('kyerp.activeCompany') || '').trim();
    if (!raw) return 'mecit-hakan';
    try {
      const parsed = JSON.parse(raw);
      return String(parsed?.slug || parsed?.mainCompanySlug || parsed?.id || 'mecit-hakan').trim();
    } catch {
      return raw || 'mecit-hakan';
    }
  };

  async function api(path, { method = 'GET', params = {}, body } = {}) {
    const auth = token();
    if (!auth) throw new Error('Oturum anahtarı bulunamadı. Yeniden giriş yapın.');
    const url = new URL(`${API}${path}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== '' && value !== undefined && value !== null) url.searchParams.set(key, String(value));
    });
    if (!url.searchParams.has('mainCompanyId')) url.searchParams.set('mainCompanyId', company());
    const response = await originalFetch(url.toString(), {
      method,
      headers: {
        Accept: 'application/json',
        ...(method === 'GET' ? {} : { 'Content-Type': 'application/json' }),
        Authorization: `Bearer ${auth}`,
        'X-KYERP-Tenant-Slug': company(),
      },
      body: method === 'GET' ? undefined : JSON.stringify(body || {}),
      cache: 'no-store', credentials: 'include', mode: 'cors',
    });
    const raw = await response.text();
    let payload = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch {}
    if (!response.ok) throw new Error(payload?.error?.message || payload?.message || `Sunucu hatası (${response.status})`);
    if (payload?.ok === true && Object.prototype.hasOwnProperty.call(payload, 'data')) return payload.data;
    if (Array.isArray(payload?.items)) return payload.items;
    return payload;
  }

  function installStyle() {
    let style = document.getElementById(STYLE_ID);
    if (style) style.remove();
    style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .kyik-slip.ky-pay-paid{border-color:#86efac!important;background:#f0fdf4!important;box-shadow:inset 4px 0 0 #22c55e}
      .kyerp-log-item.ky-pay-log{border-color:#86efac!important;background:#f0fdf4!important;box-shadow:inset 4px 0 0 #22c55e}
      .kyerp-log-item.ky-pay-log .kyerp-log-action strong{background:#dcfce7!important;color:#166534!important;border:1px solid #86efac}
      .kyerp-log-item.ky-pay-log .kyerp-log-action span{color:#15803d!important;font-weight:900}
      .ky-pay-note{display:block;margin-top:5px;padding:6px 8px;border-radius:7px;background:#dcfce7;color:#166534;font-size:11px;font-weight:900}
      .ky-pay-toast{position:fixed;right:18px;bottom:18px;z-index:2147483600;padding:11px 14px;border-radius:10px;background:#15803d;color:#fff;font:800 12px Arial;box-shadow:0 12px 30px rgba(15,23,42,.2)}
      .ky-pay-toast.err{background:#b91c1c}
      .kyerp-log-tabs button[data-pay-control-tab].active{border-color:#2563c7;background:#eaf2ff;color:#174ea6}
      .ky-pay-control{display:grid;gap:12px}
      .ky-pay-control-head{display:grid;grid-template-columns:minmax(260px,1fr) minmax(220px,320px);gap:10px;align-items:end}
      .ky-pay-control-head label{display:grid;gap:5px;color:#64748b;font-size:11px;font-weight:850}
      .ky-pay-control-head input,.ky-pay-control-head select{height:40px;border:1px solid #cbd8e6;border-radius:9px;background:#fff;padding:0 11px;color:#17385f;font-size:13px;font-weight:750;outline:none}
      .ky-pay-control-range{border:1px solid #dbe5f0;border-radius:10px;background:#fff;padding:9px 11px;color:#53677f;font-size:11px;font-weight:800}
      .ky-pay-control-person{border:1px solid #cfe0f1;border-radius:12px;background:#f8fbff;padding:12px 13px}
      .ky-pay-control-person h3{margin:0;color:#123c70;font-size:16px}.ky-pay-control-person p{margin:4px 0 0;color:#64748b;font-size:11px}
      .ky-pay-control-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
      .ky-pay-control-kpis article{border:1px solid #dbe5f0;border-radius:10px;background:#fff;padding:9px 10px}.ky-pay-control-kpis span{display:block;color:#64748b;font-size:10px;font-weight:800}.ky-pay-control-kpis strong{display:block;margin-top:3px;color:#123c70;font-size:17px}
      .ky-pay-control-list{display:grid;gap:6px}.ky-pay-control-row{display:grid;grid-template-columns:150px 120px 120px 100px;gap:10px;align-items:center;border:1px solid #dce6f0;border-radius:9px;background:#fff;padding:9px 11px;font-size:12px}
      .ky-pay-control-row b{color:#17385f}.ky-pay-shift-day{color:#b45309;font-weight:900}.ky-pay-shift-night{color:#1d4ed8;font-weight:900}.ky-pay-control-amount{text-align:right;color:#17385f;font-weight:900}
      .ky-pay-state{justify-self:end;min-width:72px;border-radius:999px;padding:4px 7px;text-align:center;font-size:10px;font-weight:900;background:#fff7ed;color:#b45309;border:1px solid #fed7aa}.ky-pay-state.paid{background:#dcfce7;color:#166534;border-color:#86efac}
      .ky-pay-control-empty{padding:28px;text-align:center;color:#718197;background:#fff;border:1px dashed #cedbe8;border-radius:10px}
      @media(max-width:760px){.ky-pay-control-head{grid-template-columns:1fr}.ky-pay-control-kpis{grid-template-columns:1fr 1fr}.ky-pay-control-row{grid-template-columns:1fr 1fr}.ky-pay-state{justify-self:start}.ky-pay-control-amount{text-align:left}}
    `;
    document.head.appendChild(style);
  }

  function toast(message, error = false) {
    document.querySelector('.ky-pay-toast')?.remove();
    const node = document.createElement('div');
    node.className = `ky-pay-toast${error ? ' err' : ''}`;
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(() => node.remove(), 4200);
  }

  function dateRange(root) {
    const inputs = [...root.querySelectorAll('input[type="date"]')];
    return { start: String(inputs[0]?.value || '').slice(0, 10), end: String(inputs[1]?.value || '').slice(0, 10) };
  }

  function paymentScreen() {
    return [...document.querySelectorAll('.kyik-screen')].find((node) => norm(textOf(node)).includes('GÜNLÜK ÖDEME FİŞLERİ')) || null;
  }

  if (!window.__KYERP_PAY_RATE_GUARD_V2__) {
    window.__KYERP_PAY_RATE_GUARD_V2__ = V;
    window.fetch = async (input, init) => {
      const urlText = typeof input === 'string' ? input : String(input?.url || input || '');
      if (!urlText.includes('/api/ik/daily-attendance/weekly-summary')) return originalFetch(input, init);
      const response = await originalFetch(input, init);
      const backup = response.clone();
      try {
        const payload = await response.json();
        const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.items) ? payload.items : null;
        if (!rows) return backup;
        const people = await api('/ik/daily-employees', { params: { includePassive: true } });
        const peopleMap = new Map((Array.isArray(people) ? people : []).map((person) => [String(person.id || person.employeeId || ''), person]));
        rows.forEach((row) => {
          const person = peopleMap.get(String(row.employeeId || row.personId || '')) || {};
          const dayCount = Number(row.dayCount || 0);
          const nightCount = Number(row.nightCount || 0);
          const dayRate = Number(person.dayRate ?? person.dayWage ?? 0) || 0;
          const nightRate = Number(person.nightRate ?? person.nightWage ?? 0) || 0;
          row.dayRate = dayRate;
          row.nightRate = nightRate;
          row.dayTotal = dayCount * dayRate;
          row.nightTotal = nightCount * nightRate;
          row.totalAmount = row.dayTotal + row.nightTotal;
          row.total = row.totalAmount;
        });
        return new Response(JSON.stringify(payload), { status: response.status, statusText: response.statusText, headers: response.headers });
      } catch {
        return backup;
      }
    };
  }

  async function syncPaidCards() {
    const screen = paymentScreen();
    if (!screen) return;
    const { start, end } = dateRange(screen);
    if (!start || !end) return;
    const [people, attendance] = await Promise.all([
      api('/ik/daily-employees', { params: { includePassive: true } }),
      api('/ik/daily-attendance', { params: { startDate: start, endDate: end } }),
    ]);
    const byName = new Map((people || []).map((person) => [norm(person.name || person.fullName), person]));
    screen.querySelectorAll('.kyik-slip-grid .kyik-slip').forEach((card) => {
      const person = byName.get(norm(textOf(card.querySelector('.kyik-slip-head strong'))));
      const rows = (attendance || []).filter((row) => String(row.employeeId || row.personId || '') === String(person?.id || person?.employeeId || '') && (truthy(row.dayShift ?? row.day) || truthy(row.nightShift ?? row.night)));
      const paid = rows.length > 0 && rows.every((row) => norm(row.paymentStatus || row.payment_status) === 'PAID');
      card.classList.toggle('ky-pay-paid', paid);
      if (paid) {
        const badge = [...card.querySelectorAll('*')].find((node) => node.children.length === 0 && ['HAZIR', 'ÖDENDİ'].includes(norm(textOf(node))));
        if (badge) badge.textContent = 'Ödendi';
      }
    });
  }

  async function markPaid() {
    const screen = paymentScreen();
    if (!screen) return;
    const { start, end } = dateRange(screen);
    const visibleNames = [...screen.querySelectorAll('.kyik-slip-grid .kyik-slip')].filter((card) => card.offsetParent !== null).map((card) => norm(textOf(card.querySelector('.kyik-slip-head strong'))));
    const [people, attendance] = await Promise.all([
      api('/ik/daily-employees', { params: { includePassive: true } }),
      api('/ik/daily-attendance', { params: { startDate: start, endDate: end } }),
    ]);
    const employeeIds = new Set((people || []).filter((person) => visibleNames.includes(norm(person.name || person.fullName))).map((person) => String(person.id || person.employeeId || '')));
    const rows = (attendance || []).filter((row) => employeeIds.has(String(row.employeeId || row.personId || ''))).filter((row) => truthy(row.dayShift ?? row.day) || truthy(row.nightShift ?? row.night)).filter((row) => norm(row.paymentStatus || row.payment_status) !== 'PAID').map((row) => ({
      employeeId: String(row.employeeId || row.personId || ''), workDate: String(row.workDate || row.date || '').slice(0, 10),
      dayShift: truthy(row.dayShift ?? row.day), nightShift: truthy(row.nightShift ?? row.night), paymentStatus: 'PAID',
      expectedUpdatedAt: row.updatedAt || row.updated_at || '', reason: 'Günlük ödeme fişleri ekranından ödendi işaretlendi',
    }));
    for (let index = 0; index < rows.length; index += 40) {
      await api('/ik/daily-attendance/save-range', { method: 'POST', body: { mainCompanyId: company(), rows: rows.slice(index, index + 40) } });
    }
    await syncPaidCards();
    toast(rows.length ? 'Ödeme durumu kalıcı kaydedildi.' : 'Kayıtlar zaten ödenmiş.');
    setTimeout(() => syncPaidLog().catch(() => {}), 300);
  }

  async function syncPaidLog() {
    const overlay = document.getElementById('kyerp-daily-log-overlay');
    if (!overlay || overlay.hidden || overlay.dataset.tab === CONTROL_TAB) return;
    const start = overlay.querySelector('[data-start]')?.value;
    const end = overlay.querySelector('[data-end]')?.value;
    if (!start || !end) return;
    const dates = [];
    for (let date = start; date <= end && dates.length < 31; date = addDays(date, 1)) dates.push(date);
    const auditDays = await Promise.all(dates.map((date) => api('/ik/daily-operation-audit', { params: { date, limit: 300 } }).catch(() => [])));
    const paidRequestIds = new Set();
    auditDays.flat().forEach((row) => {
      const after = norm(row?.after?.paymentStatus ?? row?.after?.payment_status);
      const before = norm(row?.before?.paymentStatus ?? row?.before?.payment_status);
      if (after === 'PAID' && before !== 'PAID' && row.requestId) paidRequestIds.add(String(row.requestId).slice(0, 18));
    });
    overlay.querySelectorAll('.kyerp-log-item').forEach((item) => {
      if (![...paidRequestIds].some((id) => textOf(item).includes(id))) return;
      item.classList.add('ky-pay-log');
      const action = item.querySelector('.kyerp-log-action strong');
      const meta = item.querySelector('.kyerp-log-action span');
      const detail = item.querySelector('.kyerp-log-detail');
      if (action) action.textContent = 'ÖDENDİ';
      if (meta && !textOf(meta).includes('Bu kayıt ödenmiştir')) meta.textContent = `Bu kayıt ödenmiştir · ${textOf(meta)}`;
      if (detail && !detail.querySelector('.ky-pay-note')) detail.insertAdjacentHTML('beforeend', '<span class="ky-pay-note">✓ Bu kayıt ödenmiştir.</span>');
    });
  }

  async function loadControlData(overlay, force = false) {
    const start = overlay.querySelector('[data-start]')?.value;
    const end = overlay.querySelector('[data-end]')?.value;
    if (!start || !end || start > end) throw new Error('Geçerli tarih aralığı seçilmedi.');
    const key = `${company()}|${start}|${end}`;
    if (!force && controlCache?.key === key) return controlCache;
    const [peopleRaw, attendanceRaw] = await Promise.all([
      api('/ik/daily-employees', { params: { includePassive: true } }),
      api('/ik/daily-attendance', { params: { startDate: start, endDate: end } }),
    ]);
    controlCache = { key, start, end, people: Array.isArray(peopleRaw) ? peopleRaw : [], attendance: Array.isArray(attendanceRaw) ? attendanceRaw : [] };
    return controlCache;
  }

  function personLabel(person) {
    const code = String(person.personnelNo || person.personnelCode || person.code || '').trim();
    const name = String(person.name || person.fullName || '').trim();
    return code ? `${code} · ${name}` : name;
  }

  function renderPersonRows(cache, person) {
    const id = String(person.id || person.employeeId || '');
    const dayRate = Number(person.dayRate ?? person.dayWage ?? 0) || 0;
    const nightRate = Number(person.nightRate ?? person.nightWage ?? 0) || 0;
    const items = [];
    cache.attendance.filter((row) => String(row.employeeId || row.personId || '') === id).sort((a, b) => String(a.workDate || a.date || '').localeCompare(String(b.workDate || b.date || ''))).forEach((row) => {
      const date = String(row.workDate || row.date || '').slice(0, 10);
      const paid = norm(row.paymentStatus || row.payment_status) === 'PAID';
      if (truthy(row.dayShift ?? row.day)) items.push({ date, shift: 'Gündüz', cls: 'day', amount: dayRate, paid });
      if (truthy(row.nightShift ?? row.night)) items.push({ date, shift: 'Gece', cls: 'night', amount: nightRate, paid });
    });
    const dayCount = items.filter((item) => item.cls === 'day').length;
    const nightCount = items.filter((item) => item.cls === 'night').length;
    const total = items.reduce((sum, item) => sum + item.amount, 0);
    const paidCount = items.filter((item) => item.paid).length;
    return `<section class="ky-pay-control-person"><h3>${esc(personLabel(person))}</h3><p>${esc(person.qualification || person.role || '')} · ${esc(fmtDate(cache.start))} — ${esc(fmtDate(cache.end))}</p></section>
      <div class="ky-pay-control-kpis"><article><span>Gündüz</span><strong>${dayCount}</strong></article><article><span>Gece</span><strong>${nightCount}</strong></article><article><span>Ödendi vardiya</span><strong>${paidCount} / ${items.length}</strong></article><article><span>Toplam</span><strong>${esc(money(total))}</strong></article></div>
      ${items.length ? `<div class="ky-pay-control-list">${items.map((item) => `<div class="ky-pay-control-row"><b>${esc(fmtDate(item.date))}</b><span class="ky-pay-shift-${item.cls}">${esc(item.shift)}</span><span class="ky-pay-control-amount">${esc(money(item.amount))}</span><span class="ky-pay-state ${item.paid ? 'paid' : ''}">${item.paid ? 'Ödendi' : 'Hazır'}</span></div>`).join('')}</div>` : '<div class="ky-pay-control-empty">Bu personelin seçili tarih aralığında çalışma kaydı yok.</div>'}`;
  }

  async function renderControl(overlay, selectedId = '') {
    const body = overlay.querySelector('[data-body]');
    if (!body) return;
    body.innerHTML = '<div class="kyerp-load-state">Personel kontrolü hazırlanıyor…</div>';
    try {
      const cache = await loadControlData(overlay);
      const activePeople = cache.people.filter((person) => cache.attendance.some((row) => String(row.employeeId || row.personId || '') === String(person.id || person.employeeId || '') && (truthy(row.dayShift ?? row.day) || truthy(row.nightShift ?? row.night)))).sort((a, b) => personLabel(a).localeCompare(personLabel(b), 'tr'));
      const selected = activePeople.find((person) => String(person.id || person.employeeId || '') === String(selectedId)) || activePeople[0] || null;
      body.innerHTML = `<div class="ky-pay-control"><div class="ky-pay-control-head"><label>Personel ara<input type="search" data-pay-person-search placeholder="Ad veya HKN kodu yazın" autocomplete="off"></label><label>Personel seç<select data-pay-person-select>${activePeople.map((person) => `<option value="${esc(String(person.id || person.employeeId || ''))}" ${selected && String(person.id || person.employeeId || '') === String(selected.id || selected.employeeId || '') ? 'selected' : ''}>${esc(personLabel(person))}</option>`).join('')}</select></label></div><div class="ky-pay-control-range">Seçili dönem: <b>${esc(fmtDate(cache.start))}</b> — <b>${esc(fmtDate(cache.end))}</b> · yalnız çalışması olan personeller listelenir.</div><div data-pay-person-result>${selected ? renderPersonRows(cache, selected) : '<div class="ky-pay-control-empty">Bu tarih aralığında çalışma kaydı olan personel yok.</div>'}</div></div>`;
      const search = body.querySelector('[data-pay-person-search]');
      const select = body.querySelector('[data-pay-person-select]');
      const result = body.querySelector('[data-pay-person-result]');
      if (!select || !result) return;
      const updateResult = () => {
        const person = activePeople.find((item) => String(item.id || item.employeeId || '') === select.value);
        result.innerHTML = person ? renderPersonRows(cache, person) : '<div class="ky-pay-control-empty">Personel seçin.</div>';
      };
      select.addEventListener('change', updateResult);
      search?.addEventListener('input', () => {
        const term = norm(search.value);
        const matches = activePeople.filter((person) => norm(personLabel(person)).includes(term));
        select.innerHTML = matches.map((person) => `<option value="${esc(String(person.id || person.employeeId || ''))}">${esc(personLabel(person))}</option>`).join('');
        updateResult();
      });
    } catch (error) {
      body.innerHTML = `<div class="ky-pay-control-empty">${esc(error?.message || 'Personel kontrolü yüklenemedi.')}</div>`;
    }
  }

  function ensureControlTab() {
    const overlay = document.getElementById('kyerp-daily-log-overlay');
    if (!overlay) return;
    const tabs = overlay.querySelector('.kyerp-log-tabs');
    if (!tabs) return;
    let button = tabs.querySelector('[data-pay-control-tab]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.dataset.payControlTab = '1';
      button.textContent = 'Personel Kontrol';
      tabs.appendChild(button);
      button.addEventListener('click', () => {
        overlay.dataset.tab = CONTROL_TAB;
        tabs.querySelectorAll('button').forEach((item) => item.classList.toggle('active', item === button));
        renderControl(overlay).catch(() => {});
      });
    }
  }

  function removeLegacyPoolDetail() {
    document.getElementById('ky-pay-person-detail')?.remove();
    document.querySelectorAll('.kyik-safe-pool-list button.ky-pay-selected').forEach((button) => button.classList.remove('ky-pay-selected'));
  }

  function enhance() {
    installStyle();
    removeLegacyPoolDetail();
    ensureControlTab();
    syncPaidCards().catch(() => {});
    syncPaidLog().catch(() => {});
    document.documentElement.dataset.kyerpPaymentEnhancer = V;
  }

  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('button');
    if (!button) return;
    if (textOf(button) === 'Ödendi İşaretle') markPaid().catch((error) => toast(`Ödeme kaydedilemedi: ${error.message}`, true));
    const overlay = button.closest('#kyerp-daily-log-overlay');
    if (overlay) {
      if (button.dataset.logTab && button.dataset.logTab !== CONTROL_TAB) overlay.querySelector('[data-pay-control-tab]')?.classList.remove('active');
      clearTimeout(logTimer);
      logTimer = setTimeout(() => {
        ensureControlTab();
        if (overlay.dataset.tab === CONTROL_TAB) renderControl(overlay).catch(() => {});
        else syncPaidLog().catch(() => {});
      }, 300);
    }
  }, false);

  document.addEventListener('change', (event) => {
    if (event.target?.matches?.('.kyik-screen input[type="date"]')) {
      clearTimeout(syncTimer);
      syncTimer = setTimeout(() => syncPaidCards().catch(() => {}), 300);
    }
  }, false);

  const observer = new MutationObserver(() => {
    if (enhanceQueued) return;
    enhanceQueued = true;
    requestAnimationFrame(() => {
      enhanceQueued = false;
      ensureControlTab();
      removeLegacyPoolDetail();
      const overlay = document.getElementById('kyerp-daily-log-overlay');
      if (overlay && !overlay.hidden && overlay.dataset.tab !== CONTROL_TAB) syncPaidLog().catch(() => {});
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhance, { once: true });
  else enhance();
})();
