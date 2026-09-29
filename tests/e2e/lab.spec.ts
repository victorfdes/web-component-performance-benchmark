import { expect, test } from '@playwright/test';

test('dashboard presents the neutral benchmark controls @smoke', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /AngularJS vs Web Components in forms/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Run comparison/ })).toBeEnabled();
  await expect(page.getByText('No evidence collected yet.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open AngularJS form' })).toHaveAttribute('href', /variant=angular/);
});

test('AngularJS-hosted Web Component reaches an interactive, prefilled state @smoke', async ({ page }) => {
  await page.goto('/?variant=web-component&preset=small&seed=2026&runs=1&latency=0&cache=warm#/claim');
  await expect(page.locator('#metric-ready')).not.toHaveText('—');
  await expect(page.locator('#metric-fields')).toHaveText('300');
  await expect(page.locator('.web-component-boundary > claim-form-host > claim-form')).toHaveCount(1);
  await expect(page.getByText('Web Component form · mounted by AngularJS · Shadow DOM')).toBeVisible();
  await expect(page.locator('#payload-meta')).toContainText('KB');
});

test('AngularJS and Web Component produce identical payloads', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Full equivalence is covered once; other engines run smoke coverage.');
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });
  const presets: Array<[string, string]> = [['small', '300'], ['standard', '1,000'], ['stress', '3,000']];
  for (const [preset, fieldCount] of presets) {
    const checksums: string[] = [];
    for (const variant of ['angular', 'web-component']) {
      await page.goto(`/?variant=${variant}&preset=${preset}&seed=2026&runs=1&latency=0&cache=warm#/claim`);
      await expect(page.locator('#metric-ready')).not.toHaveText('—');
      await expect(page.locator('#metric-fields')).toHaveText(fieldCount);
      checksums.push(await page.locator('#payload-meta').getAttribute('data-checksum') ?? '');
      await expect(page.locator(variant === 'angular' ? '.angular-boundary' : 'claim-form')).toHaveCount(1);
    }
    expect(checksums[0]).toBeTruthy();
    expect(checksums[0]).toBe(checksums[1] ?? '__missing__');
  }
  expect(runtimeErrors).toEqual([]);
});

test('representative controls remain editable and payload can be rebuilt', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Interaction coverage runs in Chromium.');
  await page.goto('/?variant=web-component&preset=small&seed=2026&runs=1&latency=0&cache=warm#/claim');
  await expect(page.locator('#metric-ready')).not.toHaveText('—');
  const firstText = page.locator('claim-form input[type="text"]').first();
  await firstText.fill('Browser test adjustment');
  await page.getByRole('button', { name: /Build payload/ }).click();
  await expect(page.locator('#payload-meta')).toContainText('issues');
});

test('dashboard completes an isolated repeated comparison and exports evidence', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'The full runner is covered once; other engines run smoke coverage.');
  await page.goto('/');
  await page.locator('#preset').selectOption('small');
  await page.locator('#runs').selectOption('5');
  await page.getByRole('button', { name: /Run comparison/ }).click();
  await expect(page.locator('#verdict strong')).not.toHaveText('No evidence collected yet.', { timeout: 120_000 });
  await expect(page.locator('#verdict')).toContainText('payloads matched');
  await expect(page.locator('.history-row').nth(1)).toContainText('Small · 300 fields');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('angular-web-component-benchmark.json');
});
