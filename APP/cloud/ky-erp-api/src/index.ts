import { Context, Hono } from "hono";
import { cors } from "hono/cors";

type Bindings = Cloudflare.Env;
type Variables = { requestId: string };
type AppEnv = { Bindings: Bindings; Variables: Variables };

const app = new Hono<AppEnv>();

const ALLOWED_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://kyerp.net",
  "https://www.kyerp.net",
  "https://app.kyerp.net",
]);

const jsonError = (code: string, message: string) => ({
  ok: false as const,
  error: { code, message },
});

app.use("/api/*", async (c, next) => {
  c.set("requestId", crypto.randomUUID());
  await next();
});

app.use(
  "/api/*",
  cors({
    origin: (origin) => (ALLOWED_ORIGINS.has(origin) ? origin : undefined),
    allowMethods: ["GET", "HEAD", "OPTIONS"],
    allowHeaders: ["Accept", "Authorization", "Content-Type"],
    exposeHeaders: ["Content-Length", "Content-Type", "ETag"],
    maxAge: 86400,
    credentials: true,
  }),
);

app.onError((error, c) => {
  console.error(
    JSON.stringify({
      level: "error",
      requestId: c.get("requestId"),
      path: c.req.path,
      message: error.message,
    }),
  );
  return c.json(
    jsonError("INTERNAL_ERROR", "Beklenmeyen bir sunucu hatası oluştu."),
    500,
  );
});

app.notFound((c) =>
  c.json(jsonError("NOT_FOUND", "Endpoint bulunamadı."), 404),
);

function positiveInt(
  value: string | undefined,
  fallback: number,
  maximum = 500,
): number | null {
  if (value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    return null;
  }
  return parsed;
}

function nonNegativeInt(
  value: string | undefined,
  fallback = 0,
): number | null {
  if (value === undefined || value === "") return fallback;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) return null;
  return parsed;
}

