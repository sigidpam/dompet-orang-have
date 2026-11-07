import { expect, test, type Page } from '@playwright/test';

async function setup(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('#setup-pin').fill('123456');
  await page.locator('#setup-pin-confirm').fill('123456');
  await page.getByRole('button', { name: /Buat vault terenkripsi/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Simpan kode pemulihan' }),
  ).toBeVisible({ timeout: 20_000 });
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /Lanjut ke dashboard/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Aset & Cashflow' }),
  ).toBeVisible();
}

async function addAccount(page: Page, balance = '10000000'): Promise<void> {
  await page.getByTestId('quick-add-account').click();
  await page.locator('#acc-name').fill('Bank Utama');
  await page.locator('#acc-balance').fill(balance);
  await page.getByRole('button', { name: 'Simpan rekening' }).click();
  await expect(
    page.getByTestId('account-card').filter({ hasText: 'Bank Utama' }),
  ).toBeVisible();
}

async function openInvestment(page: Page): Promise<void> {
  await page.getByTestId('quick-add-investment').click();
  await expect(
    page.getByRole('heading', { name: 'Tambah investasi' }),
  ).toBeVisible();
}

test('investment form shows fields only for the selected category', async ({
  page,
}) => {
  await setup(page);
  await addAccount(page);
  await openInvestment(page);

  await page.locator('#inv-category').selectOption('Saham');
  await expect(page.locator('#inv-lots')).toBeVisible();
  await expect(page.locator('#inv-stock-price')).toBeVisible();
  await expect(page.locator('#inv-tenor')).toHaveCount(0);
  await expect(page.locator('#inv-nab')).toHaveCount(0);
  await expect(page.locator('#inv-gold-grams')).toHaveCount(0);

  await page.locator('#inv-category').selectOption('Reksa Dana');
  await expect(page.locator('#inv-nib')).toBeVisible();
  await expect(page.locator('#inv-nab')).toBeVisible();
  await expect(page.locator('#inv-units')).toBeVisible();
  await expect(page.locator('#inv-lots')).toHaveCount(0);
  await expect(page.locator('#inv-tenor')).toHaveCount(0);

  await page.locator('#inv-category').selectOption('Emas');
  await expect(page.locator('#inv-gold-buy')).toBeVisible();
  await expect(page.locator('#inv-gold-grams')).toBeVisible();
  await expect(page.locator('#inv-gold-current')).toBeVisible();
  await expect(page.locator('#inv-principal')).toHaveCount(0);
  await expect(
    page.getByText('Nilai investasi dihitung otomatis'),
  ).toBeVisible();

  await page.locator('#inv-category').selectOption('Deposito');
  await expect(page.locator('#inv-tenor')).toBeVisible();
  await expect(page.locator('#inv-lots')).toHaveCount(0);

  await page.locator('#inv-category').selectOption('P2P Lending');
  await expect(page.locator('#inv-rate')).toBeVisible();
  await expect(page.locator('#inv-tenor')).toHaveCount(0);

  await page.getByRole('button', { name: 'Tutup dialog' }).click();
});

