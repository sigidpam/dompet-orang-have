import {
  ACCOUNT_TYPES,
  DEFAULT_SETTINGS,
  type Account,
  type AccountType,
  type Dataset,
  type ExchangeRate,
  type Investment,
  type RateSource,
  type Settings,
  type Transaction,
  type TransactionType,
} from './types';
import {
  Decimal,
  ValidationError,
  amountToString,
  parseAmount,
  parseDate,
  parseDecimalInput,
  parseInteger,
  parseRate,
  toDecimal,
} from './money';

const NAME_MAX = 80;
const CATEGORY_MAX = 60;
const ID_MAX = 100;
export const MAX_ACCOUNTS = 1_000;
export const MAX_TRANSACTIONS = 100_000;
export const MAX_INVESTMENTS = 10_000;
export const MAX_RATES = 500;
const CURRENCY_RE = /^[A-Z]{3}$/;
// eslint-disable-next-line security/detect-unsafe-regex -- anchored, bounded decimal grammar
const DECIMAL_RE = /^-?\d+(\.\d{1,2})?$/;
// eslint-disable-next-line security/detect-unsafe-regex -- anchored, bounded decimal grammar
const RATE_RE = /^\d+(\.\d{1,10})?$/;
const AUTO_LOCK_VALUES = [1, 5, 15, 30];

function hasControlChars(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function cleanText(
  raw: string,
  field: string,
  max = NAME_MAX,
  min = 1,
): string {
  const text = raw.trim();
  if (text.length < min) {
    throw new ValidationError('Wajib diisi.', field);
  }
  if (text.length > max) {
    throw new ValidationError(`Maksimal ${max} karakter.`, field);
  }
  if (hasControlChars(text)) {
    throw new ValidationError('Mengandung karakter yang tidak diizinkan.', field);
  }
  return text;
}

export function normalizeCurrency(raw: string, field = 'currency'): string {
  const code = raw.trim().toUpperCase();
  if (!CURRENCY_RE.test(code)) {
    throw new ValidationError('Gunakan kode mata uang 3 huruf (contoh: IDR).', field);
  }
  return code;
}

function normalizeDate(raw: string, field = 'date'): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new ValidationError('Tanggal tidak valid.', field);
  }
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== raw ||
    parsed.getUTCFullYear() < 1970 ||
    parsed.getUTCFullYear() > 2100
  ) {
    throw new ValidationError('Tanggal tidak valid.', field);
  }
  return raw;
}

export interface AccountFormInput {
  name: string;
  type: string;
  currency: string;
  balance: string;
}

export interface NormalizedAccountInput {
  name: string;
  type: AccountType;
  currency: string;
  balance: string;
}

export function normalizeAccountInput(
  input: AccountFormInput,
): NormalizedAccountInput {
  const name = cleanText(input.name, 'name');
  if (!ACCOUNT_TYPES.includes(input.type as AccountType)) {
    throw new ValidationError('Tipe rekening tidak valid.', 'type');
  }
  const currency = normalizeCurrency(input.currency);
  const balance = parseAmount(input.balance, 'balance');
  return {
    name,
    type: input.type as AccountType,
    currency,
    balance: amountToString(balance),
  };
}

export interface TransactionFormInput {
  accountId: string;
  type: string;
  category: string;
  amount: string;
  date: string;
}

export interface NormalizedTransactionInput {
  accountId: string;
  type: TransactionType;
  category: string;
  amount: string;
  date: string;
}

export function normalizeTransactionInput(
  input: TransactionFormInput,
): NormalizedTransactionInput {
  const accountId = cleanText(input.accountId, 'accountId', ID_MAX);
  if (input.type !== 'income' && input.type !== 'expense') {
    throw new ValidationError('Jenis transaksi tidak valid.', 'type');
  }
  const category = cleanText(input.category, 'category', CATEGORY_MAX);
  const amount = parseAmount(input.amount, 'amount');
  if (amount.lte(0)) {
    throw new ValidationError('Jumlah harus lebih besar dari 0.', 'amount');
  }
  const date = normalizeDate(input.date, 'date');
  return {
    accountId,
    type: input.type,
    category,
    amount: amountToString(amount),
    date,
  };
}

export interface InvestmentFormInput {
  name: string;
  category: string;
  principal: string;
  cashback: string;
  annualInterestRate: string;
  tenorMonths: string;
  lots: string;
  currency: string;
}

export interface NormalizedInvestmentInput {
  name: string;
  category: string;
  principal: string;
  cashback: string;
  annualInterestRate: string;
  tenorMonths: number;
  lots: number;
  currency: string;
}

