import type { Dataset } from './types';
import { ACCOUNT_TYPE_LABELS, TRANSACTION_TYPE_LABELS } from './types';

const FORMULA_PREFIX = /^[=+\-@\t\r]/;
// eslint-disable-next-line security/detect-unsafe-regex -- anchored, bounded decimal grammar
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/;

export function csvCell(value: string | number): string {
  let text = String(value);
  const isPlainNumber = PLAIN_NUMBER.test(text);
  if (
    !isPlainNumber &&
    (FORMULA_PREFIX.test(text) || /^[=+\-@]/.test(text.trimStart()))
  ) {
    text = `'${text}`;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function row(cells: Array<string | number>): string {
  return cells.map(csvCell).join(',');
}

export function buildCsv(dataset: Dataset, exportedAt = new Date()): string {
  const lines: string[] = [];
  lines.push(row(['Laporan Dompet Orang Have']));
  lines.push(row(['Diekspor', exportedAt.toISOString()]));
  lines.push('');

  lines.push(row(['=== INVESTASI ===']));
  lines.push(
    row([
      'ID',
      'Nama Aset',
      'Kategori',
      'Modal',
      'Cashback',
      'Bunga (% p.a)',
      'Tenor (Bulan)',
      'Lot',
      'Mata Uang',
      'Dibuat',
    ]),
  );
  for (const investment of dataset.investments) {
    lines.push(
      row([
        investment.id,
        investment.name,
        investment.category,
        investment.principal,
        investment.cashback,
        investment.annualInterestRate,
        investment.tenorMonths,
        investment.lots,
        investment.currency,
        investment.createdAt,
      ]),
    );
  }

  lines.push('');
  lines.push(row(['=== REKENING & CASH ===']));
  lines.push(row(['ID', 'Nama Rekening', 'Tipe', 'Saldo', 'Mata Uang', 'Dibuat']));
  for (const account of dataset.accounts) {
    lines.push(
      row([
        account.id,
        account.name,
        ACCOUNT_TYPE_LABELS[account.type],
        account.balance,
        account.currency,
        account.createdAt,
      ]),
    );
  }

  lines.push('');
  lines.push(row(['=== TRANSAKSI ===']));
  lines.push(
    row([
      'ID',
      'Tanggal',
      'Rekening',
      'Jenis',
      'Kategori',
      'Jumlah',
      'Mata Uang',
      'Dibuat',
    ]),
  );
  const accountNames = new Map(
    dataset.accounts.map((account) => [account.id, account.name]),
  );
  const sortedTransactions = [...dataset.transactions].sort((a, b) =>
    b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
  );
  for (const transaction of sortedTransactions) {
    lines.push(
      row([
        transaction.id,
        transaction.date,
        accountNames.get(transaction.accountId) ?? 'Rekening dihapus',
        TRANSACTION_TYPE_LABELS[transaction.type],
        transaction.category,
        transaction.amount,
        transaction.currency,
        transaction.createdAt,
      ]),
    );
  }

  lines.push('');
  lines.push(row(['=== KURS KE IDR ===']));
  lines.push(row(['Mata Uang', 'Kurs', 'Sumber', 'Diperbarui']));
  for (const rate of dataset.rates) {
    lines.push(
      row([rate.currency, rate.rateToIdr, rate.source, rate.updatedAt]),
    );
  }

  return `${String.fromCharCode(0xfeff)}${lines.join('\r\n')}\r\n`;
}

export function downloadCsv(dataset: Dataset, filename = 'dompet-report.csv'): void {
  const csv = buildCsv(dataset);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
