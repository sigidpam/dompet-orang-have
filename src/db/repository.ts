import { Decimal, amountToString, toDecimal, ValidationError } from '../domain/money';
import { newId } from '../domain/ids';
import type { RateFetchResult } from '../domain/rates';
import type {
  Account,
  Dataset,
  ExchangeRate,
  Investment,
  Settings,
  Transaction,
} from '../domain/types';
import { emptyDataset } from '../domain/types';
import {
  MAX_ACCOUNTS,
  MAX_INVESTMENTS,
  MAX_RATES,
  MAX_TRANSACTIONS,
  assertDataset,
  normalizeAccountInput,
  normalizeInvestmentInput,
  normalizeRateInput,
  normalizeSettingsInput,
  normalizeTransactionInput,
  type AccountFormInput,
  type InvestmentFormInput,
  type TransactionFormInput,
} from '../domain/validation';
import {
  decryptDataset,
  encryptDataset,
  type VaultSession,
} from '../crypto/vault';
import { vaultStore, type VaultStore } from './store';

function ensureCapacity(
  current: number,
  max: number,
  label: string,
): void {
  if (current >= max) {
    throw new ValidationError(
      `Batas ${label} tercapai (${max}). Hapus data lama terlebih dahulu.`,
      'form',
    );
  }
}

function investmentFromNormalized(
  id: string,
  createdAt: string,
  normalized: ReturnType<typeof normalizeInvestmentInput>,
): Investment {
  return {
    id,
    createdAt,
    name: normalized.name,
    category: normalized.category,
    principal: normalized.principal,
    cashback: normalized.cashback,
    annualInterestRate: normalized.annualInterestRate,
    tenorMonths: normalized.tenorMonths,
    lots: normalized.lots,
    currency: normalized.currency,
    ...(normalized.units ? { units: normalized.units } : {}),
    ...(normalized.nab ? { nab: normalized.nab } : {}),
    ...(normalized.nib ? { nib: normalized.nib } : {}),
    ...(normalized.stockCurrentPrice
      ? { stockCurrentPrice: normalized.stockCurrentPrice }
      : {}),
    ...(normalized.stockCode ? { stockCode: normalized.stockCode } : {}),
    ...(normalized.goldGrams ? { goldGrams: normalized.goldGrams } : {}),
    ...(normalized.goldBuyPricePerGram
      ? { goldBuyPricePerGram: normalized.goldBuyPricePerGram }
      : {}),
    ...(normalized.goldCurrentPricePerGram
      ? { goldCurrentPricePerGram: normalized.goldCurrentPricePerGram }
      : {}),
  };
}

export class Repository {
  private data: Dataset;

  private constructor(
    private readonly session: VaultSession,
    private readonly store: VaultStore,
    data: Dataset,
  ) {
    this.data = data;
  }

  static async open(
    session: VaultSession,
    store: VaultStore = vaultStore,
  ): Promise<Repository> {
    const payload = await store.load();
    let data: Dataset;
    if (payload) {
      data = await decryptDataset(session, payload, assertDataset);
    } else {
      data = emptyDataset();
      const encrypted = await encryptDataset(session, data);
      await store.save(encrypted);
    }
    return new Repository(session, store, data);
  }

  snapshot(): Dataset {
    return structuredClone(this.data);
  }

  private async persist(next: Dataset): Promise<void> {
    next.updatedAt = new Date().toISOString();
    const encrypted = await encryptDataset(this.session, next);
    await this.store.save(encrypted);
    this.data = next;
  }

  private async withWriteLock<T>(task: () => Promise<T>): Promise<T> {
    const locks =
      typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (locks?.request) {
      return locks.request(
        'dompet-orang-have-write',
        { mode: 'exclusive' },
        () => task(),
      );
    }
    return task();
  }

  private async loadLatest(): Promise<Dataset> {
    const payload = await this.store.load();
    if (!payload) return emptyDataset();
    return decryptDataset(this.session, payload, assertDataset);
  }

  private async mutate<T>(mutator: (draft: Dataset) => T): Promise<T> {
    // Reload inside an exclusive cross-tab lock so concurrent writes cannot
    // overwrite each other with a stale snapshot.
    return this.withWriteLock(async () => {
      const draft = structuredClone(await this.loadLatest());
      const result = mutator(draft);
      await this.persist(draft);
      return result;
    });
  }

  async addAccount(input: AccountFormInput): Promise<Account> {
    const normalized = normalizeAccountInput(input);
    const account: Account = {
      id: newId('acc'),
      ...normalized,
      createdAt: new Date().toISOString(),
    };
    await this.mutate((draft) => {
      ensureCapacity(draft.accounts.length, MAX_ACCOUNTS, 'rekening');
      draft.accounts.push(account);
    });
    return { ...account };
  }

  async deleteAccount(accountId: string): Promise<void> {
    await this.mutate((draft) => {
      const index = draft.accounts.findIndex(
        (account) => account.id === accountId,
      );
      if (index < 0) {
        throw new ValidationError('Rekening tidak ditemukan.', 'account');
      }
      const used = draft.transactions.some(
        (transaction) => transaction.accountId === accountId,
      );
      if (used) {
        throw new ValidationError(
          'Rekening masih memiliki transaksi. Hapus transaksinya terlebih dahulu.',
          'account',
        );
      }
      draft.accounts.splice(index, 1);
    });
  }

