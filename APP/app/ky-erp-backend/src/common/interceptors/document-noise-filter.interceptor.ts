import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

type AnyObj = Record<string, any>;

const NOISE_PATTERNS: RegExp[] = [
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
  /\ba[cç]ıklama\s*:\s*120\s*g[üu]n\b/i,
  /^\*\s*yaln[ıi]z/i,
  /^\*\s*usd/i,
  /^\*\s*eur/i,
  /\btoplam\s*tutar\b/i,
];

const ITEM_ARRAY_KEYS = [
  'belgeKalemleri',
  'kalemler',
  'items',
  'lineItems',
  'rows',
  'parsedItems',
  'matchedItems',
  'candidateItems',
  'documentItems',
  'invoiceItems',
];

const POOL_ARRAY_KEYS = [
  'havuz',
  'irsaliyeHavuzu',
  'taslaklar',
  'drafts',
  'pool',
  'kayitLogu',
  'log',
  'logs',
];

function normalizeText(input: any): string {
  return String(input ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[‐-‒–—]/g, '-')
    .trim();
}

function hasNoise(text: string): boolean {
  const value = normalizeText(text);
  if (!value) return false;
  return NOISE_PATTERNS.some((r) => r.test(value));
}

function extractItemText(value: any): string {
  if (typeof value === 'string') return value;

  if (!value || typeof value !== 'object') return '';

  const fields = [
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
  ];

  return normalizeText(fields.filter(Boolean).join(' | '));
}

function looksLikeItemObject(value: any): boolean {
  if (!value || typeof value !== 'object') return false;

  const keys = Object.keys(value);
  const signalKeys = [
    'urunAdi',
    'productName',
    'itemName',
    'name',
    'description',
    'aciklama',
    'miktar',
    'quantity',
    'adet',
    'birim',
    'unit',
    'fiyat',
    'price',
    'tutar',
    'amount',
    'lotNo',
    'ambalaj',
  ];

  return signalKeys.some((k) => keys.includes(k));
}

function dedupeArray(arr: any[]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];

  for (const item of arr) {
    let key = '';
    if (typeof item === 'string') {
      key = normalizeText(item).toLowerCase();
    } else if (item && typeof item === 'object') {
      const text = extractItemText(item).toLowerCase();
      const qty = normalizeText(item.miktar ?? item.quantity ?? item.adet ?? '');
      const unit = normalizeText(item.birim ?? item.unit ?? '');
      const amount = normalizeText(item.tutar ?? item.amount ?? item.total ?? '');
      key = [text, qty, unit, amount].filter(Boolean).join(' | ');
    }

    if (!key) {
      out.push(item);
      continue;
    }

    if (!seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }

  return out;
}

function getDateValue(item: AnyObj): number {
  const raw =
    item?.tarih ??
    item?.date ??
    item?.createdAt ??
    item?.updatedAt ??
    item?.belgeTarihi ??
    item?.dispatchDate ??
    item?.invoiceDate;

  if (!raw) return 0;
  const t = new Date(String(raw)).getTime();
  return Number.isFinite(t) ? t : 0;
}

function sanitizeDocumentArray(parentKey: string, arr: any[]): any[] {
  let out = arr.map((x) => sanitizeNode(x, parentKey));

  const isItemArray =
    ITEM_ARRAY_KEYS.some((k) => parentKey.toLowerCase().includes(k.toLowerCase())) ||
    /kalem|item|line|row/i.test(parentKey);

  if (isItemArray) {
    out = out.filter((item) => {
      if (typeof item === 'string') {
        return !hasNoise(item);
      }

      if (looksLikeItemObject(item)) {
        const text = extractItemText(item);
        return !text || !hasNoise(text);
      }

      return true;
    });

    out = dedupeArray(out);
  }

  const isPoolArray =
    POOL_ARRAY_KEYS.some((k) => parentKey.toLowerCase().includes(k.toLowerCase())) ||
    /havuz|pool|taslak|draft|log/i.test(parentKey);

  if (isPoolArray) {
    out = [...out].sort((a, b) => {
      const ad = a && typeof a === 'object' ? getDateValue(a) : 0;
      const bd = b && typeof b === 'object' ? getDateValue(b) : 0;
      return bd - ad;
    });
  }

  return out;
}

function sanitizeNode(node: any, parentKey = ''): any {
  if (Array.isArray(node)) {
    return sanitizeDocumentArray(parentKey, node);
  }

  if (!node || typeof node !== 'object') {
    return node;
  }

  const result: AnyObj = Array.isArray(node) ? [] : { ...node };

  for (const [key, value] of Object.entries(node)) {
    result[key] = sanitizeNode(value, key);
  }

  return result;
}

@Injectable()
export class DocumentNoiseFilterInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (!this.isMuhasebeDocumentRequest(context)) {
      return next.handle();
    }

    return next.handle().pipe(map((data) => sanitizeNode(data)));
  }

  private isMuhasebeDocumentRequest(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest?.();
    const url = String(request?.originalUrl ?? request?.url ?? '').toLowerCase();

    return (
      url.includes('/muhasebe') &&
      /(belge|document|intake|invoice|irsaliye|fatura|parse|upload|havuz|taslak)/i.test(url)
    );
  }
}
