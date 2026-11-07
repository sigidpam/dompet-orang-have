import { describe, expect, it } from 'vitest';
import {
  accountName,
  computeSummary,
  convertToIdr,
  rateMap,
} from '../src/domain/summary';
import { emptyDataset } from '../src/domain/types';

describe('summary calculations', () => {
  it('converts income, expenses, accounts, and investments to IDR', () => {
    const dataset = emptyDataset(new Date('2026-11-07T00:00:00.000Z'));
    dataset.rates = [
      {
        currency: 'USD',
        rateToIdr: '16000',
        source: 'manual',
        updatedAt: '2026-11-07T00:00:00.000Z',
      },
    ];
    dataset.accounts = [
      {
        id: 'acc_idr',
        name: 'IDR Bank',
        type: 'bank',
        currency: 'IDR',
        balance: '1000',
        createdAt: '2026-11-07T00:00:00.000Z',
      },
      {
        id: 'acc_usd',
        name: 'USD Bank',
        type: 'bank',
        currency: 'USD',
        balance: '10',
        createdAt: '2026-11-07T00:00:00.000Z',
      },
    ];
    dataset.transactions = [
      {
        id: 'tx_in',
        accountId: 'acc_usd',
        type: 'income',
        category: 'Gaji',
        amount: '100',
        currency: 'USD',
        date: '2026-11-07',
        createdAt: '2026-11-07T00:00:00.000Z',
      },
      {
        id: 'tx_out',
        accountId: 'acc_idr',
        type: 'expense',
        category: 'Makan',
        amount: '250',
        currency: 'IDR',
        date: '2026-11-07',
        createdAt: '2026-11-07T00:00:00.000Z',
      },
    ];
    dataset.investments = [
      {
        id: 'inv_1',
        name: 'SBN',
        category: 'Obligasi',
        principal: '100',
        cashback: '0',
        annualInterestRate: '12',
        tenorMonths: 24,
        lots: 10,
        currency: 'USD',
        createdAt: '2026-11-07T00:00:00.000Z',
      },
    ];

    const summary = computeSummary(dataset);
    expect(summary.totalIncomeIdr.toString()).toBe('1600000');
    expect(summary.totalExpenseIdr.toString()).toBe('250');
    expect(summary.netCashflowIdr.toString()).toBe('1599750');
    expect(summary.liquidCashIdr.toString()).toBe('161000');
    expect(summary.totalPrincipalIdr.toString()).toBe('1600000');
    expect(summary.estMonthlyReturnIdr.toString()).toBe('16000');
    expect(summary.missingRates).toEqual([]);
    expect(summary.investments[0]?.monthlyReturn.toString()).toBe('1');
  });

  it('does not treat a missing rate as 1.0', () => {
    const dataset = emptyDataset();
    dataset.accounts = [
      {
        id: 'a',
        name: 'Euro',
        type: 'cash',
        currency: 'EUR',
        balance: '5',
        createdAt: '2026-11-07T00:00:00.000Z',
      },
    ];
    const summary = computeSummary(dataset);
    expect(summary.missingRates).toEqual(['EUR']);
    expect(summary.liquidCashIdr.toString()).toBe('0');
  });

  it('exposes rate helpers and account names', () => {
    const rates = rateMap([
      {
        currency: 'USD',
        rateToIdr: '16000',
        source: 'manual',
        updatedAt: '2026-11-07T00:00:00.000Z',
      },
      {
        currency: 'BAD',
        rateToIdr: '0',
        source: 'manual',
        updatedAt: '2026-11-07T00:00:00.000Z',
      },
    ]);
    expect(convertToIdr('2', 'IDR', rates)?.toString()).toBe('2');
    expect(convertToIdr('2', 'USD', rates)?.toString()).toBe('32000');
    expect(convertToIdr('2', 'BAD', rates)).toBeNull();
    expect(accountName([], 'missing')).toBe('Rekening dihapus');
  });
});