  async addTransaction(input: TransactionFormInput): Promise<Transaction> {
    const normalized = normalizeTransactionInput(input);
    const created = await this.mutate((draft) => {
      ensureCapacity(draft.transactions.length, MAX_TRANSACTIONS, 'transaksi');
      const account = draft.accounts.find(
        (candidate) => candidate.id === normalized.accountId,
      );
      if (!account) {
        throw new ValidationError('Rekening tidak ditemukan.', 'accountId');
      }
      const amount = toDecimal(normalized.amount);
      const balance = new Decimal(account.balance);
      account.balance = amountToString(
        normalized.type === 'income'
          ? balance.plus(amount)
          : balance.minus(amount),
      );
      const transaction: Transaction = {
        id: newId('tx'),
        accountId: account.id,
        type: normalized.type,
        category: normalized.category,
        amount: normalized.amount,
        currency: account.currency,
        date: normalized.date,
        createdAt: new Date().toISOString(),
      };
      draft.transactions.push(transaction);
      return transaction;
    });
    return { ...created };
  }

  async deleteTransaction(transactionId: string): Promise<void> {
    await this.mutate((draft) => {
      const index = draft.transactions.findIndex(
        (transaction) => transaction.id === transactionId,
      );
      if (index < 0) {
        throw new ValidationError('Transaksi tidak ditemukan.', 'transaction');
      }
      const transaction = draft.transactions[index];
      if (!transaction) {
        throw new ValidationError('Transaksi tidak ditemukan.', 'transaction');
      }
      const account = draft.accounts.find(
        (candidate) => candidate.id === transaction.accountId,
      );
      if (account) {
        const balance = new Decimal(account.balance);
        const amount = toDecimal(transaction.amount);
        account.balance = amountToString(
          transaction.type === 'income'
            ? balance.minus(amount)
            : balance.plus(amount),
        );
      }
      draft.transactions.splice(index, 1);
    });
  }

  async addInvestment(input: InvestmentFormInput): Promise<Investment> {
    const normalized = normalizeInvestmentInput(input);
    const investment = investmentFromNormalized(
      newId('inv'),
      new Date().toISOString(),
      normalized,
    );
    await this.mutate((draft) => {
      ensureCapacity(draft.investments.length, MAX_INVESTMENTS, 'investasi');
      draft.investments.push(investment);
    });
    return { ...investment };
  }

  async updateInvestment(
    investmentId: string,
    input: InvestmentFormInput,
  ): Promise<Investment> {
    const normalized = normalizeInvestmentInput(input);
    const updated = await this.mutate((draft) => {
      const index = draft.investments.findIndex(
        (investment) => investment.id === investmentId,
      );
      if (index < 0) {
        throw new ValidationError('Investasi tidak ditemukan.', 'investment');
      }
      const existing = draft.investments[index];
      if (!existing) {
        throw new ValidationError('Investasi tidak ditemukan.', 'investment');
      }
      const next = investmentFromNormalized(
        existing.id,
        existing.createdAt,
        normalized,
      );
      draft.investments.splice(index, 1, next);
      return next;
    });
    return { ...updated };
  }

  async deleteInvestment(investmentId: string): Promise<void> {
    await this.mutate((draft) => {
      const index = draft.investments.findIndex(
        (investment) => investment.id === investmentId,
      );
      if (index < 0) {
        throw new ValidationError('Investasi tidak ditemukan.', 'investment');
      }
      draft.investments.splice(index, 1);
    });
  }

  async upsertRate(input: { currency: string; rate: string }): Promise<ExchangeRate> {
    const normalized = normalizeRateInput(input);
    const rate: ExchangeRate = {
      currency: normalized.currency,
      rateToIdr: normalized.rate,
      updatedAt: new Date().toISOString(),
      source: 'manual',
    };
    await this.mutate((draft) => {
      const index = draft.rates.findIndex(
        (candidate) => candidate.currency === rate.currency,
      );
      if (index >= 0) {
        draft.rates.splice(index, 1, rate);
      } else {
        ensureCapacity(draft.rates.length, MAX_RATES, 'kurs');
        draft.rates.push(rate);
      }
    });
    return { ...rate };
  }

  async deleteRate(currency: string): Promise<void> {
    await this.mutate((draft) => {
      const code = currency.trim().toUpperCase();
      const index = draft.rates.findIndex(
        (candidate) => candidate.currency === code,
      );
      if (index < 0) {
        throw new ValidationError('Kurs tidak ditemukan.', 'rate');
      }
      draft.rates.splice(index, 1);
    });
  }

  async applyRates(result: RateFetchResult): Promise<number> {
    const updatedAt = `${result.date}T00:00:00.000Z`;
    let count = 0;
    await this.mutate((draft) => {
      for (const [currency, rateToIdr] of result.rates) {
        const nextRate: ExchangeRate = {
          currency,
          rateToIdr,
          updatedAt,
          source: 'frankfurter',
        };
        const index = draft.rates.findIndex(
          (candidate) => candidate.currency === currency,
        );
        if (index >= 0) {
          draft.rates.splice(index, 1, nextRate);
        } else {
          draft.rates.push(nextRate);
        }
        count += 1;
      }
    });
    return count;
  }

  async updateSettings(input: {
    autoLockMinutes: string;
    ratesAutoSync: boolean;
  }): Promise<Settings> {
    const settings = normalizeSettingsInput(input);
    await this.mutate((draft) => {
      // Preserve the encrypted integration key when changing UI settings.
      draft.settings = { ...draft.settings, ...settings };
    });
    return { ...this.data.settings };
  }

  async replaceDataset(input: unknown): Promise<Dataset> {
    const dataset = assertDataset(input);
    return this.withWriteLock(async () => {
      await this.persist(structuredClone(dataset));
      return structuredClone(dataset);
    });
  }

  exportDataset(): Dataset {
    return this.snapshot();
  }
}
