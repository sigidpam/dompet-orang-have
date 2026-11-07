import { html, nothing, type TemplateResult } from 'lit';
import type { App } from '../app';
import {
  ACCOUNT_TYPE_LABELS,
  FUND_CATEGORY,
  GOLD_CATEGORY,
  RETURN_CATEGORIES,
  STOCK_CATEGORY,
  TENOR_CATEGORIES,
  TRANSACTION_TYPE_LABELS,
  type Account,
  type Transaction,
} from '../domain/types';
import type {
  AccountGroupView,
  InvestmentGroupView,
  InvestmentView,
  ValueSource,
} from '../domain/summary';
import { isMarketPricedCategory } from '../domain/investments';
import {
  Decimal,
  formatDate,
  formatIdr,
  formatMoney,
  formatNumber,
  formatPercent,
  toDecimal,
} from '../domain/money';
import { icon } from './icons';
import { cardHeader, emptyState, kpiCard } from './components';
import { allocationChart, cashflowChart } from './charts';
import {
  accountName,
  convertToIdr,
  rateMap,
} from '../domain/summary';

function accountIcon(type: Account['type']): TemplateResult {
  const name = type === 'bank' ? 'bank' : type === 'cash' ? 'cash' : 'wallet';
  return icon(name, 'size-4');
}

function signedAmount(transaction: Transaction): string {
  const incoming =
    transaction.type === 'income' || transaction.type === 'sell';
  return `${incoming ? '+' : '−'} ${formatMoney(transaction.amount, transaction.currency)}`;
}

function formatSignedIdr(value: Decimal): string {
  return `${value.gte(0) ? '+' : '−'} ${formatIdr(value.abs())}`;
}

function idrEquivalent(
  amount: string,
  currency: string,
  app: App,
): TemplateResult | typeof nothing {
  if (currency === 'IDR') return nothing;
  const dataset = app.state.dataset;
  if (!dataset) return nothing;
  const converted = convertToIdr(amount, currency, rateMap(dataset.rates));
  if (converted === null) {
    return html`<span class="text-[10px] text-accent">Kurs ${currency} belum diatur</span>`;
  }
  return html`<span class="text-[10px] text-faint">≈ ${formatIdr(converted)}</span>`;
}

function statusPill(app: App): TemplateResult {
  if (app.state.offline) {
    return html`<span class="badge border-accent/40 text-accent">
      ${icon('wifiOff', 'size-3')} Offline
    </span>`;
  }
  return html`<span class="badge border-income/30 text-income">
    ${icon('check', 'size-3')} Siap offline
  </span>`;
}

function navLink(label: string, href: string): TemplateResult {
  return html`<a
    class="inline-flex min-h-11 items-center px-3 font-mono text-[11px] uppercase tracking-wider text-muted transition-colors hover:text-ink"
    href=${href}
    >${label}</a
  >`;
}

function gainBadge(
  investment: Pick<InvestmentGroupView, 'gainIdr' | 'gainPct'>,
): TemplateResult {
  if (
    investment.gainIdr === null ||
    investment.gainPct === null ||
    investment.gainIdr.isZero()
  ) {
    return html`<span class="badge">Nilai investasi</span>`;
  }
  const positive = investment.gainIdr.gte(0);
  return html`<span
    class=${`badge ${positive ? 'border-income/30 text-income' : 'border-expense/30 text-expense'}`}
  >
    ${icon(positive ? 'trendUp' : 'trendDown', 'size-3')}
    ${formatSignedIdr(investment.gainIdr)} ·
    ${formatNumber(investment.gainPct.abs(), 1)}%
  </span>`;
}

const VALUE_SOURCE_LABELS: Record<ValueSource, string> = {
  cost: 'Memakai nilai investasi',
  stock: 'Memakai harga saham saat ini',
  nib: 'Memakai NIB',
  units: 'Unit × NAB',
  'gold-override': 'Memakai harga emas manual',
  'gold-market': 'Memakai harga emas acuan',
  mixed: 'Gabungan beberapa sumber nilai',
};

