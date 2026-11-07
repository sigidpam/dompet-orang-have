import { Decimal, toDecimal } from './money';
import type {
  Account,
  Dataset,
  ExchangeRate,
  Investment,
} from './types';

export interface AccountView extends Account {
  balanceIdr: Decimal | null;
}

export interface InvestmentView extends Investment {
  netPrincipal: Decimal;
  monthlyReturn: Decimal;
  principalIdr: Decimal | null;
  cashbackIdr: Decimal | null;
  monthlyReturnIdr: Decimal | null;
}

export interface Summary {
  totalIncomeIdr: Decimal;
  totalExpenseIdr: Decimal;
  netCashflowIdr: Decimal;
  liquidCashIdr: Decimal;
  totalPrincipalIdr: Decimal;
  totalCashbackIdr: Decimal;
  estMonthlyReturnIdr: Decimal;
  accounts: AccountView[];
  investments: InvestmentView[];
  missingRates: string[];
}

export function rateMap(rates: ExchangeRate[]): Map<string, Decimal> {
  const map = new Map<string, Decimal>();
  map.set('IDR', new Decimal(1));
  for (const rate of rates) {
    const value = toDecimal(rate.rateToIdr);
    if (value.gt(0)) {
      map.set(rate.currency, value);
    }
  }
  return map;
}

export function convertToIdr(
  amount: Decimal.Value,
  currency: string,
  rates: Map<string, Decimal>,
): Decimal | null {
  if (currency === 'IDR') return toDecimal(amount);
  const rate = rates.get(currency);
  if (!rate) return null;
  return toDecimal(amount).times(rate);
}

export function computeSummary(dataset: Dataset): Summary {
  const rates = rateMap(dataset.rates);
  const missing = new Set<string>();
  let totalIncome = new Decimal(0);
  let totalExpense = new Decimal(0);
  let liquidCash = new Decimal(0);
  let totalPrincipal = new Decimal(0);
  let totalCashback = new Decimal(0);
  let estMonthlyReturn = new Decimal(0);

  for (const tx of dataset.transactions) {
    const converted = convertToIdr(tx.amount, tx.currency, rates);
    if (converted === null) {
      missing.add(tx.currency);
      continue;
    }
    if (tx.type === 'income') {
      totalIncome = totalIncome.plus(converted);
    } else {
      totalExpense = totalExpense.plus(converted);
    }
  }

  const accounts: AccountView[] = dataset.accounts.map((account) => {
    const balanceIdr = convertToIdr(account.balance, account.currency, rates);
    if (balanceIdr === null) {
      missing.add(account.currency);
    } else if (
      account.type === 'bank' ||
      account.type === 'cash' ||
      account.type === 'e_wallet'
    ) {
      liquidCash = liquidCash.plus(balanceIdr);
    }
    return { ...account, balanceIdr };
  });

  const investments: InvestmentView[] = dataset.investments.map((investment) => {
    const principal = toDecimal(investment.principal);
    const cashback = toDecimal(investment.cashback);
    const netPrincipal = principal.minus(cashback);
    const monthlyReturn = netPrincipal
      .times(toDecimal(investment.annualInterestRate))
      .div(100)
      .div(12);
    const principalIdr = convertToIdr(principal, investment.currency, rates);
    const cashbackIdr = convertToIdr(cashback, investment.currency, rates);
    const monthlyReturnIdr = convertToIdr(
      monthlyReturn,
      investment.currency,
      rates,
    );

    if (principalIdr === null) {
      missing.add(investment.currency);
    } else {
      totalPrincipal = totalPrincipal.plus(principalIdr);
    }
    if (cashbackIdr === null) {
      missing.add(investment.currency);
    } else {
      totalCashback = totalCashback.plus(cashbackIdr);
    }
    if (monthlyReturnIdr === null) {
      missing.add(investment.currency);
    } else {
      estMonthlyReturn = estMonthlyReturn.plus(monthlyReturnIdr);
    }

    return {
      ...investment,
      netPrincipal,
      monthlyReturn,
      principalIdr,
      cashbackIdr,
      monthlyReturnIdr,
    };
  });

  return {
    totalIncomeIdr: totalIncome,
    totalExpenseIdr: totalExpense,
    netCashflowIdr: totalIncome.minus(totalExpense),
    liquidCashIdr: liquidCash,
    totalPrincipalIdr: totalPrincipal,
    totalCashbackIdr: totalCashback,
    estMonthlyReturnIdr: estMonthlyReturn,
    accounts,
    investments,
    missingRates: [...missing].sort(),
  };
}

export function accountName(
  accounts: Account[],
  accountId: string,
): string {
  return accounts.find((account) => account.id === accountId)?.name ?? 'Rekening dihapus';
}
