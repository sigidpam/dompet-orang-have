import { expect, test } from '@playwright/test';

test('finance data is rendered as inert text, never HTML', async ({ page }) => {
  const dialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });

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
  const payload = '<img src=x onerror="window.__dompetXss=1">';
  await page.locator('#acc-name').fill(payload);
  await page.locator('#acc-balance').fill('100');
  await page.getByRole('button', { name: 'Simpan rekening' }).click();

  const card = page.getByTestId('account-card').filter({ hasText: payload });
  await expect(card).toBeVisible();
  await expect(card.locator('img')).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () => (globalThis as { __dompetXss?: number }).__dompetXss ?? 0,
      ),
    )
    .toBe(0);
  expect(dialogs).toEqual([]);
});
