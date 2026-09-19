(() => {
  const VERSION = '20260919-0912-daily-concurrency';
  const nativeFetch = window.fetch.bind(window);
  const revisions = new Map();

  const text = (value) => value == null ? '' : String(value).trim();
  const company = () => {
    const raw = text(localStorage.getItem('kyerp.activeCompany'));
    if (!raw) return 'mecit-hakan';
    try {
      const parsed = JSON.parse(raw);
      return text(parsed?.slug || parsed?.mainCompanySlug || parsed?.id) || 'mecit-hakan';
    } catch { return raw || 'mecit-hakan'; }
  };
  const keyFor = (companyId, employeeId, date) => `${companyId || company()}|${employeeId}|${text(date).slice(0, 10)}`;

  function rememberRows(payload, companyId = company()) {
    const source = payload?.data ?? payload?.items ?? payload;
    const rows = Array.isArray(source) ? source : Array.isArray(source?.rows) ? source.rows : [];
    rows.forEach((row) => {
      const employeeId = text(row?.employeeId || row?.personId || row?.personelId);
      const date = text(row?.workDate || row?.date || row?.selectedDate).slice(0, 10);
      const updatedAt = text(row?.updatedAt || row?.updated_at);
      if (employeeId && date && updatedAt) revisions.set(keyFor(companyId, employeeId, date), updatedAt);
    });
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

  window.fetch = async function kyDailyGuardFetch(input, init) {
    const url = input instanceof Request ? input.url : input;
    const path = targetPath(url);
    const method = text(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase() || 'GET';
    const isFocused = path.endsWith('/api/ik/gunluk-personel/gun-kayitlari') || path.endsWith('/ik/gunluk-personel/gun-kayitlari');
    const isRange = path.endsWith('/api/ik/daily-attendance/save-range') || path.endsWith('/ik/daily-attendance/save-range');
    const isAttendanceRead = (path.endsWith('/api/ik/daily-attendance') || path.endsWith('/ik/daily-attendance') || isFocused) && method === 'GET';

    let nextInput = input;
    let nextInit = init;
    if (method === 'POST' && (isFocused || isRange)) {
      const raw = await bodyText(input, init);
      if (raw) {
        try {
          const payload = JSON.parse(raw);
          const companyId = text(payload?.mainCompanyId || payload?.main_company_id || payload?.mainCompanySlug) || company();
          if (isFocused && Array.isArray(payload?.personnelEntries)) {
            const date = text(payload.date || payload.selectedDate).slice(0, 10);
            payload.personnelEntries = payload.personnelEntries.map((entry) => {
              if (entry?.expectedUpdatedAt) return entry;
              const employeeId = text(entry?.personelId || entry?.employeeId);
              const expected = revisions.get(keyFor(companyId, employeeId, date));
              return expected ? { ...entry, expectedUpdatedAt: expected } : entry;
            });
          }
          if (isRange && Array.isArray(payload?.rows)) {
            payload.rows = payload.rows.map((row) => {
              if (row?.expectedUpdatedAt) return row;
              const employeeId = text(row?.employeeId || row?.personId);
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
        const payload = await response.clone().json();
        rememberRows(payload);
      } catch {}
    }
    return response;
  };

  document.documentElement.dataset.kyerpDailyConcurrency = VERSION;
})();