function investmentDetailRows(
  app: App,
  investment: InvestmentGroupView,
): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  const category = investment.category;
  if (category === STOCK_CATEGORY) {
    const price = investment.members.find(
      (member) => member.stockCurrentPrice,
    )?.stockCurrentPrice;
    rows.push(
      ['Kode saham', investment.stockCode ?? '—'],
      ['Total lot', `${formatNumber(investment.lots, 0)} lot`],
      [
        'Harga saat ini',
        price
          ? formatMoney(price, investment.currency)
          : 'Belum diisi',
      ],
    );
  } else if (category === FUND_CATEGORY) {
    const nab = investment.members.find((member) => member.nab)?.nab;
    const nib = investment.members.reduce(
      (total, member) =>
        member.nib ? total.plus(toDecimal(member.nib)) : total,
      new Decimal(0),
    );
    rows.push(
      [
        'Total unit',
        investment.units.gt(0)
          ? formatNumber(investment.units, 6)
          : 'Belum diisi',
      ],
      [
        'NAB / unit',
        nab ? formatNumber(nab, 4) : 'Belum diisi',
      ],
    );
    if (nib.gt(0)) {
      rows.push(['NIB', formatMoney(nib, investment.currency)]);
    }
  } else if (category === GOLD_CATEGORY) {
    const market = app.state.goldPrice;
    const manual = investment.members.find(
      (member) => member.goldCurrentPricePerGram,
    )?.goldCurrentPricePerGram;
    const averageBuy =
      investment.grams.gt(0) ? investment.cost.div(investment.grams) : null;
    const currentPrice = manual
      ? `${formatMoney(manual, investment.currency)} (manual)`
      : market
        ? `${formatIdr(market.pricePerGram)}/g (acuan)`
        : 'Belum tersedia';
    rows.push(
      [
        'Gramasi',
        investment.grams.gt(0)
          ? `${formatNumber(investment.grams, 2)} gram`
          : 'Belum diisi',
      ],
      [
        'Harga beli / gram',
        averageBuy ? formatMoney(averageBuy, investment.currency) : '—',
      ],
      ['Harga saat ini', currentPrice],
    );
  } else if (TENOR_CATEGORIES.includes(category)) {
    const member = investment.members[0];
    rows.push(
      ['Tenor', `${formatNumber(member?.tenorMonths ?? 0, 0)} bulan`],
      ['Bunga', formatPercent(member?.annualInterestRate ?? 0)],
    );
  } else if (RETURN_CATEGORIES.includes(category)) {
    const member = investment.members[0];
    rows.push(['Bunga', formatPercent(member?.annualInterestRate ?? 0)]);
  }

  rows.push([
    'Nilai investasi',
    formatMoney(investment.currentValue, investment.currency),
  ]);
  if (isMarketPricedCategory(category)) {
    rows.push([
      'Harga beli (net)',
      formatMoney(investment.cost, investment.currency),
    ]);
  }
  const monthlyReturn = investment.members.reduce(
    (total, member) => total.plus(member.monthlyReturn),
    new Decimal(0),
  );
  if (monthlyReturn.gt(0)) {
    rows.push([
      'Est. return / bln',
      formatMoney(monthlyReturn, investment.currency),
    ]);
  }
  return rows;
}

