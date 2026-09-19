(() => {
  const VERSION = '20260919-1230-period-lock-ui-v3';
  const BUTTON_ID = 'kyerp-daily-period-lock-button';
  const OVERLAY_ID = 'kyerp-daily-period-lock-overlay';
  const API_BASE = 'https://api.kyerp.net/api';
  const text = (value) => String(value ?? '').trim();
  const pad = (value) => String(value).padStart(2, '0');
  const iso = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const company = () => {
    const raw = text(localStorage.getItem('kyerp.activeCompany'));
    if (!raw) return 'mecit-hakan';
    try {
      const parsed = JSON.parse(raw);
      return text(parsed?.slug || parsed?.mainCompanySlug || parsed?.id) || 'mecit-hakan';
    } catch { return raw || 'mecit-hakan'; }
  };
  const token = () => text(sessionStorage.getItem('kyerp_auth_token') || localStorage.getItem('kyerp_auth_token'));
  function currentRange() {
    const root = document.querySelector('.kyik-safe-daily');
    const inputs = root ? [...root.querySelectorAll('input[type="date"]')] : [];
    const today = new Date();
    const weekday = today.getDay() || 7;
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - weekday + 1);
    const friday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 4);
    return {
      startDate: text(inputs[0]?.value) || iso(monday),
      endDate: text(inputs[1]?.value) || iso(friday),
    };
  }
  async function request(path, options = {}) {
    const auth = token();
    if (!auth) throw new Error('Oturum anahtarı bulunamadı.');
    const url = new URL(`${API_BASE}${path}`);
    if (options.params) Object.entries(options.params).forEach(([key, value]) => value && url.searchParams.set(key, String(value)));
    const response = await fetch(url.toString(), {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body ? {'Content-Type':'application/json'} : {}),
        Authorization: `Bearer ${auth}`,
        'X-KYERP-Tenant-Slug': company(),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: 'no-store',
      credentials: 'include',
      mode: 'cors',
    });
    const raw = await response.text();
    let payload = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch {}
    if (!response.ok) throw new Error(payload?.error?.message || payload?.message || `Sunucu hatası (${response.status})`);
    return payload?.data ?? payload;
  }
  function style() {
    if (document.getElementById('kyerp-daily-period-lock-style')) return;
    const node = document.createElement('style');
    node.id = 'kyerp-daily-period-lock-style';
    node.textContent = `
      #${OVERLAY_ID}{position:fixed;inset:0;z-index:2147482600;background:rgba(14,29,50,.55);display:grid;place-items:center;padding:16px;font-family:Arial,sans-serif}
      #${OVERLAY_ID}[hidden]{display:none!important}
      #${OVERLAY_ID} .card{width:min(520px,95vw);background:#fff;border:1px solid #cad7e6;border-radius:14px;box-shadow:0 28px 80px rgba(15,35,64,.28);padding:14px;color:#173650}
      #${OVERLAY_ID} .head{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #e2e9f1;padding-bottom:10px;margin-bottom:10px}
      #${OVERLAY_ID} .head span{font-size:9px;color:#2b6ccb;font-weight:900;letter-spacing:.08em}
      #${OVERLAY_ID} h3{margin:3px 0;font-size:18px}
      #${OVERLAY_ID} p{margin:0;color:#687b91;font-size:10px;line-height:1.5}
      #${OVERLAY_ID} .close{width:32px;height:32px;border:1px solid #d2dce8;border-radius:8px;background:#fff;cursor:pointer;font-size:18px}
      #${OVERLAY_ID} .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
      #${OVERLAY_ID} label{display:grid;gap:4px;font-size:9px;color:#60748b;font-weight:800}
      #${OVERLAY_ID} input,#${OVERLAY_ID} textarea{border:1px solid #cbd8e6;border-radius:8px;padding:8px;color:#173650;font:inherit;background:#fff}
      #${OVERLAY_ID} textarea{min-height:70px;resize:vertical;grid-column:1/-1}
      #${OVERLAY_ID} .state{margin:9px 0;padding:9px;border-radius:9px;background:#f5f8fb;color:#415a75;font-size:10px;min-height:34px}
      #${OVERLAY_ID} .actions{display:flex;justify-content:flex-end;gap:7px}
      #${OVERLAY_ID} .actions button{height:34px;padding:0 12px;border:1px solid #c8d5e4;border-radius:8px;background:#fff;color:#294967;font-weight:850;cursor:pointer}
      #${OVERLAY_ID} .actions .lock{background:#1f5fae;border-color:#1f5fae;color:#fff}
      #${OVERLAY_ID} .actions .unlock{background:#fff7ed;border-color:#fdba74;color:#9a3412}
      @media(max-width:560px){#${OVERLAY_ID} .grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(node);
  }
  function overlay() {
    let root = document.getElementById(OVERLAY_ID);
    if (root) return root;
    style();
    root = document.createElement('div');
    root.id = OVERLAY_ID;
    root.hidden = true;
    root.innerHTML = `<section class="card" role="dialog" aria-modal="true" aria-label="Günlük dönem kilidi">
      <div class="head"><div><span>GÜNLÜK OPERASYON / VERİ GÜVENLİĞİ</span><h3>Dönem Kilidi</h3><p>Kilitli tarihlerde günlük kayıt değiştirilemez. Kilit açma işlemi de loga yazılır.</p></div><button type="button" class="close">×</button></div>
      <div class="grid"><label>Başlangıç<input type="date" data-start></label><label>Bitiş<input type="date" data-end></label><label style="grid-column:1/-1">Açıklama<textarea data-reason placeholder="Örn. Haftalık ödeme tamamlandı / yetkili düzeltme için yeniden açıldı"></textarea></label></div>
      <div class="state" data-state>Durum kontrol edilecek.</div>
      <div class="actions"><button type="button" class="unlock" data-unlock>Kilidi Aç</button><button type="button" class="lock" data-lock>Dönemi Kilitle</button></div>
    </section>`;
    document.body.appendChild(root);
    root.addEventListener('click', (event) => { if (event.target === root || event.target.closest('.close')) root.hidden = true; });
    async function apply(action) {
      const startDate = text(root.querySelector('[data-start]').value);
      const endDate = text(root.querySelector('[data-end]').value);
      const reason = text(root.querySelector('[data-reason]').value);
      const state = root.querySelector('[data-state]');
      if (!reason) { state.textContent = 'Açıklama zorunludur.'; return; }
      state.textContent = 'İşleniyor…';
      try {
        const result = await request('/ik/daily-period-lock', {method:'POST', body:{mainCompanyId:company(),startDate,endDate,action,reason}});
        state.textContent = result?.status === 'LOCKED' ? 'Dönem kilitlendi. Bu tarihler artık normal kayıt değişikliğine kapalı.' : 'Dönem kilidi açıldı. Değişiklikler yeniden yapılabilir ve loglanır.';
      } catch (error) { state.textContent = error?.message || 'Dönem kilidi işlemi yapılamadı.'; }
    }
    root.querySelector('[data-lock]').addEventListener('click', () => apply('LOCK'));
    root.querySelector('[data-unlock]').addEventListener('click', () => apply('UNLOCK'));
    return root;
  }
  async function open() {
    const root = overlay();
    const range = currentRange();
    root.querySelector('[data-start]').value = range.startDate;
    root.querySelector('[data-end]').value = range.endDate;
    root.querySelector('[data-reason]').value = '';
    root.hidden = false;
    const state = root.querySelector('[data-state]');
    state.textContent = 'Durum kontrol ediliyor…';
    try {
      const rows = await request('/ik/daily-period-lock', {params:{mainCompanyId:company(),date:range.startDate}});
      const locked = Array.isArray(rows) ? rows.find((row) => text(row.status).toUpperCase() === 'LOCKED') : null;
      state.textContent = locked ? `KİLİTLİ · ${text(locked.start_date || locked.startDate)} — ${text(locked.end_date || locked.endDate)} · ${text(locked.reason) || 'Açıklama yok'}` : 'Bu başlangıç tarihinde aktif dönem kilidi yok.';
    } catch (error) { state.textContent = error?.message || 'Kilit durumu okunamadı.'; }
  }
  function enhance() {
    const bar = document.getElementById('kyerp-daily-log-bar');
    if (!bar || document.getElementById(BUTTON_ID)) return;
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.textContent = 'Dönem Kilidi';
    button.title = 'Geçmiş günlük kayıtları değiştirmeye kapat / yetkili olarak yeniden aç';
    button.addEventListener('click', open);
    bar.appendChild(button);
    document.documentElement.dataset.kyerpDailyPeriodLockUi = VERSION;
  }
  const observer = new MutationObserver(enhance);
  observer.observe(document.documentElement, {subtree:true, childList:true});
  enhance();
})();
