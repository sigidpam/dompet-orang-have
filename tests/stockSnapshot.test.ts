import { describe, expect, it, vi } from 'vitest';
import {
  loadStockSnapshot,
  lookupStockQuote,
  parseStockSnapshot,
  readCachedStockSnapshot,
} from '../src/domain/stockSnapshot';

const VALID = {
  source: 'ihsg.midoriresearch.com (fzn0x/idx)',
  sourceType: 'snapshot',
  currency: 'IDR',
  asOf: '2026-11-06T16:14:59+07:00',
  fetchedAt: '2026-11-07T10:00:00Z',
  quotes: {
    BBCA: {
      price: '5200',
      previousClose: '5125',
      marketTime: '2026-11-06T16:13:33+07:00',
      name: 'PT Bank Central Asia Tbk',
    },
    TLKM: { price: 1900 },
  },
};

describe('IDX stock snapshot', () => {
  it('parses valid quotes and looks up a code', () => {
    const snapshot = parseStockSnapshot(VALID);
    expect(snapshot.quotes.BBCA?.price).toBe('5200');
    expect(snapshot.quotes.TLKM?.price).toBe('1900');
    expect(lookupStockQuote(snapshot, 'bbca')).toMatchObject({
      code: 'BBCA',
      price: '5200',
      previousClose: '5125',
    });
    expect(lookupStockQuote(snapshot, 'ZZZZ')).toBeNull();
    expect(lookupStockQuote(snapshot, 'B1')).toBeNull();
  });

  it('rejects malformed snapshots', () => {
    expect(() => parseStockSnapshot({ ...VALID, currency: 'USD' })).toThrow();
    expect(() => parseStockSnapshot({ ...VALID, quotes: {} })).toThrow();
    expect(() => parseStockSnapshot({ ...VALID, fetchedAt: 'bad' })).toThrow();
    expect(() =>
      parseStockSnapshot({ ...VALID, quotes: { BBCA: { price: 0 } } }),
    ).toThrow();
    expect(() => parseStockSnapshot(null)).toThrow();
  });

  it('loads and caches the same-origin snapshot, with offline fallback', async () => {
    const ok = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(VALID), { status: 200 }),
    );
    const snapshot = await loadStockSnapshot(ok as unknown as typeof fetch);
    expect(snapshot?.quotes.BBCA?.price).toBe('5200');
    expect(readCachedStockSnapshot()?.quotes.BBCA?.price).toBe('5200');

    const offline = vi.fn(async () => {
      throw new TypeError('offline');
    });
    const fallback = await loadStockSnapshot(
      offline as unknown as typeof fetch,
    );
    expect(fallback?.quotes.BBCA?.price).toBe('5200');
  });

  it('returns null for invalid JSON and invalid cached data', async () => {
    const bad = vi.fn(
      async (_url: RequestInfo | URL, _init?: RequestInit) =>
        new Response('not-json', { status: 200 }),
    );
    await expect(loadStockSnapshot(bad as unknown as typeof fetch)).resolves.toBeNull();
    globalThis.localStorage.setItem('dompet.stockSnapshot.v1', '{"bad":true}');
    expect(readCachedStockSnapshot()).toBeNull();
  });
});
