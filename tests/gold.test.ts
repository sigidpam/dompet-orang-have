import { describe, expect, it, vi } from 'vitest';
import {
  loadGoldPrice,
  parseGoldPrice,
  readCachedGoldPrice,
} from '../src/domain/gold';

const VALID = {
  source: 'gold-api.com XAU/USD + Frankfurter USD/IDR',
  sourceType: 'spot',
  currency: 'IDR',
  pricePerGram: '2369671.15',
  usdPerOunce: '4072.1',
  usdToIdr: '18100',
  marketDate: '2026-11-06',
  updatedAt: '2026-11-07T11:40:07Z',
  fetchedAt: '2026-11-07T11:45:00Z',
};

describe('gold price feed', () => {
  it('parses and normalizes a valid same-origin price file', () => {
    const price = parseGoldPrice(VALID);
    expect(price.pricePerGram).toBe('2369671.15');
    expect(price.currency).toBe('IDR');
    expect(price.sourceType).toBe('spot');
  });

  it('rejects invalid currency, price, and dates', () => {
    expect(() => parseGoldPrice({ ...VALID, currency: 'USD' })).toThrow();
    expect(() => parseGoldPrice({ ...VALID, pricePerGram: '0' })).toThrow();
    expect(() => parseGoldPrice({ ...VALID, pricePerGram: 'abc' })).toThrow();
    expect(() => parseGoldPrice({ ...VALID, updatedAt: 'not-a-date' })).toThrow();
    expect(() => parseGoldPrice(null)).toThrow();
  });

  it('loads the same-origin JSON and caches it', async () => {
    const fetchMock = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(VALID), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const price = await loadGoldPrice(
      fetchMock as unknown as typeof fetch,
    );
    expect(price?.pricePerGram).toBe('2369671.15');
    expect(readCachedGoldPrice()?.source).toContain('gold-api');
  });

  it('falls back to the cached price when the network fails', async () => {
    const good = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(VALID), { status: 200 }),
    );
    await loadGoldPrice(good as unknown as typeof fetch);
    const offline = vi.fn(async () => {
      throw new TypeError('offline');
    });
    const price = await loadGoldPrice(
      offline as unknown as typeof fetch,
    );
    expect(price?.pricePerGram).toBe('2369671.15');
  });

  it('returns null for invalid JSON and a malformed cache', async () => {
    const invalid = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response('not-json', { status: 200 }),
    );
    await expect(
      loadGoldPrice(invalid as unknown as typeof fetch),
    ).resolves.toBeNull();
    globalThis.localStorage.setItem('dompet.goldPrice.v1', '{"bad":true}');
    expect(readCachedGoldPrice()).toBeNull();
  });
});
