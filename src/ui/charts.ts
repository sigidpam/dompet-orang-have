import { html, svg, type TemplateResult } from 'lit';
import type { AllocationSlice, MonthlyCashflow } from '../domain/summary';
import {
  Decimal,
  formatCompactIdr,
  formatIdr,
  formatNumber,
} from '../domain/money';

export const ALLOCATION_COLORS: Record<string, string> = {
  Saham: '#3987e5',
  'Reksa Dana': '#d95926',
  Deposito: '#199e70',
  Obligasi: '#c98500',
  Emas: '#d55181',
  Lainnya: '#008300',
};

const INCOME_COLOR = '#199e70';
const EXPENSE_COLOR = '#e66767';
const GRID_COLOR = '#27272a';

interface DisplaySlice {
  label: string;
  color: string;
  valueIdr: Decimal;
  pct: Decimal;
}

function buildSlices(allocation: AllocationSlice[]): DisplaySlice[] {
  const values = new Map(
    allocation.map((slice) => [slice.category, slice.valueIdr]),
  );
  const slices: DisplaySlice[] = [];
  let other = new Decimal(0);
  const known = new Set(
    Object.keys(ALLOCATION_COLORS).filter((key) => key !== 'Lainnya'),
  );
  for (const [label, color] of Object.entries(ALLOCATION_COLORS)) {
    if (label === 'Lainnya') continue;
    const value = values.get(label) ?? new Decimal(0);
    if (value.gt(0)) {
      slices.push({
        label,
        color,
        valueIdr: value,
        pct: new Decimal(0),
      });
    }
  }
  for (const slice of allocation) {
    if (!known.has(slice.category)) {
      other = other.plus(slice.valueIdr);
    }
  }
  other = other.plus(values.get('Lainnya') ?? new Decimal(0));
  if (other.gt(0)) {
    slices.push({
      label: 'Lainnya',
      color: ALLOCATION_COLORS.Lainnya ?? '#008300',
      valueIdr: other,
      pct: new Decimal(0),
    });
  }
  const total = slices.reduce(
    (sum, slice) => sum.plus(slice.valueIdr),
    new Decimal(0),
  );
  return slices.map((slice) => ({
    ...slice,
    pct: total.gt(0)
      ? slice.valueIdr.div(total).times(100)
      : new Decimal(0),
  }));
}

function swatch(color: string): TemplateResult {
  return html`<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
    <rect width="10" height="10" rx="2" fill=${color}></rect>
  </svg>`;
}

export function allocationChart(
  allocation: AllocationSlice[],
): TemplateResult {
  const slices = buildSlices(allocation);
  if (slices.length === 0) {
    return html`<div class="px-4 py-8 text-center text-xs leading-5 text-muted">
      Chart alokasi muncul setelah ada investasi bernilai IDR.
    </div>`;
  }

  const width = 600;
  const height = 20;
  const gap = 2;
  const available = width - gap * (slices.length - 1);
  let x = 0;
  const segments = slices.map((slice, index) => {
    const segmentWidth =
      index === slices.length - 1
        ? width - x
        : (available * slice.pct.toNumber()) / 100;
    const segmentX = x;
    x += segmentWidth + gap;
    return svg`<rect
      x=${segmentX}
      y="0"
      width=${Math.max(0, segmentWidth)}
      height=${height}
      rx="2"
      fill=${slice.color}
      class="chart-bar"
      tabindex="0"
      role="img"
      aria-label=${`${slice.label}: ${formatIdr(slice.valueIdr)} (${formatNumber(slice.pct, 1)}%)`}
    >
      <title>${`${slice.label}: ${formatIdr(slice.valueIdr)} (${formatNumber(slice.pct, 1)}%)`}</title>
    </rect>`;
  });

  return html`<div>
    <svg
      viewBox=${`0 0 ${width} ${height}`}
      class="h-5 w-full"
      role="img"
      aria-label="Alokasi portofolio berdasarkan kategori"
      preserveAspectRatio="none"
    >
      ${segments}
    </svg>
    <ul class="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2" aria-label="Rincian alokasi">
      ${slices.map(
        (slice) => html`<li class="flex items-center justify-between gap-2 text-xs">
          <span class="flex min-w-0 items-center gap-2">
            ${swatch(slice.color)}
            <span class="truncate text-ink">${slice.label}</span>
          </span>
          <span class="shrink-0 font-mono tabular text-muted">
            ${formatNumber(slice.pct, 1)}% · ${formatCompactIdr(slice.valueIdr)}
          </span>
        </li>`,
      )}
    </ul>
  </div>`;
}

