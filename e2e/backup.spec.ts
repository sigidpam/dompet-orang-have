import { expect, test } from '@playwright/test';

test('encrypted backup export and import round-trip', async ({ page }) => {
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
  await page.locator('#acc-name').fill('Rekening Asli');
  await page.locator('#acc-balance').fill('100');
  await page.getByRole('button', { name: 'Simpan rekening' }).click();
  await expect(
    page.getByTestId('account-card').filter({ hasText: 'Rekening Asli' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Buka pengaturan' }).click();
  await page.getByRole('button', { name: /Backup terenkripsi/ }).click();
  await page.locator('#backup-pass').fill('backup passphrase 123');
  await page.locator('#backup-pass-confirm').fill('backup passphrase 123');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Unduh backup' }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();
  expect(backupPath).toBeTruthy();

  await page.getByTestId('quick-add-account').click();
  await page.locator('#acc-name').fill('Rekening Sementara');
  await page.locator('#acc-balance').fill('50');
  await page.getByRole('button', { name: 'Simpan rekening' }).click();
  await expect(
    page.getByTestId('account-card').filter({ hasText: 'Rekening Sementara' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Buka pengaturan' }).click();
  await page.getByRole('button', { name: 'Impor backup' }).click();
  await page.locator('#import-file').setInputFiles(backupPath ?? '');
  await page.locator('#import-pass').fill('backup passphrase 123');
  await page.getByRole('button', { name: 'Impor & ganti data' }).click();

  await expect(
    page.getByTestId('account-card').filter({ hasText: 'Rekening Asli' }),
  ).toBeVisible();
  await expect(
    page.getByTestId('account-card').filter({ hasText: 'Rekening Sementara' }),
  ).toHaveCount(0);
});
