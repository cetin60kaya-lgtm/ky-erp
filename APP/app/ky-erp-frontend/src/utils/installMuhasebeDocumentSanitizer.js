const NOISE_PATTERNS = [
  /\busd\s*kuru\b/i,
  /\beur\s*kuru\b/i,
  /\bmal\s*hizmet\s*toplam/i,
  /\bkdv\s*matrah/i,
  /\bvergi\s*hari[cç]\s*tutar/i,
  /\bvergiler\s*dahil\s*toplam/i,
  /\b[öo]denecek\s*tutar/i,
  /\bhesaplanan\b.*\bkatma\s*de[ğg]er\s*vergisi/i,
  /\b[ıi]lave\s*d[öo]k[üu]manlar\b/i,
  /\b[öo]deme\s*[şs]ekli\b/i,
  /\b[öo]deme\s*ko[şs]ullar[ıi]\b/i,
  /\bson\s*[öo]deme\s*tarihi\b/i,
  /^\*\s*yaln[ıi]z/i,
  /^\*\s*usd/i,
  /^\*\s*eur/i,
];

const ITEM_KEYS = [
  "belgeKalemleri",
  "kalemler",
  "items",
  "lineItems",
  "rows",
  "parsedItems",
  "matchedItems",
  "candidateItems",
  "documentItems",
  "invoiceItems",
];

const POOL_KEYS = [
  "havuz",
  "irsaliyeHavuzu",
  "taslaklar",
  "drafts",
  "pool",
  "kayitLogu",
  "log",
  "logs",
];

function normalizeText(input) {
  return String(input ?? "")
    .replace(/\s+/g, " ")
    .replace(/[‐-‒–—]/g, "-")
    .trim();
}

function hasNoise(text) {
  const value = normalizeText(text);
  if (!value) return false;
  return NOISE_PATTERNS.some((pattern) => pattern.test(value));
}

function extractItemText(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";

  return normalizeText(
    [
      value.raw,
      value.rawText,
      value.line,
      value.lineText,
      value.hamSatir,
      value.hamAciklama,
      value.description,
      value.aciklama,
      value.name,
      value.title,
      value.productName,
      value.urunAdi,
      value.malzeme,
      value.malzemeAdi,
      value.itemName,
      value.parsedLabel,
      value.displayName,
    ]
      .filter(Boolean)
      .join(" | "),
  );
}

function looksLikeItemObject(value) {
  if (!value || typeof value !== "object") return false;

  const keys = Object.keys(value);
  const signalKeys = [
    "urunAdi",
    "productName",
    "itemName",
    "name",
    "description",
    "aciklama",
    "miktar",
    "quantity",
    "adet",
    "birim",
    "unit",
    "fiyat",
    "price",
    "tutar",
    "amount",
    "lotNo",
    "ambalaj",
  ];

  return signalKeys.some((key) => keys.includes(key));
}

function getDateValue(item) {
  const raw =
    item?.tarih ||
    item?.date ||
    item?.createdAt ||
    item?.updatedAt ||
    item?.belgeTarihi ||
    item?.dispatchDate ||
    item?.invoiceDate;

  if (!raw) return 0;
  const timestamp = new Date(String(raw)).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function dedupeArray(items) {
  const seen = new Set();
  const output = [];

  for (const item of items) {
    let key = "";

    if (typeof item === "string") {
      key = normalizeText(item).toLowerCase();
    } else if (item && typeof item === "object") {
      const itemText = extractItemText(item).toLowerCase();
      const quantity = normalizeText(
        item?.miktar ?? item?.quantity ?? item?.adet ?? "",
      );
      const unit = normalizeText(item?.birim ?? item?.unit ?? "");
      const amount = normalizeText(
        item?.tutar ?? item?.amount ?? item?.total ?? "",
      );
      key = [itemText, quantity, unit, amount].filter(Boolean).join(" | ");
    }

    if (!key || !seen.has(key)) {
      if (key) seen.add(key);
      output.push(item);
    }
  }

  return output;
}

function sanitizeArray(parentKey, items) {
  let output = items.map((item) => sanitizeNode(item, parentKey));
  const normalizedParentKey = String(parentKey || "").toLowerCase();

  const isItemArray =
    ITEM_KEYS.some((key) => normalizedParentKey.includes(key.toLowerCase())) ||
    /kalem|item|line|row/i.test(normalizedParentKey);

  if (isItemArray) {
    output = output.filter((item) => {
      if (typeof item === "string") return !hasNoise(item);
      if (!looksLikeItemObject(item)) return true;
      const itemText = extractItemText(item);
      return !itemText || !hasNoise(itemText);
    });
    output = dedupeArray(output);
  }

  const isPoolArray =
    POOL_KEYS.some((key) => normalizedParentKey.includes(key.toLowerCase())) ||
    /havuz|pool|taslak|draft|log/i.test(normalizedParentKey);

  if (isPoolArray) {
    output = [...output].sort((left, right) => {
      const leftDate =
        left && typeof left === "object" ? getDateValue(left) : 0;
      const rightDate =
        right && typeof right === "object" ? getDateValue(right) : 0;
      return rightDate - leftDate;
    });
  }

  return output;
}

function sanitizeNode(node, parentKey = "") {
  if (Array.isArray(node)) return sanitizeArray(parentKey, node);
  if (!node || typeof node !== "object") return node;

  const result = { ...node };
  for (const [key, value] of Object.entries(node)) {
    result[key] = sanitizeNode(value, key);
  }
  return result;
}

function isLikelyDocumentUrl(url) {
  const value = String(url || "").toLowerCase();
  return (
    value.includes("/muhasebe") &&
    /(document|intake|belge|invoice|irsaliye|fatura|tedarik|parse|upload|havuz|taslak)/i.test(
      value,
    )
  );
}

export function installMuhasebeDocumentSanitizer() {
  if (typeof window === "undefined") return;
  if (window.__KYERP_DOC_SANITIZER_INSTALLED__) return;
  if (typeof window.fetch !== "function") return;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);

    try {
      const input = args?.[0];
      const url =
        typeof input === "string" ? input : String(input?.url || "");

      if (!isLikelyDocumentUrl(url)) return response;

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) return response;

      const rawText = await response.clone().text();
      if (!rawText.trim()) return response;

      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        return response;
      }

      const headers = new Headers(response.headers);
      headers.delete("content-length");

      return new Response(JSON.stringify(sanitizeNode(parsed)), {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch {
      return response;
    }
  };

  window.__KYERP_DOC_SANITIZER_INSTALLED__ = true;
}
