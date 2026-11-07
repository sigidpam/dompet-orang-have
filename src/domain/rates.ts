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

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
  } catch (error) {
    throw new RateFetchError(
      error instanceof Error && error.name === 'AbortError'
        ? 'Permintaan kurs melebihi batas waktu.'
        : 'Tidak dapat menghubungi penyedia kurs. Periksa koneksi Anda.',
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new RateFetchError(`Penyedia kurs merespons ${response.status}.`);
  }

  const text = await response.text();
  if (text.length > MAX_RESPONSE_BYTES) {
    throw new RateFetchError('Respons kurs terlalu besar.');
  }

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
  if (record.base !== 'IDR' || typeof record.rates !== 'object' || record.rates === null) {
    throw new RateFetchError('Penyedia kurs mengembalikan basis yang tak terduga.');
  }

  const date =
    typeof record.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(record.date)
      ? record.date
      : new Date().toISOString().slice(0, 10);

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