function renderTransactionRow(
  app: App,
  transaction: Transaction,
  accounts: Account[],
): TemplateResult {
  const incoming =
    transaction.type === 'income' || transaction.type === 'sell';
  const tone = incoming ? 'text-income' : 'text-expense';
  const label = TRANSACTION_TYPE_LABELS[transaction.type];
  const title = transaction.investmentLabel ?? transaction.category;
  const tradeDetail =
    transaction.quantity && transaction.unitPrice
      ? `${formatNumber(transaction.quantity, 6)} × ${formatMoney(transaction.unitPrice, transaction.currency)}`
      : '';
  return html`<li class="data-row" data-testid="transaction-row">
    <div class="flex min-w-0 items-start gap-3">
      <span
        class=${`mt-0.5 flex size-9 shrink-0 items-center justify-center border border-line bg-raised ${tone}`}
        aria-hidden="true"
      >
        ${icon(incoming ? 'trendUp' : 'trendDown', 'size-4')}
      </span>
      <div class="min-w-0">
        <p class="truncate text-sm font-semibold text-ink">${title}</p>
        <p class="mt-0.5 truncate text-[11px] text-muted">
          <span class="sr-only">${label} di </span>${accountName(
            accounts,
            transaction.accountId,
          )}
          · <time datetime=${transaction.date}>${formatDate(transaction.date)}</time>
          ${tradeDetail ? ` · ${tradeDetail}` : ''}
        </p>
      </div>
    </div>
    <div class="flex items-center gap-1">
      <div class="text-right">
        <p class=${`text-sm font-bold tabular ${tone}`}>
          ${signedAmount(transaction)}
        </p>
        <div class="flex flex-col items-end">
          ${idrEquivalent(transaction.amount, transaction.currency, app)}
          <span class="text-[10px] uppercase tracking-wider text-faint">${label}</span>
        </div>
      </div>
      ${transaction.type === 'buy' || transaction.type === 'sell'
        ? html`<span
            class="ml-1 flex size-8 items-center justify-center text-faint"
            title="Catat transaksi sebaliknya untuk mengoreksi"
            aria-label="Transaksi beli/jual dikoreksi dengan transaksi sebaliknya"
          >
            ${icon('lock', 'size-4')}
          </span>`
        : html`<button
            type="button"
            class="btn-icon ml-1 text-faint hover:text-danger"
            aria-label=${`Hapus transaksi ${title} sebesar ${formatMoney(transaction.amount, transaction.currency)}`}
            @click=${() =>
              app.requestDelete('transaction', transaction.id, title)}
          >
            ${icon('trash', 'size-4')}
          </button>`}
    </div>
  </li>`;
}

function memberQuantity(member: InvestmentView): string {
  if (member.category === STOCK_CATEGORY) {
    return `${formatNumber(member.lots, 0)} lot`;
  }
  if (member.category === FUND_CATEGORY) {
    return `${formatNumber(member.units ?? 0, 6)} unit`;
  }
  if (member.category === GOLD_CATEGORY) {
    return `${formatNumber(member.goldGrams ?? 0, 2)} gram`;
  }
  return formatMoney(member.principal, member.currency);
}

function renderInvestmentCard(
  app: App,
  investment: InvestmentGroupView,
): TemplateResult {
  const rows = investmentDetailRows(app, investment);
  const multiple = investment.members.length > 1;
  const first = investment.members[0];
  return html`<article class="card flex flex-col p-4" data-testid="investment-card">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="truncate text-sm font-bold text-ink">${investment.name}</h3>
        <p class="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted">
          <span class="badge">${investment.category}</span>
          ${investment.currency !== 'IDR'
            ? html`<span class="badge">${investment.currency}</span>`
            : nothing}
          ${multiple
            ? html`<span class="badge">${investment.members.length} catatan</span>`
            : nothing}
        </p>
      </div>
      ${!multiple && first
        ? html`<div class="flex shrink-0 items-start">
            <button
              type="button"
              class="btn-icon -mt-2 text-faint hover:text-ink"
              aria-label=${`Ubah investasi ${investment.name}`}
              @click=${() => app.openEditInvestment(first.id)}
            >
              ${icon('edit', 'size-4')}
            </button>
            <button
              type="button"
              class="btn-icon -mr-2 -mt-2 text-faint hover:text-danger"
              aria-label=${`Hapus investasi ${investment.name}`}
              @click=${() =>
                app.requestDelete('investment', first.id, investment.name)}
            >
              ${icon('trash', 'size-4')}
            </button>
          </div>`
        : nothing}
    </div>

    <div class="mt-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <p class="text-[10px] uppercase tracking-wider text-faint">
          Nilai saat ini
        </p>
        <p class="mt-0.5 font-mono text-lg font-bold tabular text-ink" data-testid="investment-current-value">
          ${formatMoney(investment.currentValue, investment.currency)}
        </p>
        <p class="mt-0.5 text-[10px] text-faint">
          ${investment.currency === 'IDR'
            ? 'Rupiah'
            : investment.currentValueIdr === null
              ? 'Kurs belum diatur'
              : `≈ ${formatIdr(investment.currentValueIdr)}`}
        </p>
      </div>
      <div class="text-right">${gainBadge(investment)}</div>
    </div>

    <dl class="mt-4 grid grid-cols-2 gap-2 border-t border-line pt-3 text-xs">
      ${rows.map(
        ([label, value]) => html`<div class="min-w-0">
          <dt class="text-[10px] text-faint">${label}</dt>
          <dd class="mt-0.5 truncate font-mono tabular text-ink" title=${value}>
            ${value}
          </dd>
        </div>`,
      )}
    </dl>

    ${multiple
      ? html`<details class="mt-3 border-t border-line pt-3">
          <summary class="cursor-pointer font-mono text-[10px] uppercase tracking-wider text-muted">
            Rincian ${investment.members.length} catatan
          </summary>
          <ul class="mt-2 divide-y divide-line">
            ${investment.members.map(
              (member) => html`<li class="flex items-center justify-between gap-2 py-2">
                <div class="min-w-0">
                  <p class="truncate text-xs font-semibold text-ink">
                    ${member.name}
                  </p>
                  <p class="text-[10px] text-faint">
                    ${memberQuantity(member)} ·
                    ${formatMoney(member.currentValue, member.currency)}
                  </p>
                </div>
                <div class="flex shrink-0 items-center">
                  <button
                    type="button"
                    class="btn-icon text-faint hover:text-ink"
                    aria-label=${`Ubah investasi ${member.name}`}
                    @click=${() => app.openEditInvestment(member.id)}
                  >
                    ${icon('edit', 'size-4')}
                  </button>
                  <button
                    type="button"
                    class="btn-icon text-faint hover:text-danger"
                    aria-label=${`Hapus investasi ${member.name}`}
                    @click=${() =>
                      app.requestDelete('investment', member.id, member.name)}
                  >
                    ${icon('trash', 'size-4')}
                  </button>
                </div>
              </li>`,
            )}
          </ul>
        </details>`
      : nothing}

    <p class="mt-3 text-[10px] text-faint">
      ${VALUE_SOURCE_LABELS[investment.valueSource]}
    </p>
  </article>`;
}