async function listRows(
  c: Context<AppEnv>,
  table: string,
  options: {
    filters?: Array<{ sql: string; value: string | number }>;
    search?: { value: string; columns: string[] };
    orderBy?: string;
  } = {},
) {
  const limit = positiveInt(c.req.query("limit"), 100);
  const offset = nonNegativeInt(c.req.query("offset"), 0);
  if (limit === null || offset === null) {
    return c.json(
      jsonError(
        "INVALID_PAGINATION",
        "limit 1-500, offset ise 0 veya daha büyük olmalıdır.",
      ),
      400,
    );
  }

  const clauses: string[] = [];
  const bindings: Array<string | number> = [];
  for (const filter of options.filters || []) {
    clauses.push(filter.sql);
    bindings.push(filter.value);
  }
  if (options.search?.value) {
    clauses.push(
      `(${options.search.columns
        .map((column) => `${column} LIKE ?`)
        .join(" OR ")})`,
    );
    const term = `%${options.search.value}%`;
    bindings.push(...options.search.columns.map(() => term));
  }

  const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
  const orderBy = options.orderBy || "id DESC";
  const query = `SELECT * FROM ${table}${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
  const countQuery = `SELECT COUNT(*) AS total FROM ${table}${where}`;

  const [dataResult, countRow] = await Promise.all([
    c.env.DB.prepare(query)
      .bind(...bindings, limit, offset)
      .all<Record<string, unknown>>(),
    c.env.DB.prepare(countQuery)
      .bind(...bindings)
      .first<{ total: number }>(),
  ]);

  return c.json({
    ok: true,
    data: dataResult.results,
    pagination: { limit, offset, total: Number(countRow?.total || 0) },
  });
}

async function byId(c: Context<AppEnv>, table: string) {
  const id = c.req.param("id");
  if (!id) {
    return c.json(jsonError("INVALID_ID", "Geçerli bir id gereklidir."), 400);
  }
  const row = await c.env.DB.prepare(
    `SELECT * FROM ${table} WHERE id = ? LIMIT 1`,
  )
    .bind(id)
    .first();
  if (!row) {
    return c.json(jsonError("NOT_FOUND", "Kayıt bulunamadı."), 404);
  }
  return c.json({ ok: true, data: row });
}

async function accountingSummary(c: Context<AppEnv>) {
  const [row, companies, documents, movements, vatRecords] = await Promise.all([
    c.env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM companies) AS companyCount,
      (SELECT COUNT(*) FROM documents) AS documentCount,
      (SELECT COUNT(*) FROM invoice_items) AS invoiceItemCount,
      (SELECT COUNT(*) FROM current_account_movements) AS movementCount,
      (SELECT COUNT(*) FROM vat_records) AS vatRecordCount
    `).first<Record<string, number>>(),
    tableRows(c, "companies"),
    tableRows(c, "documents"),
    tableRows(c, "current_account_movements", 10),
    tableRows(c, "vat_records"),
  ]);
  const companyNames = new Map(
    companies.map((item) => [databaseText(item.id), databaseText(item.name)]),
  );
  const receivable = companies
    .filter((item) => databaseNumber(item.current_balance) > 0)
    .reduce((sum, item) => sum + databaseNumber(item.current_balance), 0);
  const payable = companies
    .filter((item) => databaseNumber(item.current_balance) < 0)
    .reduce((sum, item) => sum + Math.abs(databaseNumber(item.current_balance)), 0);
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthDocuments = documents.filter((item) =>
    databaseText(item.date || item.created_at).startsWith(monthKey),
  );
  const supplierDocuments = monthDocuments.filter(
    (item) => documentKind(item) === "SUPPLIER_INVOICE",
  );
  const customerDocuments = monthDocuments.filter(
    (item) => documentKind(item) === "CUSTOMER_INVOICE",
  );
  const aggregate = (source: DatabaseRow[]) => {
    const grouped = new Map<string, DatabaseRow>();
    for (const item of source) {
      const name = companyNames.get(databaseText(item.company_id)) || "Eşleşmeyen firma";
      const current = grouped.get(name) || { firma: name, belgeSayisi: 0, toplam: 0 };
      current.belgeSayisi = databaseNumber(current.belgeSayisi) + 1;
      current.toplam = databaseNumber(current.toplam) + databaseNumber(item.grand_total);
      grouped.set(name, current);
    }
    return [...grouped.values()]
      .sort((left, right) => databaseNumber(right.toplam) - databaseNumber(left.toplam))
      .slice(0, 10);
  };
  const vatIncoming = vatRecords.reduce(
    (sum, item) => sum + databaseNumber(item.incoming_vat),
    0,
  );
  const vatOutgoing = vatRecords.reduce(
    (sum, item) => sum + databaseNumber(item.outgoing_vat),
    0,
  );
  const pendingDocuments = documents.filter(
    (item) => !/processed|approved|islendi|işlendi/i.test(databaseText(item.status)),
  );

  const data = {
    generatedAt: new Date().toISOString(),
    companyCount: Number(row?.companyCount || 0),
    documentCount: Number(row?.documentCount || 0),
    invoiceItemCount: Number(row?.invoiceItemCount || 0),
    movementCount: Number(row?.movementCount || 0),
    vatRecordCount: Number(row?.vatRecordCount || 0),
    cards: [
      {
        key: "companies",
        label: "Firma",
        value: Number(row?.companyCount || 0),
      },
      {
        key: "documents",
        label: "Belge",
        value: Number(row?.documentCount || 0),
      },
      {
        key: "movements",
        label: "Cari Hareket",
        value: Number(row?.movementCount || 0),
      },
      {
        key: "vat",
        label: "KDV Kaydı",
        value: Number(row?.vatRecordCount || 0),
      },
    ],
    toplamAlacak: receivable,
    toplamBorc: payable,
    netBakiye: receivable - payable,
    buAyGelenFatura: supplierDocuments.reduce(
      (sum, item) => sum + databaseNumber(item.grand_total),
      0,
    ),
    buAyKesilenFatura: customerDocuments.reduce(
      (sum, item) => sum + databaseNumber(item.grand_total),
      0,
    ),
    gelenKdv: vatIncoming,
    gidenKdv: vatOutgoing,
    netKdv: vatOutgoing - vatIncoming,
    kontrolBekleyenBelge: pendingDocuments.length,
    onayBekleyenBelge: pendingDocuments.length,
    isnetSonSenkronizasyon:
      documents
        .filter((item) => /isnet/i.test(databaseText(item.source_type)))
        .map((item) => databaseText(item.updated_at || item.created_at))
        .sort()
        .at(-1) || null,
    alerts: [],
    recentMovements: movements.map((item) => ({
      id: item.id,
      tarih: item.movement_date,
      firma: companyNames.get(databaseText(item.company_id)) || "",
      aciklama: item.description || item.movement_type || "",
      tutar: databaseNumber(item.amount || item.debit || item.credit),
    })),
    sonCariHareketler: movements.map((item) => ({
      id: item.id,
      tarih: item.movement_date,
      firma: companyNames.get(databaseText(item.company_id)) || "",
      aciklama: item.description || item.movement_type || "",
      tutar: databaseNumber(item.amount || item.debit || item.credit),
    })),
    enYuksekTedarikciler: aggregate(supplierDocuments),
    enYuksekMusteriler: aggregate(customerDocuments),
    yaklasanCekler: [],
    eksikBelgeler: pendingDocuments.slice(0, 10).map((item) => ({
      id: item.id,
      belgeNo: item.document_no,
      firma: companyNames.get(databaseText(item.company_id)) || "Eşleşmeyen firma",
      durum: item.status || "Kontrol bekliyor",
    })),
    totals: {
      receivable,
      payable,
      balance: receivable - payable,
      income: 0,
      expense: 0,
      vatIncoming,
      vatOutgoing,
      vatPayable: Math.max(0, vatOutgoing - vatIncoming),
    },
  };

  return c.json({ ok: true, success: true, data });
}

