import { toDecimal } from './money';

export interface StockQuoteEntry {
  price: string;
  previousClose?: string;
  marketTime?: string;
  name?: string;
}

export interface StockSnapshot {
  source: string;
  sourceType: string;
  currency: 'IDR';
  asOf: string;
  fetchedAt: string;
  quotes: Record<string, StockQuoteEntry>;
}

const CACHE_KEY = 'dompet.stockSnapshot.v1';
const MAX_BYTES = 5_000_000;
const SYMBOL_RE = /^[A-Z]{2,6}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validDate(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 64 &&
    !Number.isNaN(Date.parse(value))
  );
}

function readPrice(value: unknown): string | null {
  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : NaN;
  if (!Number.isFinite(number) || number <= 0 || number > 1_000_000_000) {
    return null;
  }
  return toDecimal(number).toDecimalPlaces(2).toString();
}

export function parseStockSnapshot(value: unknown): StockSnapshot {
  if (!isRecord(value)) throw new Error('Format snapshot saham tidak dikenal.');
  if (typeof value.source !== 'string' || value.source.length > 300) {
    throw new Error('Sumber snapshot saham tidak valid.');
  }
  if (value.currency !== 'IDR') {
    throw new Error('Snapshot saham harus dalam IDR.');
  }
  if (!validDate(value.asOf) || !validDate(value.fetchedAt)) {
    throw new Error('Tanggal snapshot saham tidak valid.');
  }
  if (!isRecord(value.quotes)) {
    throw new Error('Daftar harga saham tidak valid.');
  }
  const keys = Object.keys(value.quotes);
  if (keys.length === 0 || keys.length > 2000) {
    throw new Error('Jumlah harga saham di luar batas.');
  }
  const quotes: Record<string, StockQuoteEntry> = {};
  for (const key of keys) {
    const code = key.trim().toUpperCase();
    if (!SYMBOL_RE.test(code)) continue;
    const raw = value.quotes[key];
    if (!isRecord(raw)) continue;
    const price = readPrice(raw.price);
    if (!price) continue;
    const entry: StockQuoteEntry = { price };
    const previousClose = readPrice(raw.previousClose);
    if (previousClose) entry.previousClose = previousClose;
    if (typeof raw.marketTime === 'string' && validDate(raw.marketTime)) {
      entry.marketTime = raw.marketTime;
    }
    if (typeof raw.name === 'string' && raw.name.length <= 200) {
      entry.name = raw.name;
    }
    quotes[code] = entry;
  }
  if (Object.keys(quotes).length === 0) {
    throw new Error('Snapshot saham tidak berisi harga yang valid.');
  }
  return {
    source: value.source,
    sourceType:
      typeof value.sourceType === 'string' ? value.sourceType : 'snapshot',
    currency: 'IDR',
    asOf: value.asOf,
    fetchedAt: value.fetchedAt,
    quotes,
  };
}

export function lookupStockQuote(
  snapshot: StockSnapshot,
  rawCode: string,
): (StockQuoteEntry & { code: string }) | null {
  const code = rawCode.trim().toUpperCase();
  if (!SYMBOL_RE.test(code)) return null;
  const entry = snapshot.quotes[code];
  return entry ? { ...entry, code } : null;
}

export function readCachedStockSnapshot(): StockSnapshot | null {
  try {
    const raw = globalThis.localStorage?.getItem(CACHE_KEY);
    if (!raw) return null;
    return parseStockSnapshot(JSON.parse(raw));
  } catch {
    return null;
  }
}

function cacheSnapshot(snapshot: StockSnapshot): void {
  try {
    globalThis.localStorage?.setItem(CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Public snapshot; caching is a convenience.
  }
}

export async function loadStockSnapshot(
  fetchImpl: typeof fetch = fetch,
): Promise<StockSnapshot | null> {
  try {
    const base =
      typeof document !== 'undefined' ? document.baseURI : 'https://localhost/';
    const url = new URL('data/stock-prices.json', base);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetchImpl(url, {
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        headers: { Accept: 'application/json' },
        cache: 'no-cache',
        signal: controller.signal,
      });
      if (!response.ok) return readCachedStockSnapshot();
      const text = await response.text();
      if (text.length > MAX_BYTES) return readCachedStockSnapshot();
      const parsed = parseStockSnapshot(JSON.parse(text));
      cacheSnapshot(parsed);
      return parsed;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return readCachedStockSnapshot();
  }
}
