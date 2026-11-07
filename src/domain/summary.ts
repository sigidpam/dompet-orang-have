import { Decimal, toDecimal } from './money';
import {
  FUND_CATEGORY,
  GOLD_CATEGORY,
  INVESTMENT_CATEGORIES,
  STOCK_CATEGORY,
  type Account,
  type Dataset,
  type ExchangeRate,
  type Investment,
  type InvestmentCategory,
} from './types';
import {
  accountGroupKey,
  investmentGroupKey,
  isDepletedInvestment,
} from './investments';

export interface AccountView extends Account {
  balanceIdr: Decimal | null;
}

export interface AccountGroupView {
  key: string;
  name: string;
  type: Account['type'];
  currency: string;
  balance: Decimal;
  balanceIdr: Decimal | null;
  members: AccountView[];
}

export type ValueSource =
  | 'cost'
  | 'stock'
  | 'nib'
  | 'units'
  | 'gold-override'
  | 'gold-market'
  | 'mixed';

export interface InvestmentView extends Investment {
  netPrincipal: Decimal;
  monthlyReturn: Decimal;
  currentValue: Decimal;
  currentValueIdr: Decimal | null;
  costIdr: Decimal | null;
  gainIdr: Decimal | null;
  gainPct: Decimal | null;
  valueSource: ValueSource;
  principalIdr: Decimal | null;
  cashbackIdr: Decimal | null;
  monthlyReturnIdr: Decimal | null;
}

export interface InvestmentGroupView {
  key: string;
  name: string;
  category: InvestmentCategory;
  stockCode?: string;
  currency: string;
  members: InvestmentView[];
  currentValue: Decimal;
  currentValueIdr: Decimal | null;
  cost: Decimal;
  costIdr: Decimal | null;
  gainIdr: Decimal | null;
  gainPct: Decimal | null;
  lots: number;
  units: Decimal;
  grams: Decimal;
  valueSource: ValueSource;
}

export interface AllocationSlice {
  category: string;
  valueIdr: Decimal;
  pct: Decimal;
}

export interface MonthlyCashflow {
  key: string;
  label: string;
  incomeIdr: Decimal;
  expenseIdr: Decimal;
}

export interface Summary {
  totalIncomeIdr: Decimal;
  totalExpenseIdr: Decimal;
  netCashflowIdr: Decimal;
  liquidCashIdr: Decimal;
  totalPrincipalIdr: Decimal;
  totalCashbackIdr: Decimal;
  portfolioCurrentIdr: Decimal;
  portfolioCostIdr: Decimal;
  netWorthIdr: Decimal;
  unrealizedGainIdr: Decimal;
  unrealizedGainPct: Decimal | null;
  estMonthlyReturnIdr: Decimal;
  accounts: AccountView[];
  accountGroups: AccountGroupView[];
  investments: InvestmentView[];
  investmentGroups: InvestmentGroupView[];
  allocation: AllocationSlice[];
  monthlyCashflow: MonthlyCashflow[];
  missingRates: string[];
}

