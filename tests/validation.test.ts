import { describe, expect, it } from 'vitest';
import {
  MAX_ACCOUNTS,
  assertDataset,
  normalizeAccountInput,
  normalizeInvestmentInput,
  normalizeRateInput,
  normalizeSettingsInput,
  normalizeTransactionInput,
} from '../src/domain/validation';
import { ValidationError } from '../src/domain/money';
import { emptyDataset } from '../src/domain/types';

describe('form validation', () => {
  it('normalizes account input and rejects unsafe values', () => {
    expect(
      normalizeAccountInput({
        name: '  Bank Mandiri ',
        type: 'bank',
        currency: 'usd',
        balance: '10,5',
      }),
    ).toEqual({
      name: 'Bank Mandiri',
      type: 'bank',
      currency: 'USD',
      balance: '10.5',
    });
    expect(() =>
      normalizeAccountInput({
        name: 'x',
        type: 'crypto',
        currency: 'IDR',
        balance: '1',
      }),
    ).toThrow(ValidationError);
    expect(() =>
      normalizeAccountInput({
        name: 'bad\u0000name',
        type: 'bank',
        currency: 'IDR',
        balance: '1',
      }),
    ).toThrow(ValidationError);
    expect(() =>
      normalizeAccountInput({
        name: 'x',
        type: 'bank',
        currency: 'RUPIAH',
        balance: '1',
      }),
    ).toThrow(ValidationError);
  });

  it('validates transactions', () => {
    expect(
      normalizeTransactionInput({
        accountId: 'acc_1',
        type: 'income',
        category: ' Gaji ',
        amount: '100',
        date: '2026-11-07',
      }),
    ).toEqual({
      accountId: 'acc_1',
      type: 'income',
      category: 'Gaji',
      amount: '100',
      date: '2026-11-07',
    });
    expect(() =>
      normalizeTransactionInput({
        accountId: 'acc_1',
        type: 'transfer',
        category: 'X',
        amount: '1',
        date: '2026-11-07',
      }),
    ).toThrow(ValidationError);
    expect(() =>
      normalizeTransactionInput({
        accountId: 'acc_1',
        type: 'expense',
        category: 'X',
        amount: '0',
        date: '2026-11-07',
      }),
    ).toThrow(ValidationError);
    expect(() =>
      normalizeTransactionInput({
        accountId: 'acc_1',
        type: 'expense',
        category: 'X',
        amount: '1',
        date: '2026-02-30',
      }),
    ).toThrow(ValidationError);
  });

  it('validates investments', () => {
    const input = {
      name: 'Deposito',
      category: 'Deposito',
      principal: '1000',
      cashback: '50',
      annualInterestRate: '6,5',
      tenorMonths: '12',
      lots: '0',
      currency: 'idr',
    };
    expect(normalizeInvestmentInput(input)).toEqual({
      name: 'Deposito',
      category: 'Deposito',
      principal: '1000',
      cashback: '50',
      annualInterestRate: '6.5',
      tenorMonths: 12,
      lots: 0,
      currency: 'IDR',
    });
    expect(() =>
      normalizeInvestmentInput({
        ...input,
        cashback: '1001',
      }),
    ).toThrow(ValidationError);
    expect(() =>
      normalizeInvestmentInput({
        ...input,
        annualInterestRate: '-2',
      }),
    ).toThrow(ValidationError);
  });

  it('validates rates and settings', () => {
    expect(normalizeRateInput({ currency: 'usd', rate: '16000' })).toEqual({
      currency: 'USD',
      rate: '16000',
    });
    expect(() => normalizeRateInput({ currency: 'IDR', rate: '1' })).toThrow(
      ValidationError,
    );
    expect(
      normalizeSettingsInput({ autoLockMinutes: '15', ratesAutoSync: true }),
    ).toEqual({ autoLockMinutes: 15, ratesAutoSync: true });
    expect(() =>
      normalizeSettingsInput({ autoLockMinutes: '7', ratesAutoSync: false }),
    ).toThrow(ValidationError);
  });
});

