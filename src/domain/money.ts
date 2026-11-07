import Decimal from 'decimal.js';

Decimal.set({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -30,
  toExpPos: 30,
});

export { Decimal };

export class ValidationError extends Error {
  readonly field: string;

  constructor(message: string, field = 'form') {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
  }
}

const ONE_HUNDRED = new Decimal(100);
const MAX_AMOUNT = new Decimal('1000000000000000');
const MAX_RATE = new Decimal('1000000000');

export function parseAmount(raw: string, field = 'amount'): Decimal {
  const normalized = raw.trim().replace(/\s/g, '').replace(',', '.');
  // eslint-disable-next-line security/detect-unsafe-regex -- anchored, bounded decimal grammar
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new ValidationError(
      'Masukkan angka >= 0, maksimal 2 desimal, tanpa pemisah ribuan.',
      field,
    );
  }
  const value = new Decimal(normalized);
  if (!value.isFinite() || value.isNegative()) {
    throw new ValidationError('Nilai harus berupa angka positif.', field);
  }
  if (value.gt(MAX_AMOUNT)) {
    throw new ValidationError('Nilai terlalu besar.', field);
  }
  return value;
}

export function parseDecimalInput(
  raw: string,
  field: string,
  options: { min?: Decimal.Value; max?: Decimal.Value; maxPlaces?: number } = {},
): Decimal {
  const normalized = raw.trim().replace(/\s/g, '').replace(',', '.');
  // eslint-disable-next-line security/detect-unsafe-regex -- anchored, bounded decimal grammar
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new ValidationError('Masukkan angka yang valid.', field);
  }
  const value = new Decimal(normalized);
  if (!value.isFinite() || value.isNegative()) {
    throw new ValidationError('Nilai harus berupa angka positif.', field);
  }
  if (options.min !== undefined && value.lt(options.min)) {
    throw new ValidationError(`Nilai minimal ${String(options.min)}.`, field);
  }
  if (options.max !== undefined && value.gt(options.max)) {
    throw new ValidationError(`Nilai maksimal ${String(options.max)}.`, field);
  }
  if (
    options.maxPlaces !== undefined &&
    value.decimalPlaces() > options.maxPlaces
  ) {
    throw new ValidationError(
      `Maksimal ${options.maxPlaces} angka desimal.`,
      field,
    );
  }
  return value;
}

export function parseRate(raw: string, field = 'rate'): Decimal {
  const value = parseDecimalInput(raw, field, {
    min: new Decimal('0.0000000001'),
    max: MAX_RATE,
    maxPlaces: 10,
  });
  if (value.lte(0)) {
    throw new ValidationError('Kurs harus lebih besar dari 0.', field);
  }
  return value;
}

export function parseInteger(
  raw: string,
  field: string,
  min: number,
  max: number,
): number {
  const normalized = raw.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new ValidationError('Masukkan bilangan bulat.', field);
  }
  const value = Number.parseInt(normalized, 10);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new ValidationError(`Nilai harus antara ${min} dan ${max}.`, field);
  }
  return value;
}

export function decimalToString(value: Decimal, maxPlaces = 10): string {
  const rounded = value.toDecimalPlaces(maxPlaces, Decimal.ROUND_HALF_UP);
  const text = rounded.toString();
  return text === '-0' ? '0' : text;
}

export function amountToString(value: Decimal): string {
  return decimalToString(value, 2);
}

export function toDecimal(value: Decimal.Value | string): Decimal {
  try {
    const parsed = new Decimal(value);
    return parsed.isFinite() ? parsed : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}

export function formatMoney(value: Decimal.Value, currency: string): string {
  const decimal = toDecimal(value);
  try {
    const fractionDigits = currency === 'IDR' ? 0 : 2;
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(Number(decimal));
  } catch {
    return `${currency} ${formatNumber(decimal)}`;
  }
}

export function formatIdr(value: Decimal.Value): string {
  return formatMoney(value, 'IDR');
}

export function formatCompactIdr(value: Decimal.Value): string {
  const decimal = toDecimal(value);
  try {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      notation: 'compact',
      maximumFractionDigits: 1,
      minimumFractionDigits: 0,
    }).format(Number(decimal));
  } catch {
    return formatIdr(decimal);
  }
}

export function formatNumber(value: Decimal.Value, maxPlaces = 2): string {
  const decimal = toDecimal(value);
  try {
    return new Intl.NumberFormat('id-ID', {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxPlaces,
    }).format(Number(decimal));
  } catch {
    return decimal.toString();
  }
}

export function formatRate(value: Decimal.Value): string {
  return formatNumber(value, 10);
}

export function formatPercent(value: Decimal.Value): string {
  return `${formatNumber(value, 4)}%`;
}

export function formatDate(dateIso: string): string {
  const date = parseDate(dateIso);
  if (!date) return dateIso;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatDateTime(dateIso: string): string {
  const date = parseDate(dateIso);
  if (!date) return dateIso;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function parseDate(value: string): Date | null {
  if (!value) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function todayIso(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function sum(values: Decimal[]): Decimal {
  return values.reduce((total, value) => total.plus(value), new Decimal(0));
}

export function clampPercent(value: Decimal.Value): Decimal {
  const decimal = toDecimal(value);
  if (decimal.lt(0)) return new Decimal(0);
  if (decimal.gt(ONE_HUNDRED)) return ONE_HUNDRED;
  return decimal;
}