export function normalizeInvestmentInput(
  input: InvestmentFormInput,
): NormalizedInvestmentInput {
  const name = cleanText(input.name, 'name');
  const category = cleanText(input.category, 'category', CATEGORY_MAX);
  const principal = parseAmount(input.principal, 'principal');
  if (principal.lte(0)) {
    throw new ValidationError('Modal harus lebih besar dari 0.', 'principal');
  }
  const cashback =
    input.cashback.trim() === '' ? new Decimal(0) : parseAmount(input.cashback, 'cashback');
  if (cashback.gt(principal)) {
    throw new ValidationError(
      'Cashback tidak boleh melebihi modal.',
      'cashback',
    );
  }
  const annualInterestRate =
    input.annualInterestRate.trim() === ''
      ? new Decimal(0)
      : parseDecimalInput(input.annualInterestRate, 'annualInterestRate', {
          min: 0,
          max: 1000,
          maxPlaces: 4,
        });
  const tenorMonths = parseInteger(input.tenorMonths, 'tenorMonths', 0, 600);
  const lots = parseInteger(input.lots, 'lots', 0, 1_000_000_000);
  const currency = normalizeCurrency(input.currency);
  return {
    name,
    category,
    principal: amountToString(principal),
    cashback: amountToString(cashback),
    annualInterestRate: annualInterestRate.toString(),
    tenorMonths,
    lots,
    currency,
  };
}

export function normalizeRateInput(input: {
  currency: string;
  rate: string;
}): { currency: string; rate: string } {
  const currency = normalizeCurrency(input.currency, 'rateCurrency');
  if (currency === 'IDR') {
    throw new ValidationError('Kurs IDR selalu 1.', 'rateCurrency');
  }
  const rate = parseRate(input.rate, 'rate');
  return { currency, rate: rate.toString() };
}