describe('category-specific investment fields', () => {
  const base = {
    name: 'Aset',
    category: 'Saham',
    principal: '1000000',
    cashback: '',
    annualInterestRate: '',
    tenorMonths: '12',
    lots: '0',
    currency: 'IDR',
  };

  it('keeps lots and current price for Saham only', () => {
    const saham = normalizeInvestmentInput({
      ...base,
      lots: '10',
      stockCurrentPrice: '1500',
    });
    expect(saham.lots).toBe(10);
    expect(saham.stockCurrentPrice).toBe('1500');
    expect(saham.tenorMonths).toBe(0);
    expect(saham.annualInterestRate).toBe('0');

    const deposito = normalizeInvestmentInput({
      ...base,
      category: 'Deposito',
      lots: '10',
      tenorMonths: '12',
      annualInterestRate: '6',
    });
    expect(deposito.lots).toBe(0);
    expect(deposito.tenorMonths).toBe(12);
    expect(deposito.annualInterestRate).toBe('6');
  });

  it('normalizes Reksa Dana NIB, NAB, and units', () => {
    const fund = normalizeInvestmentInput({
      ...base,
      category: 'Reksa Dana',
      nib: '1100000',
      nab: '1234.5678',
      units: '1000.25',
    });
    expect(fund.nib).toBe('1100000');
    expect(fund.nab).toBe('1234.5678');
    expect(fund.units).toBe('1000.25');
    expect(fund.lots).toBe(0);
    expect(fund.tenorMonths).toBe(0);

    expect(() =>
      normalizeInvestmentInput({
        ...base,
        category: 'Reksa Dana',
        nab: '1234',
      }),
    ).toThrow(ValidationError);
  });

  it('computes Emas value from price per gram × grams', () => {
    const gold = normalizeInvestmentInput({
      ...base,
      category: 'Emas',
      principal: '',
      goldBuyPricePerGram: '100000',
      goldGrams: '2.5',
      goldCurrentPricePerGram: '150000',
    });
    expect(gold.principal).toBe('250000');
    expect(gold.goldBuyPricePerGram).toBe('100000');
    expect(gold.goldGrams).toBe('2.5');
    expect(gold.goldCurrentPricePerGram).toBe('150000');
    expect(gold.lots).toBe(0);
    expect(() =>
      normalizeInvestmentInput({
        ...base,
        category: 'Emas',
        principal: '',
        goldBuyPricePerGram: '100000',
      }),
    ).toThrow(ValidationError);
  });

  it('does not keep tenor for P2P or a return rate for Emas', () => {
    const p2p = normalizeInvestmentInput({
      ...base,
      category: 'P2P Lending',
      tenorMonths: '24',
      annualInterestRate: '12',
    });
    expect(p2p.tenorMonths).toBe(0);
    expect(p2p.annualInterestRate).toBe('12');
    const gold = normalizeInvestmentInput({
      ...base,
      category: 'Emas',
      principal: '',
      goldBuyPricePerGram: '100000',
      goldGrams: '1',
      annualInterestRate: '12',
    });
    expect(gold.annualInterestRate).toBe('0');
  });
});

describe('dataset import validation', () => {
  it('accepts an empty dataset and a valid round-trip', () => {
    const dataset = emptyDataset(new Date('2026-11-07T00:00:00.000Z'));
    expect(assertDataset(dataset)).toEqual(dataset);
  });

  it('rejects duplicate IDs and dangling account references', () => {
    const base = emptyDataset(new Date('2026-11-07T00:00:00.000Z'));
    const account = {
      id: 'acc_1',
      name: 'BCA',
      type: 'bank' as const,
      currency: 'IDR',
      balance: '0',
      createdAt: '2026-11-07T00:00:00.000Z',
    };
    const transaction = {
      id: 'tx_1',
      accountId: 'acc_1',
      type: 'expense' as const,
      category: 'Makan',
      amount: '10',
      currency: 'IDR',
      date: '2026-11-07',
      createdAt: '2026-11-07T00:00:00.000Z',
    };
    const valid = {
      ...base,
      accounts: [account],
      transactions: [transaction],
    };
    expect(assertDataset(valid).transactions).toHaveLength(1);

    expect(() =>
      assertDataset({
        ...valid,
        accounts: [account, { ...account, name: 'Duplicate' }],
      }),
    ).toThrow(ValidationError);

    expect(() =>
      assertDataset({
        ...valid,
        transactions: [{ ...transaction, accountId: 'missing' }],
      }),
    ).toThrow(ValidationError);
  });

  it('rejects malformed schema and formulas are preserved as data', () => {
    expect(() => assertDataset({ schemaVersion: 1 })).toThrow(ValidationError);
    const dataset = emptyDataset(new Date('2026-11-07T00:00:00.000Z'));
    const formula = assertDataset({
      ...dataset,
      accounts: [
        {
          id: 'acc_1',
          name: '=HYPERLINK("http://example.com")',
          type: 'bank',
          currency: 'IDR',
          balance: '0',
          createdAt: '2026-11-07T00:00:00.000Z',
        },
      ],
    });
    expect(formula.accounts[0]?.name).toBe('=HYPERLINK("http://example.com")');
  });

  it('rejects datasets above the collection cap', () => {
    const dataset = emptyDataset(new Date('2026-11-07T00:00:00.000Z'));
    dataset.accounts = Array.from({ length: MAX_ACCOUNTS + 1 }, (_, index) => ({
      id: `acc_${index}`,
      name: `Account ${index}`,
      type: 'bank' as const,
      currency: 'IDR',
      balance: '0',
      createdAt: '2026-11-07T00:00:00.000Z',
    }));
    expect(() => assertDataset(dataset)).toThrow(ValidationError);
  });
});
