import { describe, expect, it, vi } from 'vitest';
import {
  RateFetchError,
  currenciesInUse,
  fetchRatesFromFrankfurter,
} from '../src/domain/rates';

function response(body: unknown, status = 200): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Frankfurter rate sync', () => {
  it('converts IDR-based quotes into rate-to-IDR values', async () => {
    const fetchMock = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        response({
          amount: 1,
          base: 'IDR',
          date: '2026-11-06',
          rates: { USD: 0.0000625, SGD: 0.0000833333, EUR: 0 },
        }),
    );
    const result = await fetchRatesFromFrankfurter(
      ['usd', 'IDR', 'USD', 'SGD', 'EUR'],
      fetchMock as unknown as typeof fetch,
    );
    expect(result.date).toBe('2026-11-06');
    expect(result.rates.get('USD')).toBe('16000');
    expect(Number(result.rates.get('SGD'))).toBeCloseTo(12000, 2);
    expect(result.rates.has('EUR')).toBe(false);
    const requested = String(fetchMock.mock.calls[0]?.[0]);
    expect(requested).toContain('from=IDR');
    expect(requested).toContain('to=EUR%2CSGD%2CUSD');
  });

  it('falls back to default target currencies when given only IDR', async () => {
    const fetchMock = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        response({
          base: 'IDR',
          date: '2026-11-06',
          rates: { USD: 0.0000625 },
        }),
    );
    const result = await fetchRatesFromFrankfurter(
      ['IDR'],
      fetchMock as unknown as typeof fetch,
    );
    expect(result.rates.get('USD')).toBe('16000');
    const requested = String(fetchMock.mock.calls[0]?.[0]);
    expect(requested).toContain('EUR');
  });

  it('rejects non-OK responses, malformed JSON, and wrong base', async () => {
    await expect(
      fetchRatesFromFrankfurter(
        ['USD'],
        (async () => response({}, 500)) as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(RateFetchError);

    await expect(
      fetchRatesFromFrankfurter(
        ['USD'],
        (async () => response('not-json')) as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(RateFetchError);

    await expect(
      fetchRatesFromFrankfurter(
        ['USD'],
        (async () =>
          response({ base: 'EUR', date: '2026-11-06', rates: { USD: 1 } })) as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(RateFetchError);
  });

  it('rejects a calendar-invalid provider date before it can be persisted', async () => {
    await expect(
      fetchRatesFromFrankfurter(
        ['USD'],
        (async () =>
          response({
            base: 'IDR',
            date: '2026-13-01',
            rates: { USD: 0.0000625 },
          })) as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(RateFetchError);
  });

  it('rejects oversized responses and network failures', async () => {
    const huge = 'x'.repeat(100_001);
    await expect(
      fetchRatesFromFrankfurter(
        ['USD'],
        (async () => new Response(huge)) as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(RateFetchError);

    await expect(
      fetchRatesFromFrankfurter(
        ['USD'],
        (async () => {
          throw new TypeError('network down');
        }) as unknown as typeof fetch,
      ),
    ).rejects.toBeInstanceOf(RateFetchError);
  });

  it('lists non-IDR currencies in use', () => {
    expect(
      currenciesInUse(['IDR', 'USD', 'USD'], ['EUR', 'IDR']),
    ).toEqual(['EUR', 'USD']);
  });
});
