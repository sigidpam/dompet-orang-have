#!/usr/bin/env node
/**
 * Fetch a daily gold reference price and write it as same-origin JSON.
 * Source: gold-api.com XAU/USD spot + Frankfurter USD/IDR.
 * ANTAM's retail page currently returns 403 to automated requests, so the app
 * labels this as a spot reference and supports a manual per-asset override.
 */
import { renameSync, writeFileSync } from 'node:fs';

const TROY_OUNCE_GRAMS = 31.1034768;
const OUTPUT = new URL('../public/data/gold-price.json', import.meta.url);
const TIMEOUT_MS = 20_000;

function fail(message) {
  console.error(`gold-price: ${message}`);
  process.exit(1);
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'dompet-orang-have/2' },
      signal: controller.signal,
    });
    if (!response.ok) {
      fail(`${url} returned ${response.status}`);
    }
    const text = await response.text();
    if (text.length > 200_000) {
      fail(`${url} response too large`);
    }
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

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const gold = await fetchJson('https://api.gold-api.com/price/XAU');
if (!isRecord(gold) || typeof gold.price !== 'number' || !Number.isFinite(gold.price)) {
  fail('gold API response missing numeric price');
}
const usdPerOunce = gold.price;
if (usdPerOunce < 500 || usdPerOunce > 20_000) {
  fail(`USD/oz out of range: ${usdPerOunce}`);
}

const fx = await fetchJson('https://api.frankfurter.dev/v1/latest?from=USD&to=IDR');
if (!isRecord(fx) || !isRecord(fx.rates) || typeof fx.rates.IDR !== 'number') {
  fail('FX response missing USD/IDR');
}
const usdToIdr = fx.rates.IDR;
if (!Number.isFinite(usdToIdr) || usdToIdr < 1_000 || usdToIdr > 50_000) {
  fail(`USD/IDR out of range: ${usdToIdr}`);
}

const pricePerGram = (usdPerOunce / TROY_OUNCE_GRAMS) * usdToIdr;
if (pricePerGram < 100_000 || pricePerGram > 20_000_000) {
  fail(`IDR/gram out of range: ${pricePerGram}`);
}

const now = new Date();
const updatedAt =
  typeof gold.updatedAt === 'string' && !Number.isNaN(Date.parse(gold.updatedAt))
    ? new Date(gold.updatedAt).toISOString()
    : now.toISOString();
const marketDate =
  isRecord(fx) && typeof fx.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fx.date)
    ? fx.date
    : now.toISOString().slice(0, 10);

const output = {
  source: 'gold-api.com XAU/USD + Frankfurter USD/IDR',
  sourceType: 'spot',
  currency: 'IDR',
  pricePerGram: pricePerGram.toFixed(2),
  usdPerOunce: usdPerOunce.toFixed(6),
  usdToIdr: String(usdToIdr),
  marketDate,
  updatedAt,
  fetchedAt: now.toISOString(),
};

writeFileSync(`${OUTPUT.pathname}.tmp`, `${JSON.stringify(output, null, 2)}\n`);
renameSync(`${OUTPUT.pathname}.tmp`, OUTPUT.pathname);
console.log(
  `gold-price: wrote ${output.pricePerGram} IDR/g (USD/oz ${output.usdPerOunce}, USD/IDR ${output.usdToIdr})`,
);
