import { Decimal, toDecimal } from './money';
import {
  FUND_CATEGORY,
  GOLD_CATEGORY,
  STOCK_CATEGORY,
  type Account,
  type Investment,
} from './types';

/** Categories whose dashboard value follows a market or reference price. */
export const MARKET_PRICED_CATEGORIES = [
  STOCK_CATEGORY,
  FUND_CATEGORY,
  GOLD_CATEGORY,
] as const;

export function isMarketPricedCategory(category: string): boolean {
  return (
    category === STOCK_CATEGORY ||
    category === FUND_CATEGORY ||
    category === GOLD_CATEGORY
  );
}

/** Shares are quoted per share, but holdings are entered in lots of 100. */
export function investmentMultiplier(category: string): number {
  return category === STOCK_CATEGORY ? 100 : 1;
}

export function investmentQuantity(investment: Investment): Decimal {
  if (investment.category === STOCK_CATEGORY) {
    return new Decimal(investment.lots);
  }
  if (investment.category === FUND_CATEGORY) {
    return investment.units ? toDecimal(investment.units) : new Decimal(0);
  }
  if (investment.category === GOLD_CATEGORY) {
    return investment.goldGrams ? toDecimal(investment.goldGrams) : new Decimal(0);
  }
  return new Decimal(0);
}

export function investmentQuantityLabel(category: string): string {
  if (category === STOCK_CATEGORY) return 'Lot';
  if (category === FUND_CATEGORY) return 'Unit';
  if (category === GOLD_CATEGORY) return 'Gram';
  return 'Unit';
}

export function investmentQuantityPlaces(category: string): number {
  if (category === STOCK_CATEGORY) return 0;
  if (category === FUND_CATEGORY) return 6;
  if (category === GOLD_CATEGORY) return 4;
  return 0;
}

/** Price per lot/unit/gram stored on the investment, when available. */
export function investmentUnitPrice(investment: Investment): Decimal | null {
  if (investment.category === STOCK_CATEGORY) {
    return investment.stockCurrentPrice
      ? toDecimal(investment.stockCurrentPrice)
      : null;
  }
  if (investment.category === FUND_CATEGORY) {
    return investment.nab ? toDecimal(investment.nab) : null;
  }
  if (investment.category === GOLD_CATEGORY) {
    return investment.goldCurrentPricePerGram
      ? toDecimal(investment.goldCurrentPricePerGram)
      : null;
  }
  return null;
}

export function investmentLabel(investment: Investment): string {
  if (investment.category === STOCK_CATEGORY && investment.stockCode) {
    return investment.stockCode;
  }
  return investment.name;
}

/**
 * Market-priced holdings with the same stock code, fund name, or gold name
 * share a dashboard card. Fixed-income records stay independent.
 */
export function investmentGroupKey(investment: Investment): string {
  if (!isMarketPricedCategory(investment.category)) {
    return `${investment.category}|id:${investment.id}`;
  }
  const base =
    investment.category === STOCK_CATEGORY
      ? (investment.stockCode ?? investment.name)
      : investment.name;
  return `${investment.category}|${base.trim().toLowerCase()}|${investment.currency}`;
}

export function accountGroupKey(account: Account): string {
  return `${account.name.trim().toLowerCase()}|${account.type}|${account.currency}`;
}

/** A sold-out market holding or fully withdrawn fixed holding is hidden. */
export function isDepletedInvestment(investment: Investment): boolean {
  if (investment.category === STOCK_CATEGORY) {
    return investment.lots <= 0;
  }
  if (investment.category === FUND_CATEGORY) {
    if (investment.nib && toDecimal(investment.nib).gt(0)) return false;
    if (investment.units && toDecimal(investment.units).gt(0)) return false;
    if (investment.units && toDecimal(investment.units).lte(0)) return true;
    return toDecimal(investment.principal).lte(0);
  }
  if (investment.category === GOLD_CATEGORY) {
    if (investment.goldGrams === undefined) {
      return toDecimal(investment.principal).lte(0);
    }
    return toDecimal(investment.goldGrams).lte(0);
  }
  return toDecimal(investment.principal).lte(0);
}
