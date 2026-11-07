export const ACCOUNT_TYPES = ['bank', 'cash', 'e_wallet'] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const TRANSACTION_TYPES = ['income', 'expense'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const INVESTMENT_CATEGORIES = [
  'Deposito',
  'Saham',
  'Reksa Dana',
  'P2P Lending',
  'Crypto',
  'Emas',
  'Obligasi',
  'Lainnya',
] as const;

export type InvestmentCategory = (typeof INVESTMENT_CATEGORIES)[number];

export const TENOR_CATEGORIES: readonly InvestmentCategory[] = [
  'Deposito',
  'Obligasi',
];

export const RETURN_CATEGORIES: readonly InvestmentCategory[] = [
  'Deposito',
  'Obligasi',
  'P2P Lending',
];

export const STOCK_CATEGORY: InvestmentCategory = 'Saham';
export const FUND_CATEGORY: InvestmentCategory = 'Reksa Dana';
export const GOLD_CATEGORY: InvestmentCategory = 'Emas';

export const CURATED_CURRENCIES = [
  'IDR',
  'USD',
  'EUR',
  'SGD',
  'MYR',
  'JPY',
  'GBP',
  'AUD',
  'CNY',
  'HKD',
] as const;

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  balance: string;
  createdAt: string;
}

export interface Transaction {
  id: string;
  accountId: string;
  type: TransactionType;
  category: string;
  amount: string;
  currency: string;
  date: string;
  createdAt: string;
}

export interface Investment {
  id: string;
  name: string;
  category: string;
  principal: string;
  cashback: string;
  annualInterestRate: string;
  tenorMonths: number;
  lots: number;
  currency: string;
  createdAt: string;
  /** Reksa Dana: units held. */
  units?: string;
  /** Reksa Dana: NAB / NAV per unit. */
  nab?: string;
  /** Reksa Dana: NIB — net investment value in rupiah. */
  nib?: string;
  /** Saham: current price per share in the investment currency. */
  stockCurrentPrice?: string;
  /** Emas: grams held. */
  goldGrams?: string;
  /** Emas: purchase price per gram. */
  goldBuyPricePerGram?: string;
  /** Emas: manual current price per gram; overrides the market feed. */
  goldCurrentPricePerGram?: string;
}

export type RateSource = 'manual' | 'frankfurter';

export interface ExchangeRate {
  currency: string;
  rateToIdr: string;
  updatedAt: string;
  source: RateSource;
}

export interface Settings {
  autoLockMinutes: number;
  ratesAutoSync: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  autoLockMinutes: 5,
  ratesAutoSync: false,
};

export interface Dataset {
  schemaVersion: 2;
  accounts: Account[];
  transactions: Transaction[];
  investments: Investment[];
  rates: ExchangeRate[];
  settings: Settings;
  updatedAt: string;
}

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  bank: 'Bank',
  cash: 'Tunai',
  e_wallet: 'E-Wallet',
};

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  income: 'Pemasukan',
  expense: 'Pengeluaran',
};

export function emptyDataset(now = new Date()): Dataset {
  return {
    schemaVersion: 2,
    accounts: [],
    transactions: [],
    investments: [],
    rates: [],
    settings: { ...DEFAULT_SETTINGS },
    updatedAt: now.toISOString(),
  };
}

const fallbackCurrencies = new Set<string>(CURATED_CURRENCIES);

let cachedCurrencies: string[] | null = null;

export function supportedCurrencies(): string[] {
  if (cachedCurrencies) return cachedCurrencies;
  try {
    const values =
      typeof Intl.supportedValuesOf === 'function'
        ? Intl.supportedValuesOf('currency')
        : [];
    cachedCurrencies =
      values.length > 0 ? [...new Set([...CURATED_CURRENCIES, ...values])].sort() : [...fallbackCurrencies].sort();
  } catch {
    cachedCurrencies = [...fallbackCurrencies].sort();
  }
  return cachedCurrencies;
}

export function isSupportedCurrency(code: string): boolean {
  return supportedCurrencies().includes(code);
}

export function currencyOptions(current?: string): string[] {
  const options = supportedCurrencies();
  if (current && !options.includes(current)) {
    return [current, ...options];
  }
  return options;
}
