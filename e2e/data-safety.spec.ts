import { expect, test } from '@playwright/test';

test('setup never overwrites surviving ciphertext when the envelope is missing', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#setup-pin').fill('123456');
  await page.locator('#setup-pin-confirm').fill('123456');
  await page.getByRole('button', { name: /Buat vault terenkripsi/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Simpan kode pemulihan' }),
  ).toBeVisible({ timeout: 20_000 });
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /Lanjut ke dashboard/ }).click();

  await page.getByTestId('quick-add-account').click();
  await page.locator('#acc-name').fill('Data Selamat');
  await page.locator('#acc-balance').fill('100');
  await page.getByRole('button', { name: 'Simpan rekening' }).click();
  await expect(
    page.getByTestId('account-card').filter({ hasText: 'Data Selamat' }),
  ).toBeVisible();

  const envelope = await page.evaluate(() =>
    localStorage.getItem('dompet.envelope.v1'),
  );
  expect(envelope).toBeTruthy();
  await page.evaluate(() => localStorage.removeItem('dompet.envelope.v1'));
  await page.reload();

  await expect(
    page.getByRole('heading', { name: /Buat PIN untuk mengenkripsi/ }),
  ).toBeVisible();
  await page.locator('#setup-pin').fill('999999');
  await page.locator('#setup-pin-confirm').fill('999999');
  await page.getByRole('button', { name: /Buat vault terenkripsi/ }).click();
  await expect(page.getByText(/Data terenkripsi lama ditemukan/)).toBeVisible();

  await page.evaluate((value) => {
    if (value) localStorage.setItem('dompet.envelope.v1', value);
  }, envelope);
  await page.reload();
  await page.locator('#unlock-pin').fill('123456');
  await page.getByRole('button', { name: /Buka vault/ }).click();
  await expect(
    page.getByTestId('account-card').filter({ hasText: 'Data Selamat' }),
  ).toBeVisible({ timeout: 20_000 });
});

test('forgotten-PIN reset accepts case-insensitive confirmation', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#setup-pin').fill('123456');
  await page.locator('#setup-pin-confirm').fill('123456');
  await page.getByRole('button', { name: /Buat vault terenkripsi/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Simpan kode pemulihan' }),
  ).toBeVisible({ timeout: 20_000 });
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /Lanjut ke dashboard/ }).click();
  await page.getByRole('button', { name: /Kunci vault/ }).click();

  await page.getByRole('button', { name: /Lupa PIN/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Hapus semua data lokal' }),
  ).toBeVisible();
  await page.locator('#reset-confirm').fill('hapus');
  await expect(page.locator('#reset-confirm')).toHaveValue('hapus');
  const confirm = page.getByRole('button', { name: 'Hapus permanen' });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(
    page.getByRole('heading', { name: /Buat PIN untuk mengenkripsi/ }),
  ).toBeVisible();
});
