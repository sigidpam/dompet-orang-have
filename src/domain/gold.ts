import { toDecimal } from './money';

export type GoldPriceSourceType = 'spot' | 'retail' | 'manual' | string;

export interface GoldPrice {
  source: string;
  sourceType: GoldPriceSourceType;
  currency: 'IDR';
  pricePerGram: string;
  marketDate?: string;
  updatedAt: string;
  fetchedAt?: string;
  usdPerOunce?: string;
  usdToIdr?: string;
}

const CACHE_KEY = 'dompet.goldPrice.v1';
const MAX_RESPONSE_BYTES = 200_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidIso(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
}

export function parseGoldPrice(value: unknown): GoldPrice {
  if (!isRecord(value)) {
    throw new Error('Format harga emas tidak dikenal.');
  }
  if (typeof value.source !== 'string' || value.source.length > 300) {
    throw new Error('Sumber harga emas tidak valid.');
  }
  if (value.currency !== 'IDR') {
    throw new Error('Harga emas harus dalam IDR.');
  }
  if (typeof value.pricePerGram !== 'string') {
    throw new Error('Harga emas per gram tidak valid.');
  }
  const price = toDecimal(value.pricePerGram);
  if (price.lte(0) || price.gt('100000000000')) {
    throw new Error('Harga emas per gram di luar batas.');
  }
  if (!isValidIso(value.updatedAt)) {
    throw new Error('Tanggal pembaruan harga emas tidak valid.');
  }
  const sourceType =
    typeof value.sourceType === 'string' ? value.sourceType : 'spot';
  return {
    source: value.source,
    sourceType,
    currency: 'IDR',
    pricePerGram: price.toDecimalPlaces(2).toString(),
    ...(typeof value.marketDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.marketDate)
      ? { marketDate: value.marketDate }
      : {}),
    updatedAt: value.updatedAt,
    ...(isValidIso(value.fetchedAt) ? { fetchedAt: value.fetchedAt } : {}),
    ...(typeof value.usdPerOunce === 'string'
      ? { usdPerOunce: value.usdPerOunce }
      : {}),
    ...(typeof value.usdToIdr === 'string'
      ? { usdToIdr: value.usdToIdr }
      : {}),
  };
}

export function readCachedGoldPrice(): GoldPrice | null {
  try {
    const raw = globalThis.localStorage?.getItem(CACHE_KEY);
    if (!raw) return null;
    return parseGoldPrice(JSON.parse(raw));
  } catch {
    return null;
  }
}

function cacheGoldPrice(price: GoldPrice): void {
  try {
    globalThis.localStorage?.setItem(CACHE_KEY, JSON.stringify(price));
  } catch {
    // The market price is public; caching is a convenience only.
  }
}

export async function loadGoldPrice(
  fetchImpl: typeof fetch = fetch,
): Promise<GoldPrice | null> {
  try {
    const base =
      typeof document !== 'undefined'
        ? document.baseURI
        : 'https://localhost/';
    const url = new URL('data/gold-price.json', base);
    const response = await fetchImpl(url, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json' },
      cache: 'no-cache',
    });
    if (!response.ok) {
      return readCachedGoldPrice();
    }
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      return readCachedGoldPrice();
    }
    const parsed = parseGoldPrice(JSON.parse(text));
    cacheGoldPrice(parsed);
    return parsed;
  } catch {
    return readCachedGoldPrice();
  }
}

export function goldPriceFetchedAt(price: GoldPrice): Date {
  return new Date(price.fetchedAt ?? price.updatedAt);
}