export interface SummaryOptions {
  goldPricePerGramIdr?: Decimal.Value;
  now?: Date;
  cashflowMonths?: number;
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

function currentValueOf(
  investment: Investment,
  rates: Map<string, Decimal>,
  goldPricePerGramIdr: Decimal | null,
): { value: Decimal; source: ValueSource; missingRate: boolean } {
  const principal = toDecimal(investment.principal);
  const rate = rates.get(investment.currency) ?? null;

  if (investment.category === STOCK_CATEGORY) {
    const lots = investment.lots;
    const price = investment.stockCurrentPrice
      ? toDecimal(investment.stockCurrentPrice)
      : null;
    if (lots <= 0) {
      return { value: new Decimal(0), source: 'cost', missingRate: false };
    }
    if (price && price.gt(0)) {
      return {
        value: new Decimal(lots).times(100).times(price),
        source: 'stock',
        missingRate: false,
      };
    }
    return { value: principal, source: 'cost', missingRate: false };
  }

  if (investment.category === FUND_CATEGORY) {
    const nib = investment.nib ? toDecimal(investment.nib) : null;
    const units = investment.units ? toDecimal(investment.units) : null;
    const nab = investment.nab ? toDecimal(investment.nab) : null;
    if (nib && nib.gt(0)) {
      return { value: nib, source: 'nib', missingRate: false };
    }
    if (units && nab && units.gt(0) && nab.gt(0)) {
      return {
        value: units.times(nab),
        source: 'units',
        missingRate: false,
      };
    }
    if (units && units.lte(0)) {
      return { value: new Decimal(0), source: 'cost', missingRate: false };
    }
    return { value: principal, source: 'cost', missingRate: false };
  }

  if (investment.category === GOLD_CATEGORY) {
    const grams = investment.goldGrams
      ? toDecimal(investment.goldGrams)
      : null;
    if (grams && grams.lte(0)) {
      return { value: new Decimal(0), source: 'cost', missingRate: false };
    }
    if (grams && grams.gt(0)) {
      const override = investment.goldCurrentPricePerGram
        ? toDecimal(investment.goldCurrentPricePerGram)
        : null;
      if (override && override.gt(0)) {
        return {
          value: grams.times(override),
          source: 'gold-override',
          missingRate: false,
        };
      }
      if (goldPricePerGramIdr && goldPricePerGramIdr.gt(0)) {
        if (investment.currency === 'IDR') {
          return {
            value: grams.times(goldPricePerGramIdr),
            source: 'gold-market',
            missingRate: false,
          };
        }
        if (rate && rate.gt(0)) {
          return {
            value: grams.times(goldPricePerGramIdr.div(rate)),
            source: 'gold-market',
            missingRate: false,
          };
        }
        return { value: principal, source: 'cost', missingRate: true };
      }
    }
    return { value: principal, source: 'cost', missingRate: false };
  }

  return { value: principal, source: 'cost', missingRate: false };
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function recentMonths(now: Date, count: number): Array<{ key: string; label: string }> {
  const result: Array<{ key: string; label: string }> = [];
  const cursor = new Date(now.getFullYear(), now.getMonth(), 1);
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(cursor.getFullYear(), cursor.getMonth() - index, 1);
    result.push({
      key: monthKey(date),
      label: new Intl.DateTimeFormat('id-ID', {
        month: 'short',
        year: '2-digit',
      }).format(date),
    });
  }
  return result;
}

export function computeSummary(
  dataset: Dataset,
  options: SummaryOptions = {},
): Summary {
  const rates = rateMap(dataset.rates);
  const missing = new Set<string>();
  const goldPrice = options.goldPricePerGramIdr
    ? toDecimal(options.goldPricePerGramIdr)
    : null;
  let totalIncome = new Decimal(0);
  let totalExpense = new Decimal(0);
  let liquidCash = new Decimal(0);
  let totalPrincipal = new Decimal(0);
  let totalCashback = new Decimal(0);
  let estMonthlyReturn = new Decimal(0);

  for (const tx of dataset.transactions) {
    if (tx.type !== 'income' && tx.type !== 'expense') continue;
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

  const accountGroupsMap = new Map<string, AccountGroupView>();
  for (const account of accounts) {
    const key = accountGroupKey(account);
    const group = accountGroupsMap.get(key);
    if (!group) {
      accountGroupsMap.set(key, {
        key,
        name: account.name,
        type: account.type,
        currency: account.currency,
        balance: toDecimal(account.balance),
        balanceIdr: account.balanceIdr,
        members: [account],
      });
      continue;
    }
    group.balance = group.balance.plus(toDecimal(account.balance));
    group.balanceIdr =
      group.balanceIdr === null || account.balanceIdr === null
        ? null
        : group.balanceIdr.plus(account.balanceIdr);
    group.members.push(account);
  }
  const accountGroups = [...accountGroupsMap.values()];

  let portfolioCurrent = new Decimal(0);
  let portfolioCost = new Decimal(0);
  const categoryTotals = new Map<string, Decimal>();
  const investments: InvestmentView[] = dataset.investments.map((investment) => {
    const principal = toDecimal(investment.principal);
    const cashback = toDecimal(investment.cashback);
    const netPrincipal = principal.minus(cashback);
    const monthlyReturn = netPrincipal
      .times(toDecimal(investment.annualInterestRate))
      .div(100)
      .div(12);
    const value = currentValueOf(investment, rates, goldPrice);
    if (value.missingRate) missing.add(investment.currency);

    const principalIdr = convertToIdr(principal, investment.currency, rates);
    const cashbackIdr = convertToIdr(cashback, investment.currency, rates);
    const monthlyReturnIdr = convertToIdr(
      monthlyReturn,
      investment.currency,
      rates,
    );
    const currentValueIdr = convertToIdr(
      value.value,
      investment.currency,
      rates,
    );
    const costIdr = convertToIdr(netPrincipal, investment.currency, rates);

    if (principalIdr === null) missing.add(investment.currency);
    else totalPrincipal = totalPrincipal.plus(principalIdr);
    if (cashbackIdr === null) missing.add(investment.currency);
    else totalCashback = totalCashback.plus(cashbackIdr);
    if (monthlyReturnIdr === null) missing.add(investment.currency);
    else estMonthlyReturn = estMonthlyReturn.plus(monthlyReturnIdr);

    if (currentValueIdr === null || costIdr === null) {
      missing.add(investment.currency);
    } else {
      portfolioCurrent = portfolioCurrent.plus(currentValueIdr);
      portfolioCost = portfolioCost.plus(costIdr);
      const categoryTotal =
        categoryTotals.get(investment.category) ?? new Decimal(0);
      categoryTotals.set(
        investment.category,
        categoryTotal.plus(currentValueIdr),
      );
    }

    const gainIdr =
      currentValueIdr !== null && costIdr !== null
        ? currentValueIdr.minus(costIdr)
        : null;
    const gainPct =
      gainIdr !== null && costIdr !== null && costIdr.gt(0)
        ? gainIdr.div(costIdr).times(100)
        : null;

    return {
      ...investment,
      netPrincipal,
      monthlyReturn,
      currentValue: value.value,
      currentValueIdr,
      costIdr,
      gainIdr,
      gainPct,
      valueSource: value.source,
      principalIdr,
      cashbackIdr,
      monthlyReturnIdr,
    };
  });

  const investmentGroupsMap = new Map<string, InvestmentGroupView>();
  for (const investment of investments) {
    if (isDepletedInvestment(investment)) continue;
    const key = investmentGroupKey(investment);
    const category = investment.category as InvestmentCategory;
    let group = investmentGroupsMap.get(key);
    if (!group) {
      group = {
        key,
        name:
          category === STOCK_CATEGORY
            ? (investment.stockCode ?? investment.name)
            : investment.name,
        category,
        ...(investment.stockCode ? { stockCode: investment.stockCode } : {}),
        currency: investment.currency,
        members: [],
        currentValue: new Decimal(0),
        currentValueIdr: new Decimal(0),
        cost: new Decimal(0),
        costIdr: new Decimal(0),
        gainIdr: null,
        gainPct: null,
        lots: 0,
        units: new Decimal(0),
        grams: new Decimal(0),
        valueSource: investment.valueSource,
      };
      investmentGroupsMap.set(key, group);
    }
    group.members.push(investment);
    group.currentValue = group.currentValue.plus(investment.currentValue);
    group.currentValueIdr =
      group.currentValueIdr === null || investment.currentValueIdr === null
        ? null
        : group.currentValueIdr.plus(investment.currentValueIdr);
    group.cost = group.cost.plus(investment.netPrincipal);
    group.costIdr =
      group.costIdr === null || investment.costIdr === null
        ? null
        : group.costIdr.plus(investment.costIdr);
    group.lots += investment.lots;
    if (investment.units) {
      group.units = group.units.plus(toDecimal(investment.units));
    }
    if (investment.goldGrams) {
      group.grams = group.grams.plus(toDecimal(investment.goldGrams));
    }
    if (group.valueSource !== investment.valueSource) {
      group.valueSource = 'mixed';
    }
  }
  const investmentGroups: InvestmentGroupView[] = [
    ...investmentGroupsMap.values(),
  ].map((group) => {
    const gainIdr =
      group.currentValueIdr !== null && group.costIdr !== null
        ? group.currentValueIdr.minus(group.costIdr)
        : null;
    const gainPct =
      gainIdr !== null && group.costIdr !== null && group.costIdr.gt(0)
        ? gainIdr.div(group.costIdr).times(100)
        : null;
    return { ...group, gainIdr, gainPct };
  });

  const allocationTotal = [...categoryTotals.values()].reduce(
    (sum, value) => sum.plus(value),
    new Decimal(0),
  );
  const allocation: AllocationSlice[] = INVESTMENT_CATEGORIES.filter(
    (category) => categoryTotals.has(category),
  ).map((category) => {
    const valueIdr = categoryTotals.get(category) ?? new Decimal(0);
    return {
      category,
      valueIdr,
      pct: allocationTotal.gt(0)
        ? valueIdr.div(allocationTotal).times(100)
        : new Decimal(0),
    };
  });

  const months = recentMonths(options.now ?? new Date(), options.cashflowMonths ?? 6);
  const cashflowMap = new Map(
    months.map((month) => [
      month.key,
      { incomeIdr: new Decimal(0), expenseIdr: new Decimal(0) },
    ]),
  );
  for (const tx of dataset.transactions) {
    if (tx.type !== 'income' && tx.type !== 'expense') continue;
    const bucket = cashflowMap.get(tx.date.slice(0, 7));
    if (!bucket) continue;
    const converted = convertToIdr(tx.amount, tx.currency, rates);
    if (converted === null) {
      missing.add(tx.currency);
      continue;
    }
    if (tx.type === 'income') {
      bucket.incomeIdr = bucket.incomeIdr.plus(converted);
    } else {
      bucket.expenseIdr = bucket.expenseIdr.plus(converted);
    }
  }
  const monthlyCashflow: MonthlyCashflow[] = months.map((month) => {
    const bucket = cashflowMap.get(month.key);
    return {
      key: month.key,
      label: month.label,
      incomeIdr: bucket?.incomeIdr ?? new Decimal(0),
      expenseIdr: bucket?.expenseIdr ?? new Decimal(0),
    };
  });

  const unrealizedGain = portfolioCurrent.minus(portfolioCost);
  return {
    totalIncomeIdr: totalIncome,
    totalExpenseIdr: totalExpense,
    netCashflowIdr: totalIncome.minus(totalExpense),
    liquidCashIdr: liquidCash,
    totalPrincipalIdr: totalPrincipal,
    totalCashbackIdr: totalCashback,
    portfolioCurrentIdr: portfolioCurrent,
    portfolioCostIdr: portfolioCost,
    netWorthIdr: liquidCash.plus(portfolioCurrent),
    unrealizedGainIdr: unrealizedGain,
    unrealizedGainPct: portfolioCost.gt(0)
      ? unrealizedGain.div(portfolioCost).times(100)
      : null,
    estMonthlyReturnIdr: estMonthlyReturn,
    accounts,
    accountGroups,
    investments,
    investmentGroups,
    allocation,
    monthlyCashflow,
    missingRates: [...missing].sort(),
  };
}

export function accountName(
  accounts: Account[],
  accountId: string,
): string {
  return accounts.find((account) => account.id === accountId)?.name ?? 'Rekening dihapus';
}
