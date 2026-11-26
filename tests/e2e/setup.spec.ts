import { expect, test } from '@playwright/test';
import { deviceLine, openWith, storeFiles } from './helpers';

test('a new device names itself and gets its own log file', async ({ page }) => {
  const errors = await openWith(page);
  await expect(page.getByRole('heading', { name: 'Neues Gerät' })).toBeVisible();
  const weiter = page.getByRole('button', { name: 'Weiter' });
  await expect(weiter).toBeDisabled();
  await page.getByLabel('Gerätename').fill('Handy');
  await weiter.click();
  await expect(page.getByRole('heading', { name: 'Umsätze' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rückgängig' })).toBeDisabled();
  const files = await storeFiles(page);
  expect(Object.keys(files)).toEqual(['log/handy.jsonl']);
  expect(JSON.parse(files['log/handy.jsonl']!.trim())).toMatchObject({ type: 'device', name: 'Handy', seq: 1 });
  expect(errors).toEqual([]);
});

test('a taken device name is refused; an existing device can be continued', async ({ page }) => {
  await openWith(page, { 'log/laptop.jsonl': deviceLine('laptop', 'Laptop') });
  await page.getByLabel('Gerätename').fill('laptop');
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(/„laptop“ gibt es in diesem Ordner schon\./);
  await page.getByRole('button', { name: 'Laptop' }).click();
  await expect(page.getByRole('heading', { name: 'Umsätze' })).toBeVisible();
  expect(Object.keys(await storeFiles(page))).toEqual(['log/laptop.jsonl']);
});

test('a known device opens directly; conflict copies show as an error', async ({ page }) => {
  await openWith(
    page,
    { 'log/handy.jsonl': deviceLine('handy', 'Handy'), 'log/handy (1).jsonl': deviceLine('handy', 'Handy') },
    'handy',
  );
  await expect(page.getByRole('heading', { name: 'Umsätze' })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveText(/Konfliktkopie gefunden: log\/handy \(1\)\.jsonl/);
});

test('settings show device and version; back returns to the start view', async ({ page }) => {
  await openWith(page, { 'log/handy.jsonl': deviceLine('handy', 'Handy') }, 'handy');
  await page.getByRole('button', { name: 'Einstellungen' }).click();
  await expect(page.getByRole('heading', { name: 'Einstellungen', level: 1 })).toBeVisible();
  await expect(page.getByText('log/handy.jsonl')).toBeVisible();
  await expect(page.getByTestId('version')).toHaveText(/^\d+$/);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Umsätze' })).toBeVisible();
});

test('touch targets are at least 48 px and buttons 56 px high', async ({ page }) => {
  await openWith(page);
  for (const b of await page.getByRole('button').all()) {
    const box = (await b.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(56);
  }
  await page.getByLabel('Gerätename').fill('Handy');
  await page.getByRole('button', { name: 'Weiter' }).click();
  for (const name of ['Rückgängig', 'Einstellungen']) {
    const box = (await page.getByRole('button', { name }).boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(48);
    expect(box.width).toBeGreaterThanOrEqual(48);
  }
});