function renderAccountCard(
  app: App,
  account: AccountGroupView,
): TemplateResult {
  const multiple = account.members.length > 1;
  return html`<article class="card flex flex-wrap items-start justify-between gap-3 p-4" data-testid="account-card">
    <div class="flex min-w-0 items-start gap-3">
      <span
        class="flex size-9 shrink-0 items-center justify-center border border-line bg-raised text-info"
        aria-hidden="true"
      >
        ${accountIcon(account.type)}
      </span>
      <div class="min-w-0">
        <h3 class="truncate text-sm font-bold text-ink">${account.name}</h3>
        <p class="mt-1 flex flex-wrap gap-1">
          <span class="badge">${ACCOUNT_TYPE_LABELS[account.type]}</span>
          <span class="badge">${account.currency}</span>
          ${multiple
            ? html`<span class="badge">${account.members.length} rekening</span>`
            : nothing}
        </p>
      </div>
    </div>
    <div class="flex items-start gap-1">
      <div class="text-right">
        <p class="font-mono text-sm font-bold tabular text-emerald-300">
          ${formatMoney(account.balance, account.currency)}
        </p>
        <p class="mt-0.5 text-[10px] text-faint">
          ${account.currency === 'IDR'
            ? 'Rupiah'
            : account.balanceIdr === null
              ? 'Kurs belum diatur'
              : `≈ ${formatIdr(account.balanceIdr)}`}
        </p>
      </div>
      ${!multiple
        ? html`<button
            type="button"
            class="btn-icon -mr-2 -mt-2 text-faint hover:text-danger"
            aria-label=${`Hapus rekening ${account.name}`}
            @click=${() => {
              const member = account.members[0];
              if (member) app.requestDelete('account', member.id, account.name);
            }}
          >
            ${icon('trash', 'size-4')}
          </button>`
        : nothing}
    </div>
    ${multiple
      ? html`<div class="w-full border-t border-line pt-2">
          <details>
            <summary class="cursor-pointer font-mono text-[10px] uppercase tracking-wider text-muted">
              Rincian ${account.members.length} rekening
            </summary>
            <ul class="mt-1 divide-y divide-line">
              ${account.members.map(
                (member) => html`<li class="flex items-center justify-between gap-2 py-1.5">
                  <div class="min-w-0">
                    <p class="truncate text-[11px] text-ink">${member.name}</p>
                    <p class="text-[10px] text-faint">
                      ${ACCOUNT_TYPE_LABELS[member.type]} ·
                      ${formatMoney(member.balance, member.currency)}
                    </p>
                  </div>
                  <button
                    type="button"
                    class="btn-icon text-faint hover:text-danger"
                    aria-label=${`Hapus rekening ${member.name}`}
                    @click=${() =>
                      app.requestDelete('account', member.id, member.name)}
                  >
                    ${icon('trash', 'size-4')}
                  </button>
                </li>`,
              )}
            </ul>
          </details>
        </div>`
      : nothing}
  </article>`;
}

