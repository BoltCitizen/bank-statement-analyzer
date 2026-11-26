import type { Page } from '@playwright/test';

export const deviceLine = (id: string, name: string, seq = 1) =>
  JSON.stringify({ id: `${id}:${seq}`, device: id, seq, ts: '2026-01-01T10:00:00.000Z', action: `${id}:${seq}`, type: 'device', name }) + '\n';

/** Opens the test build with an in-memory data folder holding these files. */
export async function openWith(page: Page, files: Record<string, string> = {}, device?: string): Promise<string[]> {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(
    ([seed, dev]) => {
      (window as unknown as Record<string, unknown>).__BSA_SEED__ = seed;
      (window as unknown as Record<string, unknown>).__BSA_DEVICE__ = dev;
    },
    [files, device] as const,
  );
  await page.goto('./');
  return errors;
}

export async function storeFiles(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() =>
    Object.fromEntries((window as unknown as { __BSA_STORE__: { files: Map<string, string> } }).__BSA_STORE__.files),
  );
}