function bar(
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  label: string,
): TemplateResult {
  return svg`<rect
    x=${x}
    y=${y}
    width=${width}
    height=${height}
    rx="3"
    fill=${color}
    class="chart-bar"
    tabindex="0"
    role="img"
    aria-label=${label}
  >
    <title>${label}</title>
  </rect>`;
}

export function cashflowChart(months: MonthlyCashflow[]): TemplateResult {
  const values = months.flatMap((month) => [
    month.incomeIdr.toNumber(),
    month.expenseIdr.toNumber(),
  ]);
  const maxValue = Math.max(1, ...values);
  if (values.every((value) => value === 0)) {
    return html`<div class="px-4 py-8 text-center text-xs leading-5 text-muted">
      Chart arus kas muncul setelah ada pemasukan atau pengeluaran.
    </div>`;
  }

  const width = 600;
  const height = 180;
  const slot = width / Math.max(1, months.length);
  const barWidth = Math.min(24, Math.max(10, slot * 0.26));
  const barGap = 4;

  const grid = [0, 0.5, 1].map((tick) => {
    const y = height * tick;
    return svg`<line
      x1="0"
      x2=${width}
      y1=${y}
      y2=${y}
      stroke=${GRID_COLOR}
      stroke-width=${tick === 0 ? 1 : 0.75}
    ></line>`;
  });

  const bars: TemplateResult[] = [];
  months.forEach((month, index) => {
    const center = slot * index + slot / 2;
    const incomeHeight =
      (month.incomeIdr.toNumber() / maxValue) * height;
    const expenseHeight =
      (month.expenseIdr.toNumber() / maxValue) * height;
    bars.push(
      bar(
        center - barWidth - barGap / 2,
        height - incomeHeight,
        barWidth,
        incomeHeight,
        INCOME_COLOR,
        `${month.label}: pemasukan ${formatIdr(month.incomeIdr)}`,
      ),
      bar(
        center + barGap / 2,
        height - expenseHeight,
        barWidth,
        expenseHeight,
        EXPENSE_COLOR,
        `${month.label}: pengeluaran ${formatIdr(month.expenseIdr)}`,
      ),
    );
  });

  return html`<div>
    <div class="mb-2 flex flex-wrap items-center gap-4 text-[11px] text-muted">
      <span class="flex items-center gap-1.5"
        >${swatch(INCOME_COLOR)} Pemasukan</span
      >
      <span class="flex items-center gap-1.5"
        >${swatch(EXPENSE_COLOR)} Pengeluaran</span
      >
    </div>
    <div class="flex gap-2">
      <div
        class="flex h-44 flex-col justify-between py-0 text-right font-mono text-[10px] leading-none text-faint"
        aria-hidden="true"
      >
        <span>${formatCompactIdr(maxValue)}</span>
        <span>${formatCompactIdr(maxValue / 2)}</span>
        <span>Rp 0</span>
      </div>
      <div class="min-w-0 flex-1">
        <svg
          viewBox=${`0 0 ${width} ${height}`}
          class="h-44 w-full"
          role="img"
          aria-label="Arus kas enam bulan terakhir: pemasukan dan pengeluaran per bulan"
          preserveAspectRatio="none"
        >
          ${grid} ${bars}
        </svg>
        <div
          class="mt-1 flex text-center font-mono text-[10px] leading-none text-faint"
          aria-hidden="true"
        >
          ${months.map(
            (month) => html`<span class="min-w-0 flex-1 truncate">${month.label}</span>`,
          )}
        </div>
      </div>
    </div>
    <details class="mt-3 text-xs text-muted">
      <summary class="cursor-pointer font-mono uppercase tracking-wider text-faint">
        Lihat data
      </summary>
      <div class="mt-2 overflow-x-auto">
        <table class="w-full min-w-[340px] border-collapse text-left">
          <caption class="sr-only">
            Arus kas bulanan
          </caption>
          <thead>
            <tr class="border-b border-line text-[10px] uppercase tracking-wider text-faint">
              <th class="py-1.5 pr-2 font-normal" scope="col">Bulan</th>
              <th class="py-1.5 pr-2 text-right font-normal" scope="col">Masuk</th>
              <th class="py-1.5 text-right font-normal" scope="col">Keluar</th>
            </tr>
          </thead>
          <tbody>
            ${months.map(
              (month) => html`<tr class="border-b border-line/60">
                <th class="py-1.5 pr-2 font-normal text-ink" scope="row">
                  ${month.label}
                </th>
                <td class="py-1.5 pr-2 text-right font-mono tabular text-income">
                  ${formatIdr(month.incomeIdr)}
                </td>
                <td class="py-1.5 text-right font-mono tabular text-expense">
                  ${formatIdr(month.expenseIdr)}
                </td>
              </tr>`,
            )}
          </tbody>
        </table>
      </div>
    </details>
  </div>`;
}