function heroSection(app: App): TemplateResult {
  const summary = app.state.summary;
  if (!summary) return html``;
  const gain = summary.unrealizedGainIdr;
  const positive = gain.gte(0);
  const pct = summary.unrealizedGainPct;
  return html`<section id="ringkasan" class="scroll-mt-28" aria-labelledby="ringkasan-title">
    <h2 class="sr-only" id="ringkasan-title">Ringkasan keuangan</h2>
    <div class="grid gap-3 lg:grid-cols-[1.05fr_1.55fr]">
      <article class="card relative overflow-hidden border-accent/30 p-5 sm:p-6">
        <div
          class="pointer-events-none absolute -right-10 -top-10 text-accent/5"
          aria-hidden="true"
        >
          ${icon('shield', 'size-44')}
        </div>
        <p class="kpi-label">Kekayaan bersih</p>
        <p class="mt-2 font-mono text-4xl font-bold tracking-tight text-ink sm:text-5xl" data-testid="net-worth">
          ${formatIdr(summary.netWorthIdr)}
        </p>
        <div class="mt-4 flex flex-wrap gap-2">
          <span
            class=${`badge ${positive ? 'border-income/30 text-income' : 'border-expense/30 text-expense'}`}
          >
            ${icon(positive ? 'trendUp' : 'trendDown', 'size-3')}
            ${formatSignedIdr(gain)}
            ${pct === null ? '' : ` · ${formatNumber(pct.abs(), 1)}%`}
          </span>
          <span class="badge">vs harga beli</span>
        </div>
        <p class="mt-4 max-w-md text-xs leading-5 text-muted">
          Dana liquid + nilai portofolio saat ini. Emas memakai harga acuan,
          Saham memakai harga per lembar, Reksa Dana memakai NIB/NAB.
        </p>
      </article>
      <div class="grid grid-cols-2 gap-3">
        ${kpiCard({
          label: 'Dana Liquid / Cash',
          value: formatIdr(summary.liquidCashIdr),
          iconName: 'wallet',
          tone: 'info',
          detail: `${formatNumber(summary.accounts.length, 0)} rekening`,
        })}
        ${kpiCard({
          label: 'Nilai Portofolio',
          value: formatIdr(summary.portfolioCurrentIdr),
          iconName: 'chart',
          tone: 'accent',
          detail: `${formatNumber(summary.investmentGroups.length, 0)} aset`,
        })}
        ${kpiCard({
          label: 'Harga Beli / Modal',
          value: formatIdr(summary.portfolioCostIdr),
          iconName: 'wallet',
          tone: 'neutral',
          detail: 'Net setelah cashback',
        })}
        ${kpiCard({
          label: 'Est. Return / Bulan',
          value: formatIdr(summary.estMonthlyReturnIdr),
          iconName: 'trendUp',
          tone: 'income',
          detail: 'Estimasi dari bunga tercatat',
        })}
      </div>
    </div>
  </section>`;
}