type DatabaseRow = Record<string, unknown>;

function jsonObject(value: unknown): DatabaseRow {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as DatabaseRow;
  }
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as DatabaseRow)
      : {};
  } catch {
    return {};
  }
}

function databaseText(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

function databaseNumber(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function tableRows(
  c: Context<AppEnv>,
  table: string,
  maximum = 500,
): Promise<DatabaseRow[]> {
  const result = await c.env.DB.prepare(
    `SELECT * FROM ${table} ORDER BY id DESC LIMIT ?`,
  )
    .bind(maximum)
    .all<DatabaseRow>();
  const slug = c.req.query("mainCompanySlug")?.trim();
  return (result.results || []).filter(
    (row) =>
      !slug ||
      !row.main_company_slug ||
      databaseText(row.main_company_slug) === slug,
  );
}

function documentKind(row: DatabaseRow): "SUPPLIER_INVOICE" | "CUSTOMER_INVOICE" | "OTHER" {
  const value = `${databaseText(row.document_type)} ${databaseText(row.target_type)} ${databaseText(row.detected_type)}`.toLocaleLowerCase("tr-TR");
  if (/tedarik|alış|alis|supplier/.test(value)) return "SUPPLIER_INVOICE";
  if (/fatura|invoice/.test(value) && !/irsaliye|dispatch/.test(value)) {
    return "CUSTOMER_INVOICE";
  }
  return "OTHER";
}

function mapInvoiceLine(row: DatabaseRow): DatabaseRow {
  return {
    id: row.id,
    lineNo: row.line_no,
    rawName: row.product_name || row.description || "Kalem",
    description: row.description || row.product_name || "",
    quantity: databaseNumber(row.quantity),
    unit: row.unit || "",
    unitPrice: databaseNumber(row.unit_price),
    vatRate: databaseNumber(row.vat_rate),
    vatAmount: databaseNumber(row.vat_amount),
    lineTotal: databaseNumber(row.line_total),
    productId: row.product_id || null,
    lotNo: row.lot_no || "",
  };
}

function mapAccountingDocument(
  row: DatabaseRow,
  companies: Map<string, string>,
  lines: DatabaseRow[] = [],
): DatabaseRow {
  const raw = { ...jsonObject(row.metadata), ...jsonObject(row.raw) };
  const kind = documentKind(row);
  const status = databaseText(row.status || raw.status || "CONTROL_WAITING");
  const companyId = databaseText(row.company_id);
  const missingFields = Array.isArray(raw.missingFields)
    ? raw.missingFields
    : Array.isArray(raw.eksikBilgiler)
      ? raw.eksikBilgiler
      : [];
  return {
    id: row.id,
    documentKind: kind,
    documentNo: row.document_no || raw.documentNo || raw.belgeNo || "",
    invoiceNo: row.document_no || raw.invoiceNo || "",
    issueDate: row.date || raw.issueDate || raw.tarih || row.created_at,
    companyId: row.company_id || null,
    firmId: row.company_id || null,
    supplierName: companies.get(companyId) || raw.supplierName || raw.firma || "Firma eşleşmesi bekliyor",
    companyName: companies.get(companyId) || raw.companyName || raw.firma || "",
    subtotal: databaseNumber(row.subtotal || raw.subtotal || raw.matrah),
    vatTotal: databaseNumber(row.vat_total || raw.vatTotal || raw.kdv),
    grandTotal: databaseNumber(row.grand_total || raw.grandTotal || raw.toplam),
    sourceType: row.source_type || raw.sourceType || raw.source || "MANUAL",
    status,
    missingFields,
    firmMatchStatus: row.firm_match_status || (row.company_id ? "MATCHED" : "PENDING"),
    mailStatus: raw.mailStatus || raw.mailDurumu || "BEKLIYOR",
    modelName: raw.modelName || raw.modelAdi || "",
    quantity: databaseNumber(raw.quantity || raw.adet),
    lines: lines.map(mapInvoiceLine),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function accountingDocuments(c: Context<AppEnv>) {
  const [documents, companies] = await Promise.all([
    tableRows(c, "documents"),
    tableRows(c, "companies"),
  ]);
  const companyNames = new Map(
    companies.map((row) => [databaseText(row.id), databaseText(row.name)]),
  );
  return documents
    .filter((row) => !row.deleted_at)
    .map((row) => mapAccountingDocument(row, companyNames));
}

async function accountingDocumentDetail(c: Context<AppEnv>, id: string) {
  const [documents, lines] = await Promise.all([
    accountingDocuments(c),
    c.env.DB.prepare("SELECT * FROM invoice_items WHERE document_id = ? ORDER BY line_no ASC, id ASC")
      .bind(id)
      .all<DatabaseRow>(),
  ]);
  const base = documents.find((row) => databaseText(row.id) === id);
  if (!base) return null;
  return { ...base, lines: (lines.results || []).map(mapInvoiceLine) };
}

function emptyAccountingReport() {
  return {
    summary: {
      totalIncome: 0,
      totalExpense: 0,
      incomingVat: 0,
      outgoingVat: 0,
      netResult: 0,
      grossProfit: 0,
      netProfit: 0,
    },
    records: [],
    categories: [],
    companySummary: [],
    generalExpenses: [],
  };
}

app.get("/api/health", (c) =>
  c.json({ ok: true, service: "ky-erp-api", database: "d1" }),
);

app.get("/api/health/db", async (c) => {
  await c.env.DB.prepare("SELECT COUNT(*) AS count FROM main_companies").first();
  return c.json({ ok: true, database: "ky-erp-db", connected: true });
});

app.get("/api/system/status", async (c) => {
  const row = await c.env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%') AS tables,
      (SELECT COUNT(*) FROM personnel) AS personnel,
      (SELECT COUNT(*) FROM companies) AS companies,
      (SELECT COUNT(*) FROM documents) AS documents,
      (SELECT COUNT(*) FROM invoice_items) AS invoice_items,
      (SELECT COUNT(*) FROM hr_daily_attendance) AS hr_daily_attendance,
      (SELECT COUNT(*) FROM json_store) AS json_store
  `).first();
  return c.json({ ok: true, data: row });
});

app.get("/api/companies", (c) =>
  listRows(c, "companies", {
    search: {
      value: c.req.query("search")?.trim() || "",
      columns: ["name", "normalized_name", "tax_no"],
    },
    orderBy: "name COLLATE NOCASE ASC",
  }),
);
app.get("/api/companies/:id", (c) => byId(c, "companies"));
app.get("/api/firms", (c) =>
  listRows(c, "firms", {
    search: {
      value: c.req.query("search")?.trim() || "",
      columns: ["name", "normalized_name", "tax_no"],
    },
    orderBy: "name COLLATE NOCASE ASC",
  }),
);

app.get("/api/current-account-movements", (c) => {
  const companyId = c.req.query("companyId") || c.req.query("firmId");
  const startDate = c.req.query("startDate") || c.req.query("dateFrom");
  const endDate = c.req.query("endDate") || c.req.query("dateTo");
  const filters = [
    ...(companyId ? [{ sql: "company_id = ?", value: companyId }] : []),
    ...(startDate ? [{ sql: "movement_date >= ?", value: startDate }] : []),
    ...(endDate ? [{ sql: "movement_date <= ?", value: endDate }] : []),
  ];
  return listRows(c, "current_account_movements", {
    filters,
    orderBy: "movement_date DESC, id DESC",
  });
});

app.get("/api/cari-movements", (c) => {
  const filters = [
    ...(c.req.query("companyId")
      ? [{ sql: "main_company_id = ?", value: c.req.query("companyId")! }]
      : []),
    ...(c.req.query("firmId")
      ? [{ sql: "firm_id = ?", value: c.req.query("firmId")! }]
      : []),
    ...(c.req.query("startDate")
      ? [{ sql: "date >= ?", value: c.req.query("startDate")! }]
      : []),
    ...(c.req.query("endDate")
      ? [{ sql: "date <= ?", value: c.req.query("endDate")! }]
      : []),
  ];
  return listRows(c, "cari_movements", {
    filters,
    orderBy: "date DESC, id DESC",
  });
});

app.get("/api/personnel", (c) =>
  listRows(c, "personnel", {
    search: {
      value: c.req.query("search")?.trim() || "",
      columns: ["full_name", "phone"],
    },
    orderBy: "full_name COLLATE NOCASE ASC",
  }),
);
app.get("/api/personnel/:id", (c) => byId(c, "personnel"));

app.get("/api/hr/daily-attendance", (c) => {
  const date = c.req.query("date");
  const personnelId =
    c.req.query("personnelId") || c.req.query("employeeId");
  const filters = [
    ...(date ? [{ sql: "work_date = ?", value: date }] : []),
    ...(personnelId
      ? [{ sql: "employee_id = ?", value: personnelId }]
      : []),
  ];
  return listRows(c, "hr_daily_attendance", {
    filters,
    orderBy: "work_date DESC, id DESC",
  });
});

app.get("/api/hr/payrolls", (c) =>
  listRows(c, "hr_payrolls_v2", {
    filters: [
      ...(c.req.query("year")
        ? [{ sql: "year = ?", value: c.req.query("year")! }]
        : []),
      ...(c.req.query("month")
        ? [{ sql: "month = ?", value: c.req.query("month")! }]
        : []),
      ...(c.req.query("personnelId")
        ? [{ sql: "employee_id = ?", value: c.req.query("personnelId")! }]
        : []),
    ],
    orderBy: "year DESC, month DESC, id DESC",
  }),
);

app.get("/api/documents", (c) =>
  listRows(c, "documents", {
    filters: [
      ...(c.req.query("companyId")
        ? [{ sql: "company_id = ?", value: c.req.query("companyId")! }]
        : []),
      ...(c.req.query("status")
        ? [{ sql: "status = ?", value: c.req.query("status")! }]
        : []),
    ],
    orderBy: "date DESC, id DESC",
  }),
);
app.get("/api/documents/:id", (c) => byId(c, "documents"));

app.get("/api/invoice-items", (c) =>
  listRows(c, "invoice_items", {
    filters: c.req.query("documentId")
      ? [{ sql: "document_id = ?", value: c.req.query("documentId")! }]
      : [],
    orderBy: "document_id DESC, line_no ASC, id ASC",
  }),
);

app.get("/api/vat-records", (c) =>
  listRows(c, "vat_records", {
    filters: [
      ...(c.req.query("companyId")
        ? [{ sql: "company_id = ?", value: c.req.query("companyId")! }]
        : []),
      ...(c.req.query("firmId")
        ? [{ sql: "firm_id = ?", value: c.req.query("firmId")! }]
        : []),
      ...(c.req.query("startDate")
        ? [{ sql: "date >= ?", value: c.req.query("startDate")! }]
        : []),
      ...(c.req.query("endDate")
        ? [{ sql: "date <= ?", value: c.req.query("endDate")! }]
        : []),
    ],
    orderBy: "date DESC, id DESC",
  }),
);

// Muhasebe ekranının çevrim içi ilk okuma uçları.
app.get("/api/muhasebe/dashboard", accountingSummary);
app.get("/api/muhasebe/preview", accountingSummary);
app.get("/api/muhasebe/yonetim-ozeti", accountingSummary);
app.get("/api/muhasebe/reports/management-summary", accountingSummary);

app.get("/api/muhasebe/firmalar", async (c) => {
  const search = c.req.query("search")?.trim().toLocaleLowerCase("tr-TR") || "";
  const rows = (await tableRows(c, "companies"))
    .filter((row) => !row.deleted_at && (!search || `${row.name || ""} ${row.tax_no || ""}`.toLocaleLowerCase("tr-TR").includes(search)))
    .map((row) => ({
      id: row.id,
      firmaAdi: row.name,
      type: row.type,
      defaultRecordType: row.default_record_type,
      taxNo: row.tax_no,
      taxOffice: row.tax_office,
      phone: row.phone,
      email: row.email,
      address: row.address,
      currentBalance: databaseNumber(row.current_balance),
      openingBalance: databaseNumber(row.opening_balance),
      isActive: row.is_active !== 0 && row.is_active !== false,
      note: row.note,
      updatedAt: row.updated_at,
    }));
  return c.json({ ok: true, success: true, data: rows });
});

app.get("/api/muhasebe/cari-hareketler", (c) => {
  const filters = [
    ...(c.req.query("companyId")
      ? [{ sql: "company_id = ?", value: c.req.query("companyId")! }]
      : []),
    ...(c.req.query("firmId")
      ? [{ sql: "company_id = ?", value: c.req.query("firmId")! }]
      : []),
    ...(c.req.query("startDate")
      ? [{ sql: "movement_date >= ?", value: c.req.query("startDate")! }]
      : []),
    ...(c.req.query("endDate")
      ? [{ sql: "movement_date <= ?", value: c.req.query("endDate")! }]
      : []),
  ];
  return listRows(c, "current_account_movements", {
    filters,
    orderBy: "movement_date DESC, id DESC",
  });
});

app.get("/api/muhasebe/kdv", (c) =>
  listRows(c, "vat_records", {
    orderBy: "date DESC, id DESC",
  }),
);

app.get("/api/muhasebe/cekler", (c) =>
  c.json({ ok: true, success: true, data: [] }),
);
app.get("/api/muhasebe/cheques", (c) =>
  c.json({ ok: true, success: true, data: [] }),
);
app.get("/api/muhasebe/mail-ekstre", (c) =>
  c.json({ ok: true, success: true, data: [] }),
);
app.get("/api/muhasebe/raporlar", (c) =>
  c.json({ ok: true, success: true, data: [] }),
);

app.get("/api/muhasebe/belge-import", async (c) => {
  const rows = (await accountingDocuments(c)).filter(
    (row) => row.documentKind === "SUPPLIER_INVOICE",
  );
  return c.json({ ok: true, success: true, data: rows });
});

app.get("/api/muhasebe/belge-import/:id", async (c) => {
  const row = await accountingDocumentDetail(c, c.req.param("id"));
  return row
    ? c.json({ ok: true, success: true, data: row })
    : c.json(jsonError("NOT_FOUND", "Fatura kaydı bulunamadı."), 404);
});

app.get("/api/muhasebe/kesilen-faturalar", async (c) => {
  const items = (await accountingDocuments(c)).filter(
    (row) => row.documentKind === "CUSTOMER_INVOICE",
  );
  return c.json({
    ok: true,
    success: true,
    data: {
      items,
      total: items.length,
      summary: {
        total: items.length,
        totalAmount: items.reduce(
          (sum, row) => sum + databaseNumber(row.grandTotal),
          0,
        ),
      },
    },
  });
});

app.get("/api/muhasebe/kesilen-faturalar/:id", async (c) => {
  const row = await accountingDocumentDetail(c, c.req.param("id"));
  return row
    ? c.json({ ok: true, success: true, data: row })
    : c.json(jsonError("NOT_FOUND", "Kesilen fatura bulunamadı."), 404);
});

app.get("/api/vat/summary", async (c) => {
  const [records, companies] = await Promise.all([
    tableRows(c, "vat_records"),
    tableRows(c, "companies"),
  ]);
  const companyNames = new Map(
    companies.map((row) => [databaseText(row.id), databaseText(row.name)]),
  );
  const grouped = new Map<string, DatabaseRow>();
  for (const record of records) {
    const firmId = databaseText(record.company_id || record.firm_id);
    const current = grouped.get(firmId) || {
      firmId,
      firma: companyNames.get(firmId) || "Firma eşleşmesi bekliyor",
      gelenKdv: 0,
      gidenKdv: 0,
      devredenKdv: 0,
      gelenMatrah: 0,
      gidenMatrah: 0,
      belgeSayisi: 0,
    };
    current.gelenKdv =
      databaseNumber(current.gelenKdv) + databaseNumber(record.incoming_vat);
    current.gidenKdv =
      databaseNumber(current.gidenKdv) + databaseNumber(record.outgoing_vat);
    current.devredenKdv =
      databaseNumber(current.devredenKdv) + databaseNumber(record.carry_vat);
    current.belgeSayisi = databaseNumber(current.belgeSayisi) + 1;
    grouped.set(firmId, current);
  }
  const liste = [...grouped.values()];
  return c.json({ ok: true, success: true, data: { liste } });
});

app.get("/api/vat/firms/:id/detail", async (c) => {
  const firmId = c.req.param("id");
  const rows = (await tableRows(c, "vat_records")).filter(
    (row) => databaseText(row.company_id || row.firm_id) === firmId,
  );
  return c.json({
    ok: true,
    success: true,
    data: {
      gelenBelgeler: rows.filter((row) => databaseNumber(row.incoming_vat) > 0),
      gidenBelgeler: rows.filter((row) => databaseNumber(row.outgoing_vat) > 0),
      hesaplananKdv: rows.reduce(
        (sum, row) => sum + databaseNumber(row.outgoing_vat),
        0,
      ),
      indirilecekKdv: rows.reduce(
        (sum, row) => sum + databaseNumber(row.incoming_vat),
        0,
      ),
      devredenKdv: rows.reduce(
        (sum, row) => sum + databaseNumber(row.carry_vat),
        0,
      ),
    },
  });
});

app.get("/api/mail-tracking", (c) =>
  c.json({
    ok: true,
    success: true,
    data: {
      gonderilecek: 0,
      gonderildi: 0,
      aliciEksik: 0,
      ekstedeVar: 0,
      liste: [],
      seciliKayitDetay: null,
      mailOnizleme: "",
      ekstreKarsilastirmaSonucu: {},
    },
  }),
);

app.get("/api/muhasebe/rapor-kategorileri", (c) =>
  c.json({ ok: true, success: true, data: [] }),
);
app.get("/api/muhasebe/accounting/reports/records", (c) =>
  c.json({ ok: true, success: true, data: emptyAccountingReport() }),
);
app.get("/api/muhasebe/accounting/fixed-expenses", (c) =>
  c.json({ ok: true, success: true, data: [] }),
);
app.get("/api/muhasebe/mail/templates", (c) =>
  c.json({ ok: true, success: true, data: [] }),
);
app.get("/api/muhasebe/mail/templates/drafts/list", (c) =>
  c.json({ ok: true, success: true, data: [] }),
);

app.get("/api/muhasebe/customer-dispatches/summary", (c) =>
  c.json({
    ok: true,
    success: true,
    data: {
      dispatchWithoutInvoice: 0,
      invoiceWithoutDispatch: 0,
      quantityDifference: 0,
      modelPending: 0,
      completed: 0,
    },
  }),
);
app.get("/api/muhasebe/customer-dispatches", (c) =>
  c.json({ ok: true, success: true, data: { rows: [], total: 0 } }),
);

app.get("/api/models", async (c) => {
  const products = await tableRows(c, "products");
  return c.json({
    ok: true,
    success: true,
    data: products.map((row) => ({
      id: row.id,
      name: row.name,
      modelName: row.name,
      code: row.code || row.legacy_id || "",
    })),
  });
});
app.get("/api/desen/modeller", (c) =>
  c.json({ ok: true, success: true, data: [] }),
);

app.get("/api/muhasebe/odeme/firmalar", async (c) => {
  const companies = await tableRows(c, "companies");
  return c.json({
    ok: true,
    success: true,
    data: companies.map((row) => ({
      id: row.id,
      firmaId: row.id,
      firmaAdi: row.name,
      taxNo: row.tax_no,
      balance: databaseNumber(row.current_balance),
    })),
  });
});
app.get("/api/muhasebe/odeme/cekler", (c) =>
  c.json({
    ok: true,
    success: true,
    data: { summary: {}, months: [], rows: [] },
  }),
);
app.get("/api/muhasebe/odeme/firmalar/:id/:view", (c) =>
  c.json({
    ok: true,
    success: true,
    data:
      c.req.param("view") === "ozet"
        ? { firmId: c.req.param("id"), totalDebt: 0, totalCredit: 0 }
        : [],
  }),
);

app.get("/api/json-store", async (c) => {
  const scope = c.req.query("scope")?.trim();
  const fileName = c.req.query("fileName")?.trim();
  if (!scope || !fileName) {
    return c.json(
      jsonError("MISSING_PARAMETERS", "scope ve fileName zorunludur."),
      400,
    );
  }
  const row = await c.env.DB.prepare(
    "SELECT * FROM json_store WHERE scope = ? AND file_name = ? LIMIT 1",
  )
    .bind(scope, fileName)
    .first<Record<string, unknown>>();
  if (!row) {
    return c.json(jsonError("NOT_FOUND", "JSON kaydı bulunamadı."), 404);
  }
  return c.json({ ok: true, data: row });
});

app.get("/api/json-store/:scope/*", async (c) => {
  const scope = c.req.param("scope");
  const prefix = `/api/json-store/${encodeURIComponent(scope)}/`;
  const fileName = decodeURIComponent(c.req.path.slice(prefix.length));
  if (!fileName) {
    return c.json(
      jsonError("MISSING_PARAMETERS", "fileName zorunludur."),
      400,
    );
  }
  const row = await c.env.DB.prepare(
    "SELECT * FROM json_store WHERE scope = ? AND file_name = ? LIMIT 1",
  )
    .bind(scope, fileName)
    .first<Record<string, unknown>>();
  if (!row) {
    return c.json(jsonError("NOT_FOUND", "JSON kaydı bulunamadı."), 404);
  }
  return c.json({ ok: true, data: row });
});

app.get("/api/files/*", async (c) => {
  const key = decodeURIComponent(c.req.path.slice("/api/files/".length));
  if (!key) {
    return c.json(
      jsonError("INVALID_FILE_KEY", "Dosya anahtarı zorunludur."),
      400,
    );
  }
  const object = await c.env.FILES.get(key);
  if (!object) {
    return c.json(jsonError("NOT_FOUND", "Dosya bulunamadı."), 404);
  }
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  return new Response(object.body, { headers });
});

export default app;
