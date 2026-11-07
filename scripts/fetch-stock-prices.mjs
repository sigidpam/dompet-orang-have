#!/usr/bin/env node
/**
 * Fetch the public fzn0x/idx quote board and write a compact same-origin snapshot.
 * No API key; runs server-side in GitHub Actions to avoid browser CORS limits.
 */
import { renameSync, writeFileSync } from 'node:fs';

const UNIVERSE = 'https://ihsg.midoriresearch.com/api/universe';
const QUOTE = 'https://ihsg.midoriresearch.com/api/quote';
const OUTPUT = new URL('../public/data/stock-prices.json', import.meta.url);
const TIMEOUT_MS = 60_000;
const MAX_BYTES = 5_000_000;

function fail(message) {
  console.error(`stock-prices: ${message}`);
  process.exit(1);
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'dompet-orang-have/2 (stock snapshot)',
      },
      signal: controller.signal,
    });
    if (!response.ok) fail(`${url} returned ${response.status}`);
    const text = await response.text();
    if (text.length > MAX_BYTES) fail(`${url} response too large`);
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      fail(`${url} timed out`);
    }
    fail(`${url} failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timer);
  }
}

function num(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value.toFixed(2).replace(/\.?0+$/, '');
}

const universe = await fetchJson(UNIVERSE);
const symbols = Array.isArray(universe?.data)
  ? universe.data.map((item) => item?.symbol).filter((value) => typeof value === 'string')
  : [];
if (symbols.length < 500) fail(`universe too small: ${symbols.length}`);

const quoteUrl = `${QUOTE}?symbols=${encodeURIComponent(symbols.join(','))}`;
const payload = await fetchJson(quoteUrl);
const rows = Array.isArray(payload?.data) ? payload.data : [];
const quotes = {};
let asOf = null;
for (const row of rows) {
  const symbol = String(row?.symbol ?? '').toUpperCase();
  const price = num(row?.price);
  if (!/^[A-Z]{2,6}$/.test(symbol) || !price) continue;
  const entry = { price };
  const previousClose = num(row?.previous_close);
  if (previousClose) entry.previousClose = previousClose;
  if (typeof row?.market_time === 'string') {
    entry.marketTime = row.market_time;
    if (asOf === null || row.market_time > asOf) asOf = row.market_time;
  }
  if (typeof row?.name === 'string') entry.name = row.name;
  quotes[symbol] = entry;
}
if (Object.keys(quotes).length < 500) {
  fail(`only ${Object.keys(quotes).length} valid quotes; refusing partial snapshot`);
}
const now = new Date();
const snapshot = {
  source: 'ihsg.midoriresearch.com (fzn0x/idx, Yahoo quote board)',
  sourceType: 'snapshot',
  currency: 'IDR',
  asOf: asOf ?? now.toISOString(),
  fetchedAt: now.toISOString(),
  quotes: Object.fromEntries(
    Object.entries(quotes).sort(([a], [b]) => a.localeCompare(b)),
  ),
};
writeFileSync(`${OUTPUT.pathname}.tmp`, `${JSON.stringify(snapshot)}\n`);
renameSync(`${OUTPUT.pathname}.tmp`, OUTPUT.pathname);
console.log(`stock-prices: wrote ${Object.keys(quotes).length} quotes, asOf ${snapshot.asOf}`);