function goldPriceStrip(app: App): TemplateResult | typeof nothing {
  const summary = app.state.summary;
  const hasGold =
    summary?.investments.some(
      (investment) => investment.category === GOLD_CATEGORY,
    ) ?? false;
  if (!hasGold && !app.state.goldPrice) return nothing;
  const price = app.state.goldPrice;
  return html`<section class="card mt-3 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
    <div class="min-w-0">
      <p class="kpi-label">Harga emas acuan</p>
      ${price
        ? html`<p class="mt-1 font-mono text-lg font-bold tabular text-accent">
            ${formatIdr(price.pricePerGram)}<span class="ml-1 text-xs font-normal text-muted">/gram</span>
          </p>`
        : html`<p class="mt-1 text-sm text-muted">Belum tersedia</p>`}
      <p class="mt-1 text-[10px] leading-4 text-faint">
        ${price
          ? `${price.source} · ${formatDate(price.updatedAt)}${price.sourceType === 'spot' ? ' · spot' : ''}`
          : app.state.goldPriceError}
      </p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      <span class="badge">Diperbarui harian</span>
      <button
        type="button"
        class="btn no-print"
        ?disabled=${app.state.goldPriceLoading}
        @click=${() => void app.loadGoldPrice(true)}
      >
        ${icon('refresh', 'size-4')}
        ${app.state.goldPriceLoading ? 'Memuat…' : 'Perbarui'}
      </button>
    </div>
  </section>`;
}

function actionsSection(app: App): TemplateResult {
  return html`<section class="mt-4 no-print" aria-label="Aksi cepat">
    <div class="flex flex-wrap gap-2">
      <button
        type="button"
        class="btn btn-primary"
        data-testid="quick-add-transaction"
        @click=${() => app.openAddTransaction()}
      >
        ${icon('plus', 'size-4')} Tambah Transaksi
      </button>
      <button
        type="button"
        class="btn"
        data-testid="quick-add-account"
        @click=${() => app.openModal('account')}
      >
        ${icon('plus', 'size-4')} Tambah Rekening
      </button>
      <button
        type="button"
        class="btn"
        data-testid="quick-add-investment"
        @click=${() => app.openModal('investment')}
      >
        ${icon('plus', 'size-4')} Tambah Investasi
      </button>
      <button type="button" class="btn" @click=${() => app.openSettings()}>
        ${icon('settings', 'size-4')} Pengaturan
      </button>
    </div>
    <div class="mt-2 flex flex-wrap gap-2 no-print">
      <button type="button" class="btn btn-ghost" @click=${() => app.exportCsv()}>
        ${icon('download', 'size-4')} CSV
      </button>
      <button type="button" class="btn btn-ghost" @click=${() => app.printReport()}>
        ${icon('printer', 'size-4')} Cetak / PDF
      </button>
      <button type="button" class="btn btn-ghost" @click=${() => void app.shareSummary()}>
        ${icon('share', 'size-4')} Bagikan
      </button>
    </div>
  </section>`;
}

function chartsSection(app: App): TemplateResult {
  const summary = app.state.summary;
  if (!summary) return html``;
  const net = summary.netCashflowIdr;
  return html`<section class="mt-4 grid items-start gap-3 lg:grid-cols-2" aria-label="Statistik">
    <div class="card">
      ${cardHeader(
        'Alokasi portofolio',
        `${formatIdr(summary.portfolioCurrentIdr)} nilai saat ini`,
      )}
      <div class="p-4">${allocationChart(summary.allocation)}</div>
    </div>
    <div class="card">
      ${cardHeader(
        'Arus kas 6 bulan',
        `Bersih ${net.gte(0) ? '+' : '−'} ${formatIdr(net.abs())}`,
      )}
      <div class="p-4">${cashflowChart(summary.monthlyCashflow)}</div>
    </div>
  </section>`;
}

function transactionsSection(app: App): TemplateResult {
  const dataset = app.state.dataset;
  if (!dataset) return html``;
  const sorted = [...dataset.transactions].sort(
    (a, b) =>
      b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );
  return html`<section
    id="transaksi"
    class="mt-8 scroll-mt-28"
    aria-labelledby="transaksi-title"
  >
    <div class="card">
      ${cardHeader(
        'Transaksi',
        sorted.length > 0
          ? `${formatNumber(sorted.length, 0)} transaksi tercatat`
          : 'Pemasukan dan pengeluaran per rekening',
        html`<button
          type="button"
          class="btn no-print"
          @click=${() => app.openAddTransaction()}
        >
          ${icon('plus', 'size-4')} Tambah
        </button>`,
      )}
      ${sorted.length === 0
        ? emptyState(
            'cash',
            'Belum ada transaksi',
            'Tambahkan rekening terlebih dahulu, lalu catat pemasukan atau pengeluaran pertama Anda.',
            html`<button
              type="button"
              class="btn btn-primary"
              @click=${() => app.openModal('account')}
            >
              ${icon('plus', 'size-4')} Tambah Rekening
            </button>`,
          )
        : html`<ul class="divide-y divide-line">
            ${sorted.map((transaction) =>
              renderTransactionRow(app, transaction, dataset.accounts),
            )}
          </ul>`}
    </div>
  </section>`;
}

