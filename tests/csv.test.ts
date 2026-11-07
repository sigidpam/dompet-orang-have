import { describe, expect, it } from 'vitest';
import { buildCsv, csvCell } from '../src/domain/csv';
import { emptyDataset } from '../src/domain/types';

describe('CSV export', () => {
  it('escapes quotes and neutralizes spreadsheet formulas', () => {
    expect(csvCell('normal')).toBe('"normal"');
    expect(csvCell('a"b')).toBe('"a""b"');
    expect(csvCell('=1+1')).toBe('"\'=1+1"');
    expect(csvCell('+1')).toBe('"\'+1"');
    expect(csvCell('-1')).toBe('"\'-1"');
    expect(csvCell('@SUM(A1)')).toBe('"\'@SUM(A1)"');
    expect(csvCell('\tcmd')).toBe(`"'\tcmd"`);
    expect(csvCell('  =1+1')).toBe('"\'  =1+1"');
  });

  it('starts with a UTF-8 BOM and includes all sections', () => {
    const dataset = emptyDataset(new Date('2026-11-07T00:00:00.000Z'));
    dataset.accounts = [
      {
        id: 'acc_1',
        name: '=HYPERLINK("http://evil","click")',
        type: 'bank',
        currency: 'IDR',
        balance: '1000',
        createdAt: '2026-11-07T00:00:00.000Z',
      },
    ];
    dataset.transactions = [
      {
        id: 'tx_1',
        accountId: 'acc_1',
        type: 'expense',
        category: '@Makan',
        amount: '250',
        currency: 'IDR',
        date: '2026-11-07',
        createdAt: '2026-11-07T00:00:00.000Z',
      },
    ];
    dataset.investments = [
      {
        id: 'inv_1',
        name: '+Deposito',
        category: 'Deposito',
        principal: '1000',
        cashback: '0',
        annualInterestRate: '6',
        tenorMonths: 12,
        lots: 0,
        currency: 'IDR',
        createdAt: '2026-11-07T00:00:00.000Z',
      },
    ];
    dataset.rates = [
      {
        currency: 'USD',
        rateToIdr: '16000',
        source: 'manual',
        updatedAt: '2026-11-07T00:00:00.000Z',
      },
    ];

    const csv = buildCsv(dataset, new Date('2026-11-07T00:00:00.000Z'));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('=== INVESTASI ===');
    expect(csv).toContain('=== REKENING & CASH ===');
    expect(csv).toContain('=== TRANSAKSI ===');
    expect(csv).toContain('=== KURS KE IDR ===');
    expect(csv).toContain(`"'=HYPERLINK(""http://evil"",""click"")"`);
    expect(csv).toContain(`"'@Makan"`);
    expect(csv).toContain(`"'+Deposito"`);
    expect(csv).toContain('"250"');
    expect(csv).toContain('"16000"');
  });
});
