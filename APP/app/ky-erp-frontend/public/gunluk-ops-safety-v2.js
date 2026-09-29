(() => {
  const VERSION = '20260925-0015-daily-log-current-rate-v5';
  const STYLE_ID = 'kyerp-daily-safety-v2-style';
  const ANALYSIS_BUTTON_ID = 'kyerp-gop-analysis-button';
  const ANALYSIS_OVERLAY_ID = 'kyerp-gop-analysis-overlay';
  const LOG_BAR_ID = 'kyerp-daily-log-bar';
  const LOG_OVERLAY_ID = 'kyerp-daily-log-overlay';
  const API_BASE = 'https://api.kyerp.net/api';
  let queued = false;

  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  const money = (value) => new Intl.NumberFormat('tr-TR', {
    style: 'currency', currency: 'TRY', maximumFractionDigits: 0,
  }).format(Number(value) || 0);
  const pad = (value) => String(value).padStart(2, '0');
  const localIso = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const addDays = (iso, amount) => {
    const [y, m, d] = String(iso).split('-').map(Number);
    const date = new Date(y, (m || 1) - 1, (d || 1) + amount);
    return localIso(date);
  };
  const today = () => localIso(new Date());
  const mondayOf = (iso) => {
    const [y, m, d] = String(iso).split('-').map(Number);
    const date = new Date(y, (m || 1) - 1, d || 1);
    const weekday = date.getDay() || 7;
    date.setDate(date.getDate() - weekday + 1);
    return localIso(date);
  };
  const monthRange = (iso, delta = 0) => {
    const [y, m] = String(iso).split('-').map(Number);
    const first = new Date(y, (m || 1) - 1 + delta, 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    return { start: localIso(first), end: localIso(last) };
  };
  const fmtDate = (iso) => {
    const [y, m, d] = String(iso || '').split('-').map(Number);
    if (!y || !m || !d) return String(iso || '-');
    return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
      .format(new Date(y, m - 1, d));
  };
  const fmtDateTime = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value || '-');
    return new Intl.DateTimeFormat('tr-TR', {
      timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(date);
  };

  function token() {
    return String(sessionStorage.getItem('kyerp_auth_token') || localStorage.getItem('kyerp_auth_token') || '').trim();
  }
  function companySlug() {
    const raw = String(localStorage.getItem('kyerp.activeCompany') || '').trim();
    if (!raw) return 'mecit-hakan';
    try {
      const parsed = JSON.parse(raw);
      return String(parsed?.slug || parsed?.mainCompanySlug || parsed?.id || 'mecit-hakan').trim();
    } catch { return raw || 'mecit-hakan'; }
  }
  async function apiGet(path, params = {}) {
    const auth = token();
    if (!auth) throw new Error('Oturum anahtarı bulunamadı. Yeniden giriş yapın.');
    const url = new URL(`${API_BASE}${path}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    });
    if (!url.searchParams.has('mainCompanyId')) url.searchParams.set('mainCompanyId', companySlug());
    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json', Authorization: `Bearer ${auth}`, 'X-KYERP-Tenant-Slug': companySlug() },
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
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .gop-month-card.kyerp-legacy-report-hidden{display:none!important}
      #${ANALYSIS_BUTTON_ID}{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:38px;padding:0 13px;border:1px solid #b9cce3;border-radius:9px;background:#fff;color:#17385f;font-weight:850;cursor:pointer;white-space:nowrap}
      #${ANALYSIS_BUTTON_ID}:hover{border-color:#3b82f6;background:#f4f8ff;color:#1d4ed8}
      #${LOG_BAR_ID}{margin-left:auto;display:inline-flex;align-items:center;gap:6px;flex:0 0 auto}
      #${LOG_BAR_ID} button{border:1px solid #b9cce3;background:#fff;color:#26496f;border-radius:9px;min-height:38px;padding:0 13px;font-size:12px;font-weight:900;cursor:pointer;white-space:nowrap}
      #${LOG_BAR_ID} button:hover{border-color:#7da8db;background:#f4f8ff;color:#1d5db7}
      .kyerp-fixed-overlay{position:fixed;inset:0;z-index:2147482000;background:rgba(11,25,45,.52);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center;padding:18px}
      .kyerp-fixed-overlay[hidden]{display:none!important}
      .kyerp-drawer{width:min(1180px,96vw);max-height:92vh;overflow:hidden;border-radius:16px;background:#f7f9fc;border:1px solid #cddaea;box-shadow:0 30px 80px rgba(15,35,64,.30);display:flex;flex-direction:column;color:#18314f}
      .kyerp-drawer.log{width:min(1050px,96vw)}
      .kyerp-drawer-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:14px 16px 12px;background:#fff;border-bottom:1px solid #dfe7f1}
      .kyerp-drawer-head span{display:block;color:#2f75d6;font-size:9px;font-weight:900;letter-spacing:.08em}
      .kyerp-drawer-head h2{margin:3px 0 2px;font-size:19px;color:#102b4e}
      .kyerp-drawer-head p{margin:0;color:#6a7b90;font-size:10px}
      .kyerp-drawer-close{border:1px solid #d3dfeb;background:#fff;color:#41566f;border-radius:8px;width:34px;height:34px;font-size:19px;cursor:pointer}
      .kyerp-drawer-toolbar{display:flex;align-items:end;gap:8px;flex-wrap:wrap;padding:10px 16px;background:#f7f9fc;border-bottom:1px solid #dde6ef}
      .kyerp-drawer-toolbar label{display:grid;gap:3px;color:#68798e;font-size:8px;font-weight:850}
      .kyerp-drawer-toolbar select,.kyerp-drawer-toolbar input{height:34px;min-width:138px;border:1px solid #cbd8e6;border-radius:8px;background:#fff;padding:0 9px;color:#1f3d60;font-size:10px;outline:none}
      .kyerp-drawer-toolbar button{height:34px;border:1px solid #266fd3;border-radius:8px;background:#2563c7;color:#fff;padding:0 12px;font-size:9px;font-weight:900;cursor:pointer}
      .kyerp-drawer-body{overflow:auto;padding:12px 16px 16px;min-height:180px}
      .kyerp-load-state{padding:36px 16px;text-align:center;color:#68798e;font-size:11px}
      .kyerp-analysis-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:10px}
      .kyerp-analysis-kpis article{border:1px solid #dbe5f0;border-radius:11px;background:#fff;padding:10px 11px;min-width:0}
      .kyerp-analysis-kpis span{display:block;color:#738197;font-size:8px;font-weight:800}
      .kyerp-analysis-kpis strong{display:block;margin-top:3px;color:#102f55;font-size:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .kyerp-analysis-kpis small{display:block;margin-top:2px;color:#6f8196;font-size:8px}
      .kyerp-analysis-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .kyerp-analysis-card{border:1px solid #dae5ef;border-radius:11px;background:#fff;overflow:hidden}
      .kyerp-analysis-card h3{margin:0;padding:10px 11px;border-bottom:1px solid #e7edf4;color:#203e62;font-size:11px}
      .kyerp-analysis-table{width:100%;border-collapse:collapse;font-size:9px}
      .kyerp-analysis-table th,.kyerp-analysis-table td{padding:7px 9px;border-bottom:1px solid #edf1f5;text-align:left;white-space:nowrap}
      .kyerp-analysis-table th{position:sticky;top:0;background:#f8fafc;color:#64748b;font-size:8px;z-index:1}
      .kyerp-analysis-table td.num{text-align:right;font-variant-numeric:tabular-nums}
      .kyerp-analysis-table tr:last-child td{border-bottom:0}
      .kyerp-log-list{display:grid;gap:7px}
      .kyerp-log-item{display:grid;grid-template-columns:145px minmax(160px,1.2fr) minmax(170px,1fr) minmax(240px,2fr);gap:9px;align-items:center;border:1px solid #dce6f0;border-radius:10px;background:#fff;padding:9px 10px;font-size:9px}
      .kyerp-log-time b,.kyerp-log-person b{display:block;color:#1c395c}
      .kyerp-log-time small,.kyerp-log-person small,.kyerp-log-detail small{display:block;color:#7a899a;margin-top:2px}
      .kyerp-log-action strong{display:inline-flex;padding:4px 7px;border-radius:999px;background:#eef5ff;color:#205fb3;font-size:8px}
      .kyerp-log-action span{display:block;margin-top:4px;color:#61768d}
      .kyerp-log-detail{min-width:0;color:#354d68}
      .kyerp-log-detail b{color:#172f50}
      .kyerp-empty{padding:28px;text-align:center;color:#718197;background:#fff;border:1px dashed #cedbe8;border-radius:10px}
      .kyerp-drawer.log{width:min(1240px,97vw)}
      .kyerp-drawer.log .kyerp-drawer-head span{font-size:11px}.kyerp-drawer.log .kyerp-drawer-head h2{font-size:22px}.kyerp-drawer.log .kyerp-drawer-head p{font-size:12px}
      .kyerp-log-tabs{display:flex;gap:7px;padding:9px 16px 0;background:#f7f9fc}.kyerp-log-tabs button{border:1px solid #c9d8e8;background:#fff;color:#365675;border-radius:9px;padding:8px 13px;font-size:11px;font-weight:900;cursor:pointer}.kyerp-log-tabs button.active{border-color:#2563c7;background:#eaf2ff;color:#174ea6}
      .kyerp-log-advanced{display:none!important}#${LOG_OVERLAY_ID}[data-tab="advanced"] .kyerp-log-advanced{display:grid!important}
      .kyerp-drawer.log .kyerp-drawer-toolbar label{font-size:11px}.kyerp-drawer.log .kyerp-drawer-toolbar input,.kyerp-drawer.log .kyerp-drawer-toolbar select{height:38px;font-size:12px}.kyerp-drawer.log .kyerp-drawer-toolbar button{height:38px;font-size:11px}
      .kyerp-log-overview{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px;margin-bottom:12px}.kyerp-log-overview article{border:1px solid #dbe5f0;border-radius:11px;background:#fff;padding:10px 11px}.kyerp-log-overview span{display:block;color:#64748b;font-size:11px;font-weight:800}.kyerp-log-overview strong{display:block;margin-top:4px;color:#102f55;font-size:19px}.kyerp-log-overview small{display:block;margin-top:2px;color:#718197;font-size:10px}
      .kyerp-drawer.log .kyerp-log-list{gap:8px}.kyerp-drawer.log .kyerp-log-item{grid-template-columns:155px minmax(180px,1fr) minmax(170px,.9fr) minmax(330px,1.7fr);padding:11px 12px;font-size:12px}.kyerp-drawer.log .kyerp-log-time b,.kyerp-drawer.log .kyerp-log-person b{font-size:12px}.kyerp-drawer.log .kyerp-log-time small,.kyerp-drawer.log .kyerp-log-person small,.kyerp-drawer.log .kyerp-log-detail small{font-size:10px}.kyerp-drawer.log .kyerp-log-action strong{font-size:10px}.kyerp-drawer.log .kyerp-log-action span{font-size:10px}
      .kyerp-log-workdate{display:block;margin-top:5px;color:#1d4ed8;font-size:11px}.kyerp-log-current{margin-top:6px;padding:7px 9px;border-radius:7px;background:#eef5ff;color:#173f70;font-size:11px;font-weight:900;line-height:1.45}

      @media(max-width:900px){.kyerp-analysis-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.kyerp-analysis-grid{grid-template-columns:1fr}.kyerp-log-item{grid-template-columns:1fr 1fr}.kyerp-drawer{max-height:95vh}}
      @media(max-width:600px){.kyerp-fixed-overlay{padding:6px}.kyerp-analysis-kpis{grid-template-columns:1fr 1fr}.kyerp-log-item{grid-template-columns:1fr}.kyerp-drawer-toolbar label{flex:1}.kyerp-drawer-toolbar select,.kyerp-drawer-toolbar input{min-width:0;width:100%}}
    `;
    document.head.appendChild(style);
  }

  function presetRange(value) {
    const now = today();
    const monday = mondayOf(now);
    if (value === 'last-week') return { start: addDays(monday, -7), end: addDays(monday, -1) };
    if (value === 'this-month') return monthRange(now, 0);
    if (value === 'last-month') return monthRange(now, -1);
    return { start: monday, end: addDays(monday, 6) };
  }

  function ensureAnalysisButton() {
    const page = document.querySelector('.gop-page');
    if (!page) return;
    page.querySelectorAll('.gop-month-card').forEach((card) => card.classList.add('kyerp-legacy-report-hidden'));
    if (document.getElementById(ANALYSIS_BUTTON_ID)) return;
    const actions = page.querySelector('.gop-hero-actions');
    if (!actions) return;
    const button = document.createElement('button');
    button.id = ANALYSIS_BUTTON_ID;
    button.type = 'button';
    button.innerHTML = '<span>▦</span> Rapor & Analiz';
    button.title = 'Tarih aralığı, bu hafta/geçen hafta, gündüz-gece gideri ve vasıf dağılımı';
    button.addEventListener('click', openAnalysis);
    actions.appendChild(button);
  }

  function ensureAnalysisOverlay() {
    let overlay = document.getElementById(ANALYSIS_OVERLAY_ID);
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = ANALYSIS_OVERLAY_ID;
    overlay.className = 'kyerp-fixed-overlay';
    overlay.hidden = true;
    const initial = presetRange('this-week');
    overlay.innerHTML = `
      <section class="kyerp-drawer" role="dialog" aria-modal="true" aria-label="Günlük Operasyon rapor ve analiz">
        <header class="kyerp-drawer-head"><div><span>GÜNLÜK OPERASYON / AÇILIR RAPOR</span><h2>Rapor & Analiz</h2><p>Sayfayı uzatmadan tarih aralığı, vardiya gideri ve vasıf kırılımı.</p></div><button class="kyerp-drawer-close" type="button" data-close>×</button></header>
        <div class="kyerp-drawer-toolbar">
          <label>Dönem<select data-preset><option value="this-week">Bu Hafta</option><option value="last-week">Geçen Hafta</option><option value="this-month">Bu Ay</option><option value="last-month">Geçen Ay</option><option value="custom">Özel Tarih</option></select></label>
          <label>Başlangıç<input data-start type="date" value="${initial.start}"></label>
          <label>Bitiş<input data-end type="date" value="${initial.end}"></label>
          <button type="button" data-load>Raporu Getir</button>
        </div>
        <div class="kyerp-drawer-body" data-body><div class="kyerp-load-state">Rapor yüklenmeye hazır.</div></div>
      </section>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (event) => { if (event.target === overlay || event.target.closest('[data-close]')) closeOverlay(overlay); });
    const preset = overlay.querySelector('[data-preset]');
    preset.addEventListener('change', () => {
      if (preset.value === 'custom') return;
      const range = presetRange(preset.value);
      overlay.querySelector('[data-start]').value = range.start;
      overlay.querySelector('[data-end]').value = range.end;
      loadAnalysis(overlay);
    });
    overlay.querySelectorAll('[data-start],[data-end]').forEach((input) => input.addEventListener('change', () => { preset.value = 'custom'; }));
    overlay.querySelector('[data-load]').addEventListener('click', () => loadAnalysis(overlay));
    return overlay;
  }

  function openAnalysis() {
    const overlay = ensureAnalysisOverlay();
    overlay.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    loadAnalysis(overlay);
  }

  async function loadAnalysis(overlay) {
    const body = overlay.querySelector('[data-body]');
    const start = overlay.querySelector('[data-start]').value;
    const end = overlay.querySelector('[data-end]').value;
    if (!start || !end || start > end) {
      body.innerHTML = '<div class="kyerp-empty">Geçerli bir tarih aralığı seçin.</div>';
      return;
    }
    body.innerHTML = '<div class="kyerp-load-state">Günlük operasyon verileri okunuyor…</div>';
    try {
      const [peopleRaw, attendanceRaw] = await Promise.all([
        apiGet('/ik/daily-employees'), apiGet('/ik/daily-attendance', { startDate: start, endDate: end }),
      ]);
      const people = Array.isArray(peopleRaw) ? peopleRaw : [];
      const rows = Array.isArray(attendanceRaw) ? attendanceRaw : [];
      const peopleMap = new Map(people.map((person) => [String(person.id || ''), person]));
      const roles = new Map();
      const days = new Map();
      const unique = new Set();
      let dayCount = 0, nightCount = 0, dayTotal = 0, nightTotal = 0;
      rows.forEach((row) => {
        const employeeId = String(row.employeeId || row.personId || '');
        const person = peopleMap.get(employeeId) || {};
        const role = String(person.qualification || person.role || 'Vasıf Yok / Tanımsız').trim() || 'Vasıf Yok / Tanımsız';
        const workDate = String(row.workDate || row.date || '').slice(0, 10);
        const day = Boolean(row.dayShift ?? row.day);
        const night = Boolean(row.nightShift ?? row.night);
        const dCost = day ? Number(row.dayWage || row.dayRate || 0) : 0;
        const nCost = night ? Number(row.nightWage || row.nightRate || 0) : 0;
        if (day || night) unique.add(employeeId);
        if (day) { dayCount += 1; dayTotal += dCost; }
        if (night) { nightCount += 1; nightTotal += nCost; }
        const roleRow = roles.get(role) || { role, people: new Set(), day: 0, night: 0, total: 0 };
        if (employeeId) roleRow.people.add(employeeId);
        if (day) roleRow.day += 1;
        if (night) roleRow.night += 1;
        roleRow.total += dCost + nCost;
        roles.set(role, roleRow);
        const dayRow = days.get(workDate) || { date: workDate, people: new Set(), day: 0, night: 0, dayTotal: 0, nightTotal: 0 };
        if (employeeId) dayRow.people.add(employeeId);
        if (day) { dayRow.day += 1; dayRow.dayTotal += dCost; }
        if (night) { dayRow.night += 1; dayRow.nightTotal += nCost; }
        days.set(workDate, dayRow);
      });
      const roleRows = [...roles.values()].sort((a, b) => b.total - a.total || a.role.localeCompare(b.role, 'tr'));
      const dayRows = [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
      body.innerHTML = `
        <div class="kyerp-analysis-kpis">
          <article><span>Dönem · Güncel ücret</span><strong>${esc(fmtDate(start))}</strong><small>${esc(fmtDate(end))} tarihine kadar</small></article>
          <article><span>Farklı Personel</span><strong>${unique.size}</strong><small>${rows.length} günlük kayıt</small></article>
          <article><span>Gündüz</span><strong>${dayCount}</strong><small>${money(dayTotal)}</small></article>
          <article><span>Gece</span><strong>${nightCount}</strong><small>${money(nightTotal)}</small></article>
          <article><span>Toplam Gider</span><strong>${money(dayTotal + nightTotal)}</strong><small>Gündüz + gece</small></article>
        </div>
        <div class="kyerp-analysis-grid">
          <section class="kyerp-analysis-card"><h3>Vasıfa Göre Gündüz / Gece / Gider</h3>${roleRows.length ? `<table class="kyerp-analysis-table"><thead><tr><th>Vasıf</th><th>Kişi</th><th>Gündüz</th><th>Gece</th><th>Gider</th></tr></thead><tbody>${roleRows.map((row) => `<tr><td><b>${esc(row.role)}</b></td><td class="num">${row.people.size}</td><td class="num">${row.day}</td><td class="num">${row.night}</td><td class="num"><b>${money(row.total)}</b></td></tr>`).join('')}</tbody></table>` : '<div class="kyerp-empty">Bu aralıkta kayıt yok.</div>'}</section>
          <section class="kyerp-analysis-card"><h3>Gün Gün Özet</h3>${dayRows.length ? `<table class="kyerp-analysis-table"><thead><tr><th>Tarih</th><th>Kişi</th><th>Gündüz</th><th>Gece</th><th>Toplam</th></tr></thead><tbody>${dayRows.map((row) => `<tr><td><b>${esc(fmtDate(row.date))}</b></td><td class="num">${row.people.size}</td><td class="num">${row.day}</td><td class="num">${row.night}</td><td class="num"><b>${money(row.dayTotal + row.nightTotal)}</b></td></tr>`).join('')}</tbody></table>` : '<div class="kyerp-empty">Bu aralıkta kayıt yok.</div>'}</section>
        </div>`;
    } catch (error) {
      body.innerHTML = `<div class="kyerp-empty">${esc(error?.message || 'Rapor yüklenemedi.')}</div>`;
    }
  }

  function ensureLogBar() {
    const daily = document.querySelector('.kyik-safe-daily');
    const head = daily?.querySelector('.kyik-safe-entry-head');
    const badge = head?.querySelector(':scope > b');
    if (!daily || !head || !badge) return;
    let bar = document.getElementById(LOG_BAR_ID);
    if (!bar) {
      bar = document.createElement('div');
      bar.id = LOG_BAR_ID;
      bar.innerHTML = '<button type="button" data-open-log>Log</button>';
      bar.querySelector('[data-open-log]').addEventListener('click', openLog);
    }
    if (bar.parentElement !== head || bar.nextElementSibling !== badge) head.insertBefore(bar, badge);
  }

  function ensureLogOverlay() {
    let overlay = document.getElementById(LOG_OVERLAY_ID);
    if (overlay) return overlay;
    const selected = String(localStorage.getItem('ikDailySelectedDate.v2') || today()).slice(0, 10);
    overlay = document.createElement('div');
    overlay.id = LOG_OVERLAY_ID;
    overlay.className = 'kyerp-fixed-overlay';
    overlay.hidden = true;
    overlay.dataset.tab = 'summary';
    overlay.innerHTML = `
      <section class="kyerp-drawer log" role="dialog" aria-modal="true" aria-label="Günlük işlem geçmişi ve analiz">
        <header class="kyerp-drawer-head"><div><span>GÜNLÜK GİRİŞ / LOG + ANALİZ</span><h2>Günlük İşlem Geçmişi</h2><p>İşlem tarihi ile birlikte, personelin seçili aralıktaki güncel gündüz/gece ve ücret toplamını tek ekranda teyit edin.</p></div><button class="kyerp-drawer-close" type="button" data-close>×</button></header>
        <div class="kyerp-log-tabs"><button type="button" class="active" data-log-tab="summary">Log + Özet</button><button type="button" data-log-tab="advanced">Gelişmiş Arama</button></div>
        <div class="kyerp-drawer-toolbar">
          <label>Başlangıç<input data-start type="date" value="${esc(selected)}"></label>
          <label>Bitiş<input data-end type="date" value="${esc(selected)}"></label>
          <label>İşlem<select data-action><option value="">Tüm İşlemler</option><option value="ATTENDANCE_CREATE">Kayıt oluşturuldu</option><option value="ATTENDANCE_REMOVE">Vardiya kaldırıldı</option><option value="ATTENDANCE_RESTORE">Kayıt yeniden açıldı</option><option value="ATTENDANCE_UPDATE">Kayıt güncellendi</option><option value="NOTE_UPDATE">Not değiştirildi</option><option value="ROSTER_ADD">Listeye eklendi</option><option value="ROSTER_REMOVE">Listeden çıkarıldı</option></select></label>
          <label class="kyerp-log-advanced">Personel<input data-person-filter type="search" placeholder="Ad veya vasıf ara"></label>
          <label class="kyerp-log-advanced">Vardiya<select data-shift-filter><option value="">Tümü</option><option value="day">Gündüz</option><option value="night">Gece</option><option value="general">Genel</option></select></label>
          <button type="button" data-load>Log + Analiz Getir</button>
        </div>
        <div class="kyerp-drawer-body" data-body><div class="kyerp-load-state">Tarih aralığını seçip logu açın.</div></div>
      </section>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (event) => { if (event.target === overlay || event.target.closest('[data-close]')) closeOverlay(overlay); });
    overlay.querySelectorAll('[data-log-tab]').forEach((button) => button.addEventListener('click', () => {
      overlay.dataset.tab = button.dataset.logTab;
      overlay.querySelectorAll('[data-log-tab]').forEach((item) => item.classList.toggle('active', item === button));
      loadLog(overlay);
    }));
    overlay.querySelector('[data-load]').addEventListener('click', () => loadLog(overlay));
    overlay.querySelector('[data-start]').addEventListener('change', () => loadLog(overlay));
    overlay.querySelector('[data-end]').addEventListener('change', () => loadLog(overlay));
    overlay.querySelector('[data-action]').addEventListener('change', () => loadLog(overlay));
    overlay.querySelector('[data-person-filter]').addEventListener('input', () => loadLog(overlay));
    overlay.querySelector('[data-shift-filter]').addEventListener('change', () => loadLog(overlay));
    return overlay;
  }

  function currentLogRange() {
    const inputs = [...document.querySelectorAll('.kyik-safe-daily input[type="date"]')];
    const fallback = String(localStorage.getItem('ikDailySelectedDate.v2') || today()).slice(0, 10);
    return { start: String(inputs[0]?.value || fallback).slice(0,10), end: String(inputs[1]?.value || fallback).slice(0,10) };
  }

  function openLog() {
    const overlay = ensureLogOverlay();
    const range = currentLogRange();
    overlay.querySelector('[data-start]').value = range.start;
    overlay.querySelector('[data-end]').value = range.end;
    overlay.hidden = false;
    document.documentElement.style.overflow = 'hidden';
    loadLog(overlay);
  }

  function actionLabel(action) {
    return ({
      ATTENDANCE_CREATE: 'Kayıt oluşturuldu', ATTENDANCE_UPDATE: 'Kayıt güncellendi',
      ATTENDANCE_REMOVE: 'Vardiya kaldırıldı', ATTENDANCE_RESTORE: 'Kayıt yeniden açıldı',
      NOTE_UPDATE: 'Not değiştirildi', ROSTER_ADD: 'Tarih aralığına eklendi', ROSTER_REMOVE: 'Tarih aralığından çıkarıldı',
    })[action] || action || 'İşlem';
  }
  function stateText(value) {
    if (!value || typeof value !== 'object') return '—';
    if (Object.prototype.hasOwnProperty.call(value, 'note')) return `Not: ${value.note || 'boş'}`;
    const parts = [];
    if (Object.prototype.hasOwnProperty.call(value, 'day')) parts.push(`G:${value.day ? 'var' : 'yok'}`);
    if (Object.prototype.hasOwnProperty.call(value, 'night')) parts.push(`N:${value.night ? 'var' : 'yok'}`);
    if (value.totalAmount !== undefined) parts.push(money(value.totalAmount));
    if (value.startDate && value.endDate) parts.push(`${fmtDate(value.startDate)}–${fmtDate(value.endDate)} ${value.included ? 'listede' : 'çıkarıldı'}`);
    return parts.join(' · ') || '—';
  }

  async function loadLog(overlay) {
    const body = overlay.querySelector('[data-body]');
    const start = overlay.querySelector('[data-start]').value;
    const end = overlay.querySelector('[data-end]').value;
    const action = overlay.querySelector('[data-action]').value;
    const advanced = overlay.dataset.tab === 'advanced';
    const personFilter = advanced ? String(overlay.querySelector('[data-person-filter]').value || '').trim().toLocaleLowerCase('tr-TR') : '';
    const shiftFilter = advanced ? String(overlay.querySelector('[data-shift-filter]').value || '') : '';
    if (!start || !end || start > end) { body.innerHTML = '<div class="kyerp-empty">Geçerli bir tarih aralığı seçin.</div>'; return; }
    const dates = [];
    for (let cursor = start; cursor <= end && dates.length < 31; cursor = addDays(cursor, 1)) dates.push(cursor);
    if (dates.length >= 31 && dates[dates.length - 1] < end) { body.innerHTML = '<div class="kyerp-empty">Log + analiz en fazla 31 günlük aralıkta açılır.</div>'; return; }
    body.innerHTML = '<div class="kyerp-load-state">Log ve personel toplamları hazırlanıyor…</div>';
    try {
      const [peopleRaw, attendanceRaw, ...auditDays] = await Promise.all([
        apiGet('/ik/daily-employees'),
        apiGet('/ik/daily-attendance', { startDate: start, endDate: end }),
        ...dates.map((date) => apiGet('/ik/daily-operation-audit', { date, action, limit: 300 })),
      ]);
      const people = Array.isArray(peopleRaw) ? peopleRaw : [];
      const attendance = Array.isArray(attendanceRaw) ? attendanceRaw : [];
      let rows = auditDays.flatMap((item) => Array.isArray(item) ? item : []).sort((a,b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
      const truthy = (value) => value === true || value === 1 || value === '1';
      const normalize = (value) => String(value || '').trim().toLocaleLowerCase('tr-TR');
      const personMap = new Map(people.map((person) => [String(person.id || person.employeeId || person.personId || ''), person]));
      const summaries = new Map();
      let periodDay = 0, periodNight = 0, periodDayAmount = 0, periodNightAmount = 0;
      attendance.forEach((row) => {
        const employeeId = String(row.employeeId || row.personId || '');
        const person = personMap.get(employeeId) || {};
        const name = String(person.name || person.fullName || row.personName || '').trim();
        const day = truthy(row.dayShift ?? row.day);
        const night = truthy(row.nightShift ?? row.night);
        const dayAmount = day ? Number(person.dayRate || row.dayWage || row.dayRate || 0) : 0;
        const nightAmount = night ? Number(person.nightRate || row.nightWage || row.nightRate || 0) : 0;
        const current = summaries.get(employeeId) || { day:0, night:0, dayAmount:0, nightAmount:0 };
        if (day) { current.day += 1; current.dayAmount += dayAmount; periodDay += 1; periodDayAmount += dayAmount; }
        if (night) { current.night += 1; current.nightAmount += nightAmount; periodNight += 1; periodNightAmount += nightAmount; }
        summaries.set(employeeId, current);
        if (name) summaries.set(`name:${normalize(name)}`, current);
      });
      if (personFilter) rows = rows.filter((row) => normalize(`${row.personName || ''} ${row.qualification || ''}`).includes(personFilter));
      if (shiftFilter) rows = rows.filter((row) => (row.shift === shiftFilter) || (shiftFilter === 'general' && row.shift !== 'day' && row.shift !== 'night'));
      if (!rows.length) { body.innerHTML = '<div class="kyerp-empty">Bu filtrelerle eşleşen işlem logu yok.</div>'; return; }
      const uniquePeople = new Set(attendance.filter((row) => truthy(row.dayShift ?? row.day) || truthy(row.nightShift ?? row.night)).map((row) => String(row.employeeId || row.personId || '')));
      body.innerHTML = `
        <div class="kyerp-log-overview">
          <article><span>Dönem · Güncel ücret</span><strong>${esc(fmtDate(start))}</strong><small>${esc(fmtDate(end))} tarihine kadar</small></article>
          <article><span>Personel</span><strong>${uniquePeople.size}</strong><small>Aktif kaydı olan</small></article>
          <article><span>Gündüz</span><strong>${periodDay}</strong><small>${money(periodDayAmount)}</small></article>
          <article><span>Gece</span><strong>${periodNight}</strong><small>${money(periodNightAmount)}</small></article>
          <article><span>Toplam</span><strong>${money(periodDayAmount + periodNightAmount)}</strong><small>Gündüz + gece</small></article>
        </div>
        <div class="kyerp-log-list">${rows.map((row) => {
          const shift = row.shift === 'day' ? 'Gündüz' : row.shift === 'night' ? 'Gece' : 'Genel';
          const before = stateText(row.before);
          const after = stateText(row.after);
          const employeeId = String(row.employeeId || row.personId || '');
          const summary = summaries.get(employeeId) || summaries.get(`name:${normalize(row.personName)}`) || { day:0, night:0, dayAmount:0, nightAmount:0 };
          const total = summary.dayAmount + summary.nightAmount;
          const workDate = row.workDate ? fmtDate(row.workDate) : '-';
          return `<article class="kyerp-log-item">
            <div class="kyerp-log-time"><b>${esc(fmtDateTime(row.createdAt))}</b><small>İşlem zamanı · ${esc(row.actorLabel || 'KY ERP Kullanıcısı')}</small></div>
            <div class="kyerp-log-person"><b>${esc(row.personName || '-')}</b><small>${esc(row.qualification || '')}</small><strong class="kyerp-log-workdate">Kayıt tarihi: ${esc(workDate)}</strong></div>
            <div class="kyerp-log-action"><strong>${esc(actionLabel(row.action))}</strong><span>${esc(shift)} · ${esc(row.source || '')}</span></div>
            <div class="kyerp-log-detail"><b>${esc(before)} → ${esc(after)}</b><div class="kyerp-log-current">Gündüz ${summary.day} gün · ${money(summary.dayAmount)} &nbsp; | &nbsp; Gece ${summary.night} gün · ${money(summary.nightAmount)} &nbsp; | &nbsp; Toplam ${money(total)}</div>${row.note ? `<small>Not: ${esc(row.note)}</small>` : ''}${row.requestId ? `<small>İşlem No: ${esc(String(row.requestId).slice(0, 18))}</small>` : ''}</div>
          </article>`;
        }).join('')}</div>`;
    } catch (error) {
      body.innerHTML = `<div class="kyerp-empty">${esc(error?.message || 'Log ve analiz yüklenemedi.')}</div>`;
    }
  }

  function closeOverlay(overlay) {
    overlay.hidden = true;
    if (![document.getElementById(ANALYSIS_OVERLAY_ID), document.getElementById(LOG_OVERLAY_ID)].some((item) => item && !item.hidden)) document.documentElement.style.overflow = '';
  }

  function enhance() {
    installStyle();
    ensureAnalysisButton();
    ensureLogBar();
    document.documentElement.dataset.kyerpDailySafetyUi = VERSION;
  }

  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; enhance(); });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    [document.getElementById(LOG_OVERLAY_ID), document.getElementById(ANALYSIS_OVERLAY_ID)].forEach((overlay) => {
      if (overlay && !overlay.hidden) closeOverlay(overlay);
    });
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', enhance, { once: true });
  else enhance();
})();
