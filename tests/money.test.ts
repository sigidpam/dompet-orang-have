import { describe, expect, it } from 'vitest';
import {
  Decimal,
  ValidationError,
  amountToString,
  decimalToString,
  formatMoney,
  formatNumber,
  parseAmount,
  parseDecimalInput,
  parseInteger,
  parseRate,
  todayIso,
} from '../src/domain/money';

describe('parseAmount', () => {
  it('accepts plain integers and both decimal separators', () => {
    expect(parseAmount('1000').toString()).toBe('1000');
    expect(parseAmount('1250.50').toString()).toBe('1250.5');
    expect(parseAmount('1250,50').toString()).toBe('1250.5');
    expect(parseAmount('0').toString()).toBe('0');
  });

  it('rejects thousand separators, negatives, and more than 2 decimals', () => {
    expect(() => parseAmount('1.000.000')).toThrow(ValidationError);
    expect(() => parseAmount('1,000.50')).toThrow(ValidationError);
    expect(() => parseAmount('-5')).toThrow(ValidationError);
    expect(() => parseAmount('1.234')).toThrow(ValidationError);
    expect(() => parseAmount('abc')).toThrow(ValidationError);
    expect(() => parseAmount('')).toThrow(ValidationError);
  });

  it('rejects values above the safe bound', () => {
    expect(() => parseAmount('1000000000000001')).toThrow(ValidationError);
  });
});

describe('parseRate and parseInteger', () => {
  it('validates rates', () => {
    expect(parseRate('16000').toString()).toBe('16000');
    expect(parseRate('0.0000625').toString()).toBe('0.0000625');
    expect(() => parseRate('0')).toThrow(ValidationError);
    expect(() => parseRate('-1')).toThrow(ValidationError);
    expect(() => parseRate('1.12345678901')).toThrow(ValidationError);
  });

  it('validates bounded integers', () => {
    expect(parseInteger('12', 'tenor', 0, 600)).toBe(12);
    expect(() => parseInteger('12.5', 'tenor', 0, 600)).toThrow(ValidationError);
    expect(() => parseInteger('601', 'tenor', 0, 600)).toThrow(ValidationError);
  });
});

describe('decimal helpers', () => {
  it('keeps exact arithmetic', () => {
    const total = new Decimal('0.1').plus('0.2');
    expect(total.toString()).toBe('0.3');
    expect(amountToString(total)).toBe('0.3');
  });

  it('normalizes storage strings without exponent notation', () => {
    expect(decimalToString(new Decimal('0.0000001'), 10)).toBe('0.0000001');
    expect(decimalToString(new Decimal('-0'), 10)).toBe('0');
  });

  it('formats IDR and foreign currency without throwing', () => {
    expect(formatMoney('1234567', 'IDR')).toContain('1.234.567');
    expect(formatMoney('1234.5', 'USD')).toContain('1.234,50');
    expect(formatNumber('1234.567', 2)).toBe('1.234,57');
    expect(formatMoney('10', 'ZZZ')).toContain('ZZZ');
  });

  it('rejects non-finite decimal input', () => {
    expect(() => parseDecimalInput('NaN', 'x')).toThrow(ValidationError);
    expect(() => parseDecimalInput('Infinity', 'x')).toThrow(ValidationError);
  });

  it('returns a local ISO date', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