test('category values, editing, net worth, and charts update', async ({
  page,
}) => {
  await setup(page);
  await addAccount(page);

  // Saham: 10 lots × 100 × Rp 1.500 = Rp 1.500.000.
  await openInvestment(page);
  await page.locator('#inv-category').selectOption('Saham');
  await page.locator('#inv-name').fill('BBCA');
  await page.locator('#inv-principal').fill('1000000');
  await page.locator('#inv-lots').fill('10');
  await page.locator('#inv-stock-price').fill('1500');
  await page.getByRole('dialog').getByRole('button', { name: 'Tambah investasi' }).click();
  await expect(page.getByText('BBCA')).toBeVisible();
  await expect(
    page.getByTestId('investment-card').filter({ hasText: 'BBCA' }).getByTestId('investment-current-value'),
  ).toBeVisible();

  // Reksa Dana: NIB takes precedence over unit × NAB.
  await openInvestment(page);
  await page.locator('#inv-category').selectOption('Reksa Dana');
  await page.locator('#inv-name').fill('RD Pasar Uang');
  await page.locator('#inv-principal').fill('1000000');
  await page.locator('#inv-nib').fill('1100000');
  await page.locator('#inv-nab').fill('1100');
  await page.locator('#inv-units').fill('1000');
  await expect(page.getByTestId('current-value-preview')).toContainText(
    '1.100.000',
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Tambah investasi' }).click();
  await expect(page.getByText('RD Pasar Uang')).toBeVisible();

  // Emas: manual current price wins over the market reference.
  await openInvestment(page);
  await page.locator('#inv-category').selectOption('Emas');
  await page.locator('#inv-name').fill('Emas Antam');
  await page.locator('#inv-gold-buy').fill('1000000');
  await page.locator('#inv-gold-grams').fill('1');
  await page.locator('#inv-gold-current').fill('1500000');
  await expect(page.getByTestId('current-value-preview')).toContainText(
    '1.500.000',
  );
  await page.getByRole('dialog').getByRole('button', { name: 'Tambah investasi' }).click();
  await expect(page.getByText('Emas Antam')).toBeVisible();
  await expect(page.getByText('Harga emas acuan', { exact: true })).toBeVisible();

  // Income transaction updates cash and the cashflow chart.
  await page.getByTestId('quick-add-transaction').click();
  await page.locator('#tx-type').selectOption('income');
  await page.locator('#tx-category').fill('Gaji');
  await page.locator('#tx-amount').fill('500000');
  await page.getByRole('button', { name: 'Simpan transaksi' }).click();
  await expect(
    page.getByTestId('transaction-row').filter({ hasText: 'Gaji' }),
  ).toBeVisible();

  // Net worth: 10.5m cash + 1.5m + 1.1m + 1.5m = 14.6m.
  await expect(page.getByTestId('net-worth')).toContainText('14.600.000');
  await expect(page.getByText('Alokasi portofolio')).toBeVisible();
  await expect(page.getByText('Arus kas 6 bulan')).toBeVisible();
  await expect(page.getByText('Saham', { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText('Reksa Dana', { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText('Emas', { exact: true }).first()).toBeVisible();

  // Edit the Saham price: 10 × 100 × Rp 2.000 = Rp 2.000.000.
  await page.getByRole('button', { name: 'Ubah investasi BBCA' }).click();
  await expect(
    page.getByRole('heading', { name: 'Ubah investasi' }),
  ).toBeVisible();
  await page.locator('#inv-stock-price').fill('2000');
  await page.getByRole('dialog').getByRole('button', { name: 'Simpan perubahan' }).click();
  await expect(
    page.getByTestId('investment-card').filter({ hasText: 'BBCA' }).getByTestId('investment-current-value'),
  ).toBeVisible();
  // Net worth increases by Rp 500.000 to Rp 15.100.000.
  await expect(page.getByTestId('net-worth')).toContainText('15.100.000');
});


test('idx snapshot fetches a stock price and fills current value', async ({
  page,
}) => {
  await setup(page);

  await openInvestment(page);
  await page.locator('#inv-category').selectOption('Saham');
  await page.locator('#inv-name').fill('BBCA');
  await page.locator('#inv-stock-code').fill('bbca');
  await page.getByRole('button', { name: 'Ambil harga' }).click();

  const price = await page.locator('#inv-stock-price').inputValue();
  expect(Number(price)).toBeGreaterThan(0);
  await page.locator('#inv-lots').fill('10');
  const expected = new Intl.NumberFormat('id-ID').format(Number(price) * 1000);
  await expect(page.getByTestId('current-value-preview')).toContainText(
    expected,
  );
  await page.locator('#inv-principal').fill('1000000');
  await page.getByRole('dialog').getByRole('button', { name: 'Tambah investasi' }).click();

  await expect(
    page.getByTestId('investment-card').filter({ hasText: 'BBCA' })
      .getByTestId('investment-current-value'),
  ).toContainText(expected);

  await page.getByRole('button', { name: 'Buka pengaturan' }).click();
  await expect(
    page.getByRole('heading', { name: 'Harga saham (snapshot)' }),
  ).toBeVisible();
  await expect(page.getByText(/ihsg\.midoriresearch\.com/)).toBeVisible();
});
