import { describe, expect, it } from 'vitest';
import {
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
});
