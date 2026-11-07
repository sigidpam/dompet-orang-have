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
    });
    expect(investment.stockCurrentPrice).toBe('1000');
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
    });
    expect(updated.lots).toBe(20);
    expect(updated.stockCurrentPrice).toBe('1500');

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
    expect(changed.lots).toBe(0);
    expect(changed.tenorMonths).toBe(12);
    expect(changed.annualInterestRate).toBe('6');
    expect(repo.snapshot().investments).toHaveLength(1);
    lockSession(session);
  });
});