export function normalizeSettingsInput(input: {
  autoLockMinutes: string;
  ratesAutoSync: boolean;
}): Settings {
  const minutes = parseInteger(input.autoLockMinutes, 'autoLockMinutes', 1, 30);
  if (!AUTO_LOCK_VALUES.includes(minutes)) {
    throw new ValidationError('Pilihan auto-lock tidak valid.', 'autoLockMinutes');
  }
  return {
    autoLockMinutes: minutes,
    ratesAutoSync: Boolean(input.ratesAutoSync),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(
  record: Record<string, unknown>,
  key: string,
  field: string,
  max = NAME_MAX,
): string {
  const value = record[key];
  if (typeof value !== 'string') {
    throw new ValidationError(`Data ${field} tidak valid.`, field);
  }
  return cleanText(value, field, max);
}

function readId(record: Record<string, unknown>): string {
  return readString(record, 'id', 'id', ID_MAX);
}

function readAmount(
  record: Record<string, unknown>,
  key: string,
  field: string,
  allowNegative = false,
): string {
  const value = record[key];
  if (typeof value !== 'string' || !DECIMAL_RE.test(value)) {
    throw new ValidationError(`Nilai ${field} tidak valid.`, field);
  }
  const decimal = toDecimal(value);
  if (!allowNegative && decimal.isNegative()) {
    throw new ValidationError(`Nilai ${field} tidak boleh negatif.`, field);
  }
  return amountToString(decimal);
}

function readCurrency(record: Record<string, unknown>): string {
  const value = record.currency;
  if (typeof value !== 'string' || !CURRENCY_RE.test(value)) {
    throw new ValidationError('Mata uang tidak valid.', 'currency');
  }
  return value;
}

function readIso(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || !parseDate(value)) {
    throw new ValidationError(`Tanggal ${key} tidak valid.`, key);
  }
  return value;
}

function assertArrayLength(value: unknown[], max: number, label: string): void {
  if (value.length > max) {
    throw new ValidationError(`Jumlah ${label} melebihi batas.`, label);
  }
}

export function assertDataset(value: unknown): Dataset {
  if (!isRecord(value) || value.schemaVersion !== 2) {
    throw new ValidationError('Format data tidak dikenal.', 'dataset');
  }
  const accountsRaw = value.accounts;
  const transactionsRaw = value.transactions;
  const investmentsRaw = value.investments;
  const ratesRaw = value.rates;
  if (
    !Array.isArray(accountsRaw) ||
    !Array.isArray(transactionsRaw) ||
    !Array.isArray(investmentsRaw) ||
    !Array.isArray(ratesRaw)
  ) {
    throw new ValidationError('Struktur data tidak lengkap.', 'dataset');
  }
  assertArrayLength(accountsRaw, MAX_ACCOUNTS, 'accounts');
  assertArrayLength(transactionsRaw, MAX_TRANSACTIONS, 'transactions');
  assertArrayLength(investmentsRaw, MAX_INVESTMENTS, 'investments');
  assertArrayLength(ratesRaw, MAX_RATES, 'rates');

  const accountIds = new Set<string>();
  const accounts: Account[] = accountsRaw.map((item) => {
    if (!isRecord(item)) throw new ValidationError('Rekening tidak valid.', 'accounts');
    const id = readId(item);
    if (accountIds.has(id)) throw new ValidationError('ID rekening duplikat.', 'accounts');
    accountIds.add(id);
    const type = item.type;
    if (typeof type !== 'string' || !ACCOUNT_TYPES.includes(type as AccountType)) {
      throw new ValidationError('Tipe rekening tidak valid.', 'type');
    }
    return {
      id,
      name: readString(item, 'name', 'name'),
      type: type as AccountType,
      currency: readCurrency(item),
      balance: readAmount(item, 'balance', 'balance', true),
      createdAt: readIso(item, 'createdAt'),
    };
  });

  const transactionIds = new Set<string>();
  const transactions: Transaction[] = transactionsRaw.map((item) => {
    if (!isRecord(item)) throw new ValidationError('Transaksi tidak valid.', 'transactions');
    const id = readId(item);
    if (transactionIds.has(id)) {
      throw new ValidationError('ID transaksi duplikat.', 'transactions');
    }
    transactionIds.add(id);
    const accountId = readString(item, 'accountId', 'accountId', ID_MAX);
    if (!accountIds.has(accountId)) {
      throw new ValidationError('Transaksi merujuk rekening yang tidak ada.', 'accountId');
    }
    if (item.type !== 'income' && item.type !== 'expense') {
      throw new ValidationError('Jenis transaksi tidak valid.', 'type');
    }
    return {
      id,
      accountId,
      type: item.type,
      category: readString(item, 'category', 'category', CATEGORY_MAX),
      amount: readAmount(item, 'amount', 'amount'),
      currency: readCurrency(item),
      date: normalizeDate(String(item.date ?? ''), 'date'),
      createdAt: readIso(item, 'createdAt'),
    };
  });

  const investmentIds = new Set<string>();
  const investments: Investment[] = investmentsRaw.map((item) => {
    if (!isRecord(item)) throw new ValidationError('Investasi tidak valid.', 'investments');
    const id = readId(item);
    if (investmentIds.has(id)) {
      throw new ValidationError('ID investasi duplikat.', 'investments');
    }
    investmentIds.add(id);
    const principal = readAmount(item, 'principal', 'principal');
    const cashback = readAmount(item, 'cashback', 'cashback');
    if (toDecimal(cashback).gt(toDecimal(principal))) {
      throw new ValidationError('Cashback melebihi modal.', 'cashback');
    }
    if (typeof item.annualInterestRate !== 'string' || !RATE_RE.test(item.annualInterestRate)) {
      throw new ValidationError('Bunga investasi tidak valid.', 'annualInterestRate');
    }
    const tenor = item.tenorMonths;
    const lots = item.lots;
    if (typeof tenor !== 'number' || !Number.isSafeInteger(tenor) || tenor < 0 || tenor > 600) {
      throw new ValidationError('Tenor tidak valid.', 'tenorMonths');
    }
    if (typeof lots !== 'number' || !Number.isSafeInteger(lots) || lots < 0) {
      throw new ValidationError('Jumlah lot tidak valid.', 'lots');
    }
    return {
      id,
      name: readString(item, 'name', 'name'),
      category: readString(item, 'category', 'category', CATEGORY_MAX),
      principal,
      cashback,
      annualInterestRate: item.annualInterestRate,
      tenorMonths: tenor,
      lots,
      currency: readCurrency(item),
      createdAt: readIso(item, 'createdAt'),
    };
  });

  const rateCurrencies = new Set<string>();
  const rates: ExchangeRate[] = ratesRaw.map((item) => {
    if (!isRecord(item)) throw new ValidationError('Kurs tidak valid.', 'rates');
    const currency = readCurrency(item);
    if (currency === 'IDR' || rateCurrencies.has(currency)) {
      throw new ValidationError('Kurs duplikat atau IDR.', 'rates');
    }
    rateCurrencies.add(currency);
    if (typeof item.rateToIdr !== 'string' || !RATE_RE.test(item.rateToIdr)) {
      throw new ValidationError('Nilai kurs tidak valid.', 'rateToIdr');
    }
    const source = item.source;
    if (source !== 'manual' && source !== 'frankfurter') {
      throw new ValidationError('Sumber kurs tidak valid.', 'source');
    }
    return {
      currency,
      rateToIdr: item.rateToIdr,
      updatedAt: readIso(item, 'updatedAt'),
      source: source as RateSource,
    };
  });

  const settingsRaw = isRecord(value.settings) ? value.settings : {};
  const autoLock = settingsRaw.autoLockMinutes;
  const settings: Settings = {
    autoLockMinutes:
      typeof autoLock === 'number' && AUTO_LOCK_VALUES.includes(autoLock)
        ? autoLock
        : DEFAULT_SETTINGS.autoLockMinutes,
    ratesAutoSync:
      typeof settingsRaw.ratesAutoSync === 'boolean'
        ? settingsRaw.ratesAutoSync
        : DEFAULT_SETTINGS.ratesAutoSync,
  };

  return {
    schemaVersion: 2,
    accounts,
    transactions,
    investments,
    rates,
    settings,
    updatedAt: readIso(value, 'updatedAt'),
  };
}

export { cleanText, normalizeDate };