function portfolioSection(app: App): TemplateResult {
  const summary = app.state.summary;
  if (!summary) return html``;
  return html`<section
    id="portofolio"
    class="mt-8 scroll-mt-28"
    aria-labelledby="portofolio-title"
  >
    <div class="card">
      ${cardHeader(
        'Portofolio investasi',
        `${formatNumber(summary.investmentGroups.length, 0)} aset · nilai saat ini ${formatIdr(summary.portfolioCurrentIdr)}`,
        html`<button
          type="button"
          class="btn no-print"
          @click=${() => app.openModal('investment')}
        >
          ${icon('plus', 'size-4')} Tambah
        </button>`,
      )}
      ${summary.investmentGroups.length === 0
        ? emptyState(
            'chart',
            'Portofolio masih kosong',
            'Catat saham, reksa dana, deposito, obligasi, emas, atau aset lain. Isian menyesuaikan kategori.',
          )
        : html`<div class="grid grid-cols-1 gap-3 p-3 md:grid-cols-2">
            ${summary.investmentGroups.map((investment) =>
              renderInvestmentCard(app, investment),
            )}
          </div>`}
    </div>
  </section>`;
}

function accountsSection(app: App): TemplateResult {
  const summary = app.state.summary;
  if (!summary) return html``;
  return html`<section
    id="rekening"
    class="mt-8 scroll-mt-28"
    aria-labelledby="rekening-title"
  >
    <div class="card">
      ${cardHeader(
        'Rekening & cash',
        'Saldo diperbarui otomatis dari transaksi',
        html`<button
          type="button"
          class="btn no-print"
          @click=${() => app.openModal('account')}
        >
          ${icon('plus', 'size-4')} Tambah
        </button>`,
      )}
      ${summary.accountGroups.length === 0
        ? emptyState(
            'wallet',
            'Belum ada rekening',
            'Tambahkan bank, tunai, atau e-wallet untuk mulai mencatat arus kas.',
            html`<button
              type="button"
              class="btn btn-primary"
              @click=${() => app.openModal('account')}
            >
              ${icon('plus', 'size-4')} Tambah Rekening
            </button>`,
          )
        : html`<div class="grid grid-cols-1 gap-3 p-3 md:grid-cols-2 xl:grid-cols-3">
            ${summary.accountGroups.map((account) =>
              renderAccountCard(app, account),
            )}
          </div>`}
    </div>
  </section>`;
}

