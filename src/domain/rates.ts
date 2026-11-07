import { Decimal } from './money';

const RATE_ENDPOINT = 'https://api.frankfurter.dev/v1/latest';
const DEFAULT_TARGETS = ['USD', 'EUR', 'SGD', 'MYR', 'JPY', 'GBP', 'AUD'];
const MAX_RESPONSE_BYTES = 100_000;
const TIMEOUT_MS = 15_000;

export interface RateFetchResult {
  date: string;
  rates: Map<string, string>;
}

export class RateFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateFetchError';
  }
}

function uniqueTargets(currencies: string[]): string[] {
  const targets = [
    ...new Set(
      currencies
        .map((currency) => currency.trim().toUpperCase())
        .filter((currency) => /^[A-Z]{3}$/.test(currency) && currency !== 'IDR'),
    ),
  ].sort();
  return targets.length > 0 ? targets : [...DEFAULT_TARGETS];
}

async function readLimitedText(response: Response): Promise<string> {
  const declaredLength = response.headers.get('content-length');
  if (
    declaredLength !== null &&
    Number.isFinite(Number(declaredLength)) &&
    Number(declaredLength) > MAX_RESPONSE_BYTES
  ) {
    throw new RateFetchError('Respons kurs terlalu besar.');
  }
  if (!response.body) {
    const text = await response.text();
    if (text.length > MAX_RESPONSE_BYTES) {
      throw new RateFetchError('Respons kurs terlalu besar.');
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new RateFetchError('Respons kurs terlalu besar.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function parseRateDate(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RateFetchError('Tanggal kurs tidak valid.');
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new RateFetchError('Tanggal kurs tidak valid.');
  }
  return value;
}

export async function fetchRatesFromFrankfurter(
  currencies: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<RateFetchResult> {
  const targets = uniqueTargets(currencies);
  const url = new URL(RATE_ENDPOINT);
  url.searchParams.set('from', 'IDR');
  url.searchParams.set('to', targets.join(','));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new RateFetchError(`Penyedia kurs merespons ${response.status}.`);
    }

    // Keep the timeout active while reading the body; a server can send headers
    // immediately and then stall or trickle the response.
    const text = await readLimitedText(response);

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new RateFetchError('Respons kurs bukan JSON yang valid.');
    }

    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload)
    ) {
      throw new RateFetchError('Format respons kurs tidak dikenal.');
    }

    const record = payload as Record<string, unknown>;
    if (
      record.base !== 'IDR' ||
      typeof record.rates !== 'object' ||
      record.rates === null
    ) {
      throw new RateFetchError(
        'Penyedia kurs mengembalikan basis yang tak terduga.',
      );
    }

    const date =
      record.date === undefined
        ? new Date().toISOString().slice(0, 10)
        : parseRateDate(record.date);

    const rates = new Map<string, string>();
    const rawRates = record.rates as Record<string, unknown>;
    for (const currency of targets) {
      const value = rawRates[currency];
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        continue;
      }
      const rateToIdr = new Decimal(1)
        .div(new Decimal(value))
        .toDecimalPlaces(10, Decimal.ROUND_HALF_UP);
      if (rateToIdr.gt(0)) {
        rates.set(currency, rateToIdr.toString());
      }
    }

    if (rates.size === 0) {
      throw new RateFetchError('Tidak ada kurs yang bisa diperbarui.');
    }

    return { date, rates };
  } catch (error) {
    if (error instanceof RateFetchError) throw error;
    throw new RateFetchError(
      error instanceof Error && error.name === 'AbortError'
        ? 'Permintaan kurs melebihi batas waktu.'
        : 'Tidak dapat menghubungi penyedia kurs. Periksa koneksi Anda.',
    );
  } finally {
    clearTimeout(timer);
  }
}

export function currenciesInUse(
  accountCurrencies: string[],
  investmentCurrencies: string[],
): string[] {
  return [
    ...new Set(
      [...accountCurrencies, ...investmentCurrencies].filter(
        (currency) => currency !== 'IDR',
      ),
    ),
  ].sort();
}
