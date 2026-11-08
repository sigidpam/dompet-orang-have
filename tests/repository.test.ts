import { beforeEach, describe, expect, it } from 'vitest';
import { createVault, clearVault, lockSession, type VaultSession } from '../src/crypto/vault';
import { Repository } from '../src/db/repository';
import { createVaultStore, type VaultStore } from '../src/db/store';
import { computeSummary } from '../src/domain/summary';
import { ValidationError } from '../src/domain/money';

async function fresh(): Promise<{
  session: VaultSession;
  store: VaultStore;
  repo: Repository;
}> {
  const session = await createVault('123456', { iterations: 1_000 });
  const store = createVaultStore(`test-${crypto.randomUUID()}`);
  const repo = await Repository.open(session, store);
  return { session, store, repo };
}

describe('repository', () => {
  beforeEach(() => {
    clearVault();
  });

  it('stores accounts, updates balances, and reverses deleted transactions', async () => {
    const { session, repo } = await fresh();
    const account = await repo.addAccount({
      name: '  BCA  ',
      type: 'bank',
      currency: 'idr',
      balance: '1000',
    });
    expect(account.name).toBe('BCA');
    expect(account.currency).toBe('IDR');

    const expense = await repo.addTransaction({
      accountId: account.id,
      type: 'expense',
      category: 'Makan',
      amount: '250',
      date: '2026-11-07',
    });
    expect(repo.snapshot().accounts[0]?.balance).toBe('750');
    expect(repo.snapshot().transactions[0]?.currency).toBe('IDR');

    await repo.addTransaction({
      accountId: account.id,
      type: 'income',
      category: 'Gaji',
      amount: '100',
      date: '2026-11-07',
    });
    expect(repo.snapshot().accounts[0]?.balance).toBe('850');

    const summary = computeSummary(repo.snapshot());
    expect(summary.totalIncomeIdr.toString()).toBe('100');
    expect(summary.totalExpenseIdr.toString()).toBe('250');
    expect(summary.netCashflowIdr.toString()).toBe('-150');
    expect(summary.liquidCashIdr.toString()).toBe('850');

    await repo.deleteTransaction(expense.id);
    expect(repo.snapshot().accounts[0]?.balance).toBe('1100');
    expect(repo.snapshot().transactions).toHaveLength(1);

    await expect(repo.deleteAccount(account.id)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await repo.deleteTransaction(repo.snapshot().transactions[0]?.id ?? '');
    await repo.deleteAccount(account.id);
    expect(repo.snapshot().accounts).toHaveLength(0);
    lockSession(session);
  });

  it('persists encrypted data across repository instances', async () => {
    const { session, store, repo } = await fresh();
    await repo.addAccount({
      name: 'Dompet',
      type: 'cash',
      currency: 'IDR',
      balance: '50',
    });
    const reopened = await Repository.open(session, store);
    expect(reopened.snapshot().accounts).toHaveLength(1);
    expect(reopened.snapshot().accounts[0]?.name).toBe('Dompet');

    const raw = await store.load();
    expect(raw).not.toBeNull();
    const serialized = JSON.stringify(raw);
    expect(serialized).not.toContain('Dompet');
    expect(serialized).not.toContain('"accounts"');
    lockSession(session);
  });

  it('calculates investment returns and FX conversion', async () => {
    const { session, repo } = await fresh();
    await repo.upsertRate({ currency: 'USD', rate: '16000' });
    await repo.addInvestment({
      name: 'SBN',
      category: 'Obligasi',
      principal: '1000',
      cashback: '100',
      annualInterestRate: '12',
      tenorMonths: '24',
      lots: '10',
      currency: 'USD',
    });
    const summary = computeSummary(repo.snapshot());
    expect(summary.totalPrincipalIdr.toString()).toBe('16000000');
    expect(summary.totalCashbackIdr.toString()).toBe('1600000');
    expect(summary.estMonthlyReturnIdr.toString()).toBe('144000');
    expect(summary.investments[0]?.netPrincipal.toString()).toBe('900');
    expect(summary.investments[0]?.monthlyReturn.toString()).toBe('9');
    lockSession(session);
  });

  it('flags missing exchange rates instead of silently using 1.0', async () => {
    const { session, repo } = await fresh();
    await repo.addAccount({
      name: 'USD account',
      type: 'bank',
      currency: 'USD',
      balance: '100',
    });
    const summary = computeSummary(repo.snapshot());
    expect(summary.missingRates).toEqual(['USD']);
    expect(summary.liquidCashIdr.toString()).toBe('0');
    expect(summary.accounts[0]?.balanceIdr).toBeNull();

    await repo.upsertRate({ currency: 'USD', rate: '16000' });
    const converted = computeSummary(repo.snapshot());
    expect(converted.missingRates).toEqual([]);
    expect(converted.liquidCashIdr.toString()).toBe('1600000');
    lockSession(session);
  });

  it('applies fetched rates and settings, and rejects invalid inputs', async () => {
    const { session, repo } = await fresh();
    const count = await repo.applyRates({
      date: '2026-11-06',
      rates: new Map([
        ['USD', '16000'],
        ['SGD', '12000'],
      ]),
    });
    expect(count).toBe(2);
    expect(repo.snapshot().rates).toHaveLength(2);
    expect(repo.snapshot().rates[0]?.source).toBe('frankfurter');

    await repo.updateSettings({ autoLockMinutes: '15', ratesAutoSync: true });
    expect(repo.snapshot().settings).toEqual({
      autoLockMinutes: 15,
      ratesAutoSync: true,
    });

    await expect(
      repo.upsertRate({ currency: 'IDR', rate: '1' }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      repo.addInvestment({
        name: 'Bad',
        category: 'Saham',
        principal: '100',
        cashback: '200',
        annualInterestRate: '10',
        tenorMonths: '12',
        lots: '1',
        currency: 'IDR',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      repo.addTransaction({
        accountId: 'missing',
        type: 'expense',
        category: 'X',
        amount: '1',
        date: '2026-11-07',
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    lockSession(session);
  });

  it('keeps decimal precision for balances', async () => {
    const { session, repo } = await fresh();
    const account = await repo.addAccount({
      name: 'Presisi',
      type: 'bank',
      currency: 'USD',
      balance: '0.10',
    });
    await repo.addTransaction({
      accountId: account.id,
      type: 'income',
      category: 'Bunga',
      amount: '0.20',
      date: '2026-11-07',
    });
    expect(repo.snapshot().accounts[0]?.balance).toBe('0.3');
    lockSession(session);
  });

  it('does not lose writes made through another repository instance', async () => {
    const session = await createVault('123456', { iterations: 1_000 });
    const store = createVaultStore(`test-${crypto.randomUUID()}`);
    const repoA = await Repository.open(session, store);
    const repoB = await Repository.open(session, store);
    const account = await repoA.addAccount({
      name: 'Shared',
      type: 'bank',
      currency: 'IDR',
      balance: '1000',
    });
    // repoB still holds the pre-account snapshot; the write must reload first.
    await repoB.addTransaction({
      accountId: account.id,
      type: 'expense',
      category: 'Makan',
      amount: '100',
      date: '2026-11-07',
    });
    const verify = await Repository.open(session, store);
    expect(verify.snapshot().accounts).toHaveLength(1);
    expect(verify.snapshot().transactions).toHaveLength(1);
    expect(verify.snapshot().accounts[0]?.balance).toBe('900');
    lockSession(session);
  });

  it('updates investment prices and clears stale category fields', async () => {
    const { session, repo } = await fresh();
    const investment = await repo.addInvestment({
      name: 'BBCA',
      category: 'Saham',
      principal: '1000000',
      cashback: '',
      annualInterestRate: '',
      tenorMonths: '12',
      lots: '10',
      currency: 'IDR',
      stockCurrentPrice: '1000',
      stockCode: 'BBCA',
    });
    expect(investment.stockCurrentPrice).toBe('1000');
    expect(investment.stockCode).toBe('BBCA');
    const updated = await repo.updateInvestment(investment.id, {
      name: 'BBCA',
      category: 'Saham',
      principal: '1000000',
      cashback: '',
      annualInterestRate: '',
      tenorMonths: '12',
      lots: '20',
      currency: 'IDR',
      stockCurrentPrice: '1500',
      stockCode: 'BBCA',
    });
    expect(updated.lots).toBe(20);
    expect(updated.stockCurrentPrice).toBe('1500');
    expect(updated.stockCode).toBe('BBCA');

    const changed = await repo.updateInvestment(investment.id, {
      name: 'Deposito',
      category: 'Deposito',
      principal: '1000000',
      cashback: '',
      annualInterestRate: '6',
      tenorMonths: '12',
      lots: '0',
      currency: 'IDR',
    });
    expect(changed.stockCurrentPrice).toBeUndefined();
    expect(changed.stockCode).toBeUndefined();
    expect(changed.lots).toBe(0);
    expect(changed.tenorMonths).toBe(12);
    expect(changed.annualInterestRate).toBe('6');
    expect(repo.snapshot().investments).toHaveLength(1);
    lockSession(session);
  });

  it('records buy/sell trades and aggregates same-code holdings', async () => {
    const { session, repo } = await fresh();
    const account = await repo.addAccount({
      name: 'Trading',
      type: 'bank',
      currency: 'IDR',
      balance: '10000000',
    });

    await repo.addTrade({
      accountId: account.id,
      type: 'buy',
      category: '',
      amount: '',
      date: '2026-11-07',
      investmentCategory: 'Saham',
      investmentName: 'BBCA',
      stockCode: 'BBCA',
      quantity: '10',
      unitPrice: '1000',
    });
    expect(repo.snapshot().accounts[0]?.balance).toBe('9000000');
    expect(repo.snapshot().investments).toHaveLength(1);
    expect(repo.snapshot().investments[0]?.lots).toBe(10);

    await repo.addTrade({
      accountId: account.id,
      type: 'buy',
      category: '',
      amount: '',
      date: '2026-11-07',
      investmentCategory: 'Saham',
      investmentName: 'BBCA',
      stockCode: 'BBCA',
      quantity: '5',
      unitPrice: '1200',
    });
    expect(repo.snapshot().accounts[0]?.balance).toBe('8400000');
    expect(repo.snapshot().investments).toHaveLength(2);

    const afterBuys = computeSummary(repo.snapshot());
    expect(afterBuys.investmentGroups).toHaveLength(1);
    expect(afterBuys.investmentGroups[0]?.lots).toBe(15);
    expect(afterBuys.investmentGroups[0]?.currentValue.toString()).toBe(
      '1800000',
    );
    expect(afterBuys.investmentGroups[0]?.members).toHaveLength(2);

    const first = repo.snapshot().investments[0];
    const sell = await repo.addTrade({
      accountId: account.id,
      type: 'sell',
      category: '',
      amount: '',
      date: '2026-11-07',
      investmentCategory: 'Saham',
      investmentId: first?.id,
      quantity: '5',
      unitPrice: '1300',
    });
    expect(repo.snapshot().accounts[0]?.balance).toBe('9050000');
    expect(repo.snapshot().investments[0]?.lots).toBe(5);
    expect(repo.snapshot().investments[0]?.principal).toBe('500000');

    const afterSell = computeSummary(repo.snapshot());
    expect(afterSell.investmentGroups[0]?.lots).toBe(10);
    expect(afterSell.investmentGroups[0]?.currentValue.toString()).toBe(
      '1300000',
    );
    expect(afterSell.investmentGroups[0]?.cost.toString()).toBe('1100000');
    await expect(repo.deleteTransaction(sell.id)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(repo.deleteInvestment(first?.id ?? '')).rejects.toBeInstanceOf(
      ValidationError,
    );
    lockSession(session);
  });

  it('supports fixed-income withdrawals and groups same-name accounts', async () => {
    const { session, repo } = await fresh();
    const first = await repo.addAccount({
      name: 'Superbank',
      type: 'bank',
      currency: 'IDR',
      balance: '5000000',
    });
    await repo.addAccount({
      name: 'Superbank',
      type: 'bank',
      currency: 'IDR',
      balance: '2500000',
    });
    const grouped = computeSummary(repo.snapshot());
    expect(grouped.accountGroups).toHaveLength(1);
    expect(grouped.accountGroups[0]?.balance.toString()).toBe('7500000');

    await repo.addTrade({
      accountId: first.id,
      type: 'buy',
      category: '',
      amount: '1000000',
      date: '2026-11-07',
      investmentCategory: 'Deposito',
      investmentName: 'Deposito BCA',
    });
    expect(repo.snapshot().accounts[0]?.balance).toBe('4000000');
    const deposit = repo.snapshot().investments[0];
    expect(deposit?.principal).toBe('1000000');

    await repo.addTrade({
      accountId: first.id,
      type: 'sell',
      category: '',
      amount: '400000',
      date: '2026-11-07',
      investmentCategory: 'Deposito',
      investmentId: deposit?.id,
    });
    expect(repo.snapshot().accounts[0]?.balance).toBe('4400000');
    expect(repo.snapshot().investments[0]?.principal).toBe('600000');
    const summary = computeSummary(repo.snapshot());
    expect(summary.investmentGroups[0]?.currentValue.toString()).toBe('600000');
    expect(summary.totalIncomeIdr.toString()).toBe('0');
    expect(summary.totalExpenseIdr.toString()).toBe('0');
    lockSession(session);
  });



  it('creates Reksa Dana and Emas holdings from buy/sell trades', async () => {
    const { session, repo } = await fresh();
    const account = await repo.addAccount({
      name: 'Trading',
      type: 'bank',
      currency: 'IDR',
      balance: '10000000',
    });

    await repo.addTrade({
      accountId: account.id,
      type: 'buy',
      category: '',
      amount: '',
      date: '2026-11-07',
      investmentCategory: 'Reksa Dana',
      investmentName: 'RD Pasar Uang',
      quantity: '1000',
      unitPrice: '1200',
    });
    await repo.addTrade({
      accountId: account.id,
      type: 'buy',
      category: '',
      amount: '',
      date: '2026-11-07',
      investmentCategory: 'Emas',
      investmentName: 'Emas ANTAM',
      quantity: '10',
      unitPrice: '100000',
    });
    expect(repo.snapshot().accounts[0]?.balance).toBe('7800000');
    const summary = computeSummary(repo.snapshot(), {
      goldPricePerGramIdr: '150000',
    });
    const fund = summary.investmentGroups.find(
      (group) => group.category === 'Reksa Dana',
    );
    const gold = summary.investmentGroups.find(
      (group) => group.category === 'Emas',
    );
    expect(fund?.units.toString()).toBe('1000');
    expect(fund?.currentValue.toString()).toBe('1200000');
    expect(gold?.grams.toString()).toBe('10');
    expect(gold?.currentValue.toString()).toBe('1500000');

    const fundRecord = repo.snapshot().investments[0];
    await repo.addTrade({
      accountId: account.id,
      type: 'sell',
      category: '',
      amount: '',
      date: '2026-11-07',
      investmentCategory: 'Reksa Dana',
      investmentId: fundRecord?.id,
      quantity: '500',
      unitPrice: '1300',
    });
    expect(repo.snapshot().accounts[0]?.balance).toBe('8450000');
    expect(repo.snapshot().investments[0]?.units).toBe('500');
    expect(repo.snapshot().investments[0]?.principal).toBe('600000');
    lockSession(session);
  });


});
