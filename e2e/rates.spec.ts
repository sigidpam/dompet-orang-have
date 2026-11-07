import { expect, test } from '@playwright/test';

test('opt-in FX sync updates rates and IDR totals', async ({ page }) => {
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
  await page.locator('#acc-name').fill('USD Account');
  await page.locator('#acc-currency').fill('USD');
  await page.locator('#acc-balance').fill('10');
  await page.getByRole('button', { name: 'Simpan rekening' }).click();
  await expect(page.getByText(/Kurs USD belum diatur/).first()).toBeVisible();

  let requestedUrl = '';
  await page.route('https://api.frankfurter.dev/**', async (route) => {
    requestedUrl = route.request().url();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        amount: 1,
        base: 'IDR',
        date: '2026-11-06',
        rates: { USD: 0.0000625 },
      }),
    });
  });

  await page.getByRole('button', { name: 'Buka pengaturan' }).click();
  await page.getByRole('button', { name: 'Ambil kurs' }).click();
  await expect(page.getByText(/1 kurs diperbarui/)).toBeVisible();
  await expect(page.getByText(/1 USD = 16\.000 IDR/)).toBeVisible();
  expect(requestedUrl).toContain('api.frankfurter.dev');
  expect(requestedUrl).toContain('to=USD');

  await page.getByRole('button', { name: 'Tutup dialog' }).click();
  await expect(
    page
      .locator('article')
      .filter({ hasText: 'Dana Liquid / Cash' })
      .getByText(/160\.000/),
  ).toBeVisible();
  await expect(page.getByText(/Kurs USD belum diatur/)).toHaveCount(0);
});
