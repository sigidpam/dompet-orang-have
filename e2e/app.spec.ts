import { expect, test, type Page } from '@playwright/test';

async function completeSetup(page: Page): Promise<void> {
  await expect(
    page.getByRole('heading', { name: /Buat PIN untuk mengenkripsi/ }),
  ).toBeVisible();
  await page.locator('#setup-pin').fill('123456');
  await page.locator('#setup-pin-confirm').fill('123456');
  await page.getByRole('button', { name: /Buat vault terenkripsi/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Simpan kode pemulihan' }),
  ).toBeVisible({ timeout: 20_000 });
}

async function acknowledgeRecovery(page: Page): Promise<void> {
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /Lanjut ke dashboard/ }).click();
  await expect(page.getByRole('heading', { name: 'Aset & Cashflow' })).toBeVisible();
}

async function unlock(page: Page, pin = '123456'): Promise<void> {
  await page.locator('#unlock-pin').fill(pin);
  await page.getByRole('button', { name: /Buka vault/ }).click();
}

async function addAccount(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Rekening', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Tambah rekening' }),
  ).toBeVisible();
  await page.locator('#acc-name').fill('BCA Utama');
  await page.locator('#acc-balance').fill('1000000');
  await page.getByRole('button', { name: 'Simpan rekening' }).click();
  await expect(
    page.getByTestId('account-card').filter({ hasText: 'BCA Utama' }),
  ).toBeVisible();
}

async function addTransaction(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Tambah transaksi' }).click();
  await expect(
    page.getByRole('heading', { name: 'Tambah transaksi' }),
  ).toBeVisible();
  await page.locator('#tx-category').fill('Makan');
  await page.locator('#tx-amount').fill('25000');
  await page.getByRole('button', { name: 'Simpan transaksi' }).click();
  await expect(
    page.getByTestId('transaction-row').filter({ hasText: 'Makan' }),
  ).toBeVisible();
}

test('local-first PWA: setup, encrypted persistence, lock, offline', async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) && url.protocol !== 'data:' && url.protocol !== 'blob:') {
      externalRequests.push(request.url());
    }
  });

  await page.goto('/');
  await completeSetup(page);

  const recoveryCode = (
    await page.locator('[data-recovery-code]').textContent()
  )?.trim();
  expect(recoveryCode?.length).toBeGreaterThan(20);

  await acknowledgeRecovery(page);

  await addAccount(page);
  await addTransaction(page);
  await expect(
    page.getByTestId('account-card').getByText(/975\.000/),
  ).toBeVisible();

  await page.waitForFunction(
    async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return Boolean(registration?.active);
    },
    undefined,
    { timeout: 20_000 },
  );

  await expect(
    page.locator('meta[http-equiv="Content-Security-Policy"]'),
  ).toHaveCount(1);
  const manifestHref = await page
    .locator('link[rel="manifest"]')
    .getAttribute('href');
  expect(manifestHref).toBeTruthy();
  const manifest = await page.evaluate(async (href) => {
    const response = await fetch(href ?? '');
    return response.json() as Promise<{ icons: Array<{ src: string }> }>;
  }, manifestHref);
  expect(manifest.icons.every((entry) => !entry.src.startsWith('http'))).toBe(
    true,
  );

  await page.getByRole('button', { name: /Kunci/ }).click();
  await expect(
    page.getByRole('heading', { name: /Masukkan PIN/ }),
  ).toBeVisible();

  await unlock(page, '000000');
  await expect(page.getByText('PIN salah. Coba lagi.')).toBeVisible();
  await unlock(page);
  await expect(
    page.getByRole('heading', { name: 'Aset & Cashflow' }),
  ).toBeVisible();
  await expect(
    page.getByTestId('account-card').filter({ hasText: 'BCA Utama' }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole('heading', { name: /Masukkan PIN/ }),
  ).toBeVisible();

  await page.waitForFunction(
    async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return Boolean(registration?.active);
    },
    undefined,
    { timeout: 20_000 },
  );
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: /Masukkan PIN/ }),
  ).toBeVisible({ timeout: 20_000 });
  await unlock(page);
  await expect(
    page.getByRole('heading', { name: 'Aset & Cashflow' }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByTestId('account-card').filter({ hasText: 'BCA Utama' }),
  ).toBeVisible();
  await expect(page.getByText(/Mode offline/)).toBeVisible();
  await context.setOffline(false);

  expect(externalRequests).toEqual([]);
});

test('recovery code unlocks the vault and sets a new PIN', async ({ page }) => {
  await page.goto('/');
  await completeSetup(page);
  const code = (
    await page.locator('[data-recovery-code]').textContent()
  )?.trim();
  expect(code).toBeTruthy();
  await acknowledgeRecovery(page);
  await addAccount(page);
  await page.reload();

  await page.getByRole('button', { name: /Gunakan kode pemulihan/ }).click();
  await page.locator('#recovery-input').fill(code ?? '');
  await page.getByRole('button', { name: 'Buka dengan kode' }).click();
  await expect(page.getByRole('heading', { name: 'Ubah PIN' })).toBeVisible({
    timeout: 20_000,
  });
  await page.locator('#new-pin').fill('654321');
  await page.locator('#confirm-pin').fill('654321');
  await page.getByRole('button', { name: 'Simpan PIN baru' }).click();
  await expect(
    page.getByRole('heading', { name: 'Aset & Cashflow' }),
  ).toBeVisible();

  await page.getByRole('button', { name: /Kunci/ }).click();
  await unlock(page, '123456');
  await expect(page.getByText('PIN salah. Coba lagi.')).toBeVisible();
  await unlock(page, '654321');
  await expect(
    page.getByRole('heading', { name: 'Aset & Cashflow' }),
  ).toBeVisible();
  await expect(
    page.getByTestId('account-card').filter({ hasText: 'BCA Utama' }),
  ).toBeVisible();
});
