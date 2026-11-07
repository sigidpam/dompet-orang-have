import { describe, expect, it } from 'vitest';
import { Decimal } from '../src/domain/money';
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

  it('values Saham, Reksa Dana, and Emas with category-specific inputs', () => {
    const dataset = emptyDataset();
    dataset.accounts = [
      {
        id: 'cash',
        name: 'Bank',
        type: 'bank',
        currency: 'IDR',
        balance: '1000000',
        createdAt: '2026-11-07T00:00:00.000Z',
      },
    ];
    dataset.investments = [
      {
        id: 'saham',
        name: 'BBCA',
        category: 'Saham',
        principal: '1000000',
        cashback: '0',
        annualInterestRate: '0',
        tenorMonths: 0,
        lots: 10,
        currency: 'IDR',
        createdAt: '2026-11-07T00:00:00.000Z',
        stockCurrentPrice: '1500',
      },
      {
        id: 'fund',
        name: 'RD Pasar Uang',
        category: 'Reksa Dana',
        principal: '1000000',
        cashback: '0',
        annualInterestRate: '0',
        tenorMonths: 0,
        lots: 0,
        currency: 'IDR',
        createdAt: '2026-11-07T00:00:00.000Z',
        nib: '1100000',
        nab: '1100',
        units: '1000',
      },
      {
        id: 'gold',
        name: 'Emas Antam',
        category: 'Emas',
        principal: '1000000',
        cashback: '0',
        annualInterestRate: '0',
        tenorMonths: 0,
        lots: 0,
        currency: 'IDR',
        createdAt: '2026-11-07T00:00:00.000Z',
        goldGrams: '10',
        goldBuyPricePerGram: '100000',
        goldCurrentPricePerGram: '150000',
      },
    ];

    const summary = computeSummary(dataset, {
      goldPricePerGramIdr: '120000',
      now: new Date('2026-11-07T00:00:00.000Z'),
    });
    expect(summary.investments[0]?.currentValue.toString()).toBe('1500000');
    expect(summary.investments[0]?.valueSource).toBe('stock');
    expect(summary.investments[1]?.currentValue.toString()).toBe('1100000');
    expect(summary.investments[1]?.valueSource).toBe('nib');
    expect(summary.investments[2]?.currentValue.toString()).toBe('1500000');
    expect(summary.investments[2]?.valueSource).toBe('gold-override');
    expect(summary.portfolioCurrentIdr.toString()).toBe('4100000');
    expect(summary.portfolioCostIdr.toString()).toBe('3000000');
    expect(summary.netWorthIdr.toString()).toBe('5100000');
    expect(summary.unrealizedGainIdr.toString()).toBe('1100000');
    expect(summary.allocation.map((slice) => slice.category)).toEqual([
      'Saham',
      'Reksa Dana',
      'Emas',
    ]);
    expect(
      summary.allocation
        .reduce((total, slice) => total.plus(slice.pct), new Decimal(0))
        .toDecimalPlaces(6)
        .toString(),
    ).toBe('100');
  });

  it('uses units × NAB and the gold market price when overrides are absent', () => {
    const dataset = emptyDataset();
    dataset.investments = [
      {
        id: 'fund',
        name: 'RD',
        category: 'Reksa Dana',
        principal: '1000000',
        cashback: '0',
        annualInterestRate: '0',
        tenorMonths: 0,
        lots: 0,
        currency: 'IDR',
        createdAt: '2026-11-07T00:00:00.000Z',
        units: '1000',
        nab: '1200',
      },
      {
        id: 'gold',
        name: 'Emas',
        category: 'Emas',
        principal: '1000000',
        cashback: '0',
        annualInterestRate: '0',
        tenorMonths: 0,
        lots: 0,
        currency: 'IDR',
        createdAt: '2026-11-07T00:00:00.000Z',
        goldGrams: '10',
        goldBuyPricePerGram: '100000',
      },
    ];
    const summary = computeSummary(dataset, {
      goldPricePerGramIdr: '130000',
    });
    expect(summary.investments[0]?.currentValue.toString()).toBe('1200000');
    expect(summary.investments[0]?.valueSource).toBe('units');
    expect(summary.investments[1]?.currentValue.toString()).toBe('1300000');
    expect(summary.investments[1]?.valueSource).toBe('gold-market');
  });

  it('builds a six-month cashflow series and defaults to cost when prices are absent', () => {
    const dataset = emptyDataset();
    dataset.transactions = [
      {
        id: 'sep-in',
        accountId: 'a',
        type: 'income',
        category: 'Gaji',
        amount: '100',
        currency: 'IDR',
        date: '2026-09-10',
        createdAt: '2026-09-10T00:00:00.000Z',
      },
      {
        id: 'sep-out',
        accountId: 'a',
        type: 'expense',
        category: 'Makan',
        amount: '50',
        currency: 'IDR',
        date: '2026-09-11',
        createdAt: '2026-09-11T00:00:00.000Z',
      },
      {
        id: 'nov-in',
        accountId: 'a',
        type: 'income',
        category: 'Bonus',
        amount: '200',
        currency: 'IDR',
        date: '2026-11-01',
        createdAt: '2026-11-01T00:00:00.000Z',
      },
    ];
    dataset.investments = [
      {
        id: 'stock',
        name: 'Tanpa harga',
        category: 'Saham',
        principal: '500',
        cashback: '0',
        annualInterestRate: '0',
        tenorMonths: 0,
        lots: 2,
        currency: 'IDR',
        createdAt: '2026-11-07T00:00:00.000Z',
      },
    ];
    const summary = computeSummary(dataset, {
      now: new Date('2026-11-07T00:00:00.000Z'),
      cashflowMonths: 3,
    });
    expect(summary.monthlyCashflow.map((month) => month.key)).toEqual([
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
    expect(summary.monthlyCashflow[0]?.incomeIdr.toString()).toBe('100');
    expect(summary.monthlyCashflow[0]?.expenseIdr.toString()).toBe('50');
    expect(summary.monthlyCashflow[1]?.incomeIdr.toString()).toBe('0');
    expect(summary.monthlyCashflow[2]?.incomeIdr.toString()).toBe('200');
    expect(summary.investments[0]?.currentValue.toString()).toBe('500');
    expect(summary.investments[0]?.valueSource).toBe('cost');
  });
});