export function renderDashboard(app: App): TemplateResult {
  const summary = app.state.summary;
  const dataset = app.state.dataset;
  if (!summary || !dataset) {
    return html`<main class="app-shell py-10 text-center text-sm text-muted">
      Data belum siap.
    </main>`;
  }
  const missing = summary.missingRates;
  const isEmpty =
    dataset.accounts.length === 0 &&
    dataset.investments.length === 0 &&
    dataset.transactions.length === 0;

  return html`<div class="app-shell min-h-dvh">
    <header class="sticky top-0 z-40 no-print border-b border-line bg-canvas/95 backdrop-blur">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-1 py-3">
        <div class="flex min-w-0 items-center gap-3">
          <span
            class="flex size-9 shrink-0 items-center justify-center border border-accent/40 bg-accent/10 text-accent"
            aria-hidden="true"
          >
            ${icon('shield', 'size-4')}
          </span>
          <div class="min-w-0">
            <p class="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-muted">
              Dompet Orang Have · v${app.version}
            </p>
            <h1 class="truncate text-base font-bold tracking-tight text-ink sm:text-lg">
              Aset &amp; Cashflow
            </h1>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-1.5">
          ${statusPill(app)}
          <button type="button" class="btn-icon" aria-label="Buka pengaturan" @click=${() => app.openSettings()}>
            ${icon('settings', 'size-4')}
          </button>
          <button type="button" class="btn btn-ghost" aria-label="Kunci vault" @click=${() => app.lockNow()}>
            ${icon('lock', 'size-4')} <span class="hidden sm:inline">Kunci</span>
          </button>
        </div>
      </div>
      <nav
        class="mx-auto flex max-w-6xl gap-0 overflow-x-auto border-t border-line/60 px-1 scrollbar-thin"
        aria-label="Navigasi bagian"
      >
        ${navLink('Ringkasan', '#ringkasan')} ${navLink('Transaksi', '#transaksi')}
        ${navLink('Portofolio', '#portofolio')} ${navLink('Rekening', '#rekening')}
      </nav>
    </header>

    <main id="main" class="mx-auto max-w-6xl py-5 sm:py-8">
      ${app.state.updateAvailable
        ? html`<div class="banner mb-4 no-print" role="status">
            <span class="flex items-center gap-2">
              ${icon('refresh', 'size-4')}
              Versi baru aplikasi tersedia.
            </span>
            <button type="button" class="btn btn-primary" @click=${() => app.applyUpdate()}>
              Muat ulang
            </button>
          </div>`
        : nothing}
      ${app.state.offline
        ? html`<div class="banner mb-4 no-print" role="status">
            <span class="flex items-center gap-2">
              ${icon('wifiOff', 'size-4')}
              Mode offline — data lokal tetap dapat diakses dan diubah.
            </span>
          </div>`
        : nothing}
      ${missing.length > 0
        ? html`<div class="banner border-accent/40 bg-accent/10 mb-4 no-print" role="alert">
            <span class="flex items-start gap-2">
              ${icon('alert', 'mt-0.5 size-4 shrink-0')}
              <span>
                Kurs ${missing.join(', ')} belum diatur. Nilai dalam mata uang tersebut
                tidak disertakan pada total IDR.
              </span>
            </span>
            <button type="button" class="btn" @click=${() => app.openSettings()}>
              Atur kurs
            </button>
          </div>`
        : nothing}

      ${isEmpty
        ? html`<section class="card mb-5 border-accent/30 p-5 sm:p-6">
            <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">
              Vault siap
            </p>
            <h2 class="mt-2 text-balance text-xl font-bold tracking-tight text-ink">
              Mulai dengan rekening pertama Anda
            </h2>
            <p class="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Data baru tersimpan terenkripsi di perangkat ini. Tambahkan rekening,
              catat transaksi, lalu pantau arus kas dan portofolio dari satu dashboard.
            </p>
            <div class="mt-4 flex flex-wrap gap-2 no-print">
              <button type="button" class="btn btn-primary" @click=${() => app.openModal('account')}>
                ${icon('plus', 'size-4')} Tambah Rekening
              </button>
              <button type="button" class="btn" @click=${() => app.openModal('investment')}>
                ${icon('chart', 'size-4')} Tambah Investasi
              </button>
            </div>
          </section>`
        : nothing}

      ${heroSection(app)} ${goldPriceStrip(app)} ${actionsSection(app)}
      ${chartsSection(app)} ${portfolioSection(app)} ${transactionsSection(app)}
      ${accountsSection(app)}

      <footer class="mt-8 border-t border-line pt-4 text-[11px] leading-5 text-faint">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Data lokal terenkripsi AES-256-GCM · terakhir diperbarui
            ${formatDate(dataset.updatedAt)}
          </p>
          <p class="font-mono uppercase tracking-wider">
            v${app.version} · tanpa analytics
          </p>
        </div>
        <p class="mt-2 max-w-3xl">
          Aplikasi ini bukan nasihat keuangan. Harga emas acuan adalah spot
          internasional, bukan harga retail ANTAM; gunakan harga manual per aset
          bila perlu. Jangan gunakan PIN yang sama dengan PIN bank.
        </p>
      </footer>
    </main>
  </div>`;
}
