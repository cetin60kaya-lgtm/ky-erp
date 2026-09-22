(() => {
  const VERSION = '20260922-1835-daily-cross-device-v4';
  const nativeFetch = window.fetch.bind(window);
  const revisions = new Map();
  let lastServerSyncAt = 0;
  let refreshQueued = false;

  const text = (value) => value == null ? '' : String(value).trim();
  const COMPANY_ALIASES = new Set([
    '',
    'mecit-hakan',
    'main-mecit-hakan',
    'mecit-hakan-gursu',
    'hakan-baski',
    'main-hakan',
    'main-hakan-baski',
    'hkn-baski',
  ]);
  const canonicalCompany = (value) => {
    const normalized = text(value)
      .toLocaleLowerCase('tr-TR')
      .replace(/_/g, '-')
      .replace(/\s+/g, '-')
      .replace(/^-+|-+$/g, '');
    return COMPANY_ALIASES.has(normalized) ? 'mecit-hakan' : normalized;
  };
  const company = () => {
    const raw = text(localStorage.getItem('kyerp.activeCompany'));
    if (!raw) return 'mecit-hakan';
    try {
      const parsed = JSON.parse(raw);
      return canonicalCompany(parsed?.slug || parsed?.mainCompanySlug || parsed?.id || 'mecit-hakan');
    } catch {
      return canonicalCompany(raw || 'mecit-hakan');
    }
  };
  const companyFromUrl = (url) => {
    try {
      const parsed = new URL(url, location.href);
      return canonicalCompany(
        parsed.searchParams.get('mainCompanyId') ||
        parsed.searchParams.get('mainCompanySlug') ||
        parsed.searchParams.get('main_company_id') ||
        parsed.searchParams.get('main_company_slug') ||
        company(),
      );
    } catch {
      return company();
    }
  };
  const keyFor = (companyId, employeeId, date) =>
    `${canonicalCompany(companyId || company())}|${text(employeeId)}|${text(date).slice(0, 10)}`;

  function rememberRows(payload, companyId = company()) {
    const source = payload?.data ?? payload?.items ?? payload;
    const rows = Array.isArray(source) ? source : Array.isArray(source?.rows) ? source.rows : [];
    const canonicalId = canonicalCompany(companyId || company());
    rows.forEach((row) => {
      const employeeId = text(row?.employeeId || row?.personId || row?.personelId);
      const date = text(row?.workDate || row?.date || row?.selectedDate).slice(0, 10);
      const updatedAt = text(row?.updatedAt || row?.updated_at);
      if (employeeId && date && updatedAt) {
        revisions.set(keyFor(canonicalId, employeeId, date), updatedAt);
      }
    });
    lastServerSyncAt = Date.now();
  }

  function targetPath(url) {
    try { return new URL(url, location.href).pathname; } catch { return ''; }
  }

  async function bodyText(input, init) {
    if (typeof init?.body === 'string') return init.body;
    if (input instanceof Request) {
      try { return await input.clone().text(); } catch { return ''; }
    }
    return '';
  }

  function rebuild(input, init, body) {
    if (input instanceof Request) {
      const headers = new Headers(init?.headers || input.headers);
      headers.set('Content-Type', 'application/json');
      return [new Request(input, { ...init, headers, body }), undefined];
    }
    const headers = new Headers(init?.headers || {});
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    return [input, { ...(init || {}), headers, body }];
  }

  async function primeExcelRevisions(rawUrl, input, init, payload) {
    const rows = Array.isArray(payload?.rows) ? payload.rows : [];
    if (!rows.length) return;
    const dates = rows.map((row) => text(row?.workDate).slice(0, 10)).filter(Boolean).sort();
    const startDate = text(payload?.startDate || payload?.start) || dates[0] || '';
    const endDate = text(payload?.endDate || payload?.end) || dates.at(-1) || startDate;
    if (!startDate || !endDate) return;
    let sourceUrl;
    try { sourceUrl = new URL(rawUrl, location.href); } catch { return; }
    const companyId = canonicalCompany(
      payload?.mainCompanyId || payload?.mainCompanySlug || companyFromUrl(rawUrl),
    );
    const readUrl = new URL('/api/ik/daily-attendance', sourceUrl.origin);
    readUrl.searchParams.set('mainCompanyId', companyId);
    readUrl.searchParams.set('startDate', startDate);
    readUrl.searchParams.set('endDate', endDate);
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : {}));
    const response = await nativeFetch(readUrl.toString(), {
      method: 'GET',
      headers,
      cache: 'no-store',
      credentials: 'include',
      mode: 'cors',
    });
    if (!response.ok) return;
    try { rememberRows(await response.clone().json(), companyId); } catch {}
  }

  function refreshVisibleDailyUi() {
    if (refreshQueued || Date.now() - lastServerSyncAt < 10000) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      const roots = [...document.querySelectorAll('.gop-page,.kyik-safe-daily,.kyik-screen')];
      for (const root of roots) {
        const buttons = [...root.querySelectorAll('button')];
        const refresh = buttons.find((button) =>
          ['Yenile', 'Kayıtları Yenile'].includes(text(button.textContent)),
        );
        if (refresh && !refresh.disabled) {
          refresh.click();
          return;
        }
      }
    });
  }

  window.fetch = async function kyDailyGuardFetch(input, init) {
    const rawUrl = input instanceof Request ? input.url : input;
    const path = targetPath(rawUrl);
    const method = text(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase() || 'GET';
    const isFocused = path.endsWith('/api/ik/gunluk-personel/gun-kayitlari') || path.endsWith('/ik/gunluk-personel/gun-kayitlari');
    const isRange = path.endsWith('/api/ik/daily-attendance/save-range') || path.endsWith('/ik/daily-attendance/save-range');
    const isExcelApply = path.endsWith('/api/ik/gunluk-personel/excel-apply') || path.endsWith('/ik/gunluk-personel/excel-apply');
    const isAttendanceRead =
      (path.endsWith('/api/ik/daily-attendance') ||
        path.endsWith('/ik/daily-attendance') ||
        isFocused) && method === 'GET';

    let nextInput = input;
    let nextInit = init;
    if (method === 'POST' && (isFocused || isRange || isExcelApply)) {
      const raw = await bodyText(input, init);
      if (raw) {
        try {
          const payload = JSON.parse(raw);
          const companyId = canonicalCompany(
            payload?.mainCompanyId ||
              payload?.main_company_id ||
              payload?.mainCompanySlug ||
              payload?.main_company_slug ||
              companyFromUrl(rawUrl),
          );
          if (isExcelApply) await primeExcelRevisions(rawUrl, input, init, payload);
          if (isFocused && Array.isArray(payload?.personnelEntries)) {
            const date = text(payload.date || payload.selectedDate).slice(0, 10);
            payload.personnelEntries = payload.personnelEntries.map((entry) => {
              if (entry?.expectedUpdatedAt || entry?.expected_updated_at) return entry;
              const employeeId = text(entry?.personelId || entry?.employeeId);
              const expected = revisions.get(keyFor(companyId, employeeId, date));
              return expected ? { ...entry, expectedUpdatedAt: expected } : entry;
            });
          }
          if ((isRange || isExcelApply) && Array.isArray(payload?.rows)) {
            payload.rows = payload.rows.map((row) => {
              if (row?.expectedUpdatedAt || row?.expected_updated_at) return row;
              const employeeId = text(row?.employeeId || row?.personId || row?.personelId);
              const date = text(row?.workDate || row?.date || payload?.startDate).slice(0, 10);
              const expected = revisions.get(keyFor(companyId, employeeId, date));
              return expected ? { ...row, expectedUpdatedAt: expected } : row;
            });
          }
          [nextInput, nextInit] = rebuild(input, init, JSON.stringify(payload));
        } catch {}
      }
    }

    const response = await nativeFetch(nextInput, nextInit);
    if (response.ok && isAttendanceRead) {
      try {
        rememberRows(await response.clone().json(), companyFromUrl(rawUrl));
      } catch {}
    }
    if (response.ok && method === 'POST' && (isFocused || isRange || isExcelApply)) {
      try {
        rememberRows(await response.clone().json(), companyFromUrl(rawUrl));
      } catch {}
    }
    if (response.status === 409 && method === 'POST' && (isFocused || isRange || isExcelApply)) {
      setTimeout(refreshVisibleDailyUi, 0);
    }
    return response;
  };

  window.addEventListener('focus', refreshVisibleDailyUi);
  window.addEventListener('pageshow', refreshVisibleDailyUi);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshVisibleDailyUi();
  });
  document.documentElement.dataset.kyerpDailyConcurrency = VERSION;
})();