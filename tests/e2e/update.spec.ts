import { expect, test } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';

// Runs against the real production build (dist/) with its service worker.
// The server can switch sw.js to a "new version" to check the update gate.
const DIST = join(process.cwd(), 'dist');
const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
};

let server: Server;
let port = 0;
let release = 'A';

test.beforeAll(async () => {
  test.skip(!existsSync(join(DIST, 'sw.js')), 'needs npm run build first');
  server = createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname.replace(/^\//, '') || 'index.html';
    const file = join(DIST, path);
    if (!existsSync(file)) return void res.writeHead(404).end();
    let body = readFileSync(file);
    if (path === 'sw.js' && release === 'B') {
      body = Buffer.from(
        body.toString().replace(/const VERSION = "[^"]*";/, 'const VERSION = "neu";').replace(/const CHANGES = \[[^\]]*\];/, 'const CHANGES = ["Teständerung"];'),
      );
    }
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(body);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  port = (server.address() as { port: number }).port;
});

test.afterAll(() => server?.close());

test('a new version only takes over after "Aktualisieren"', async ({ page, browserName }, info) => {
  test.skip(info.project.name !== 'laptop' || browserName !== 'chromium');
  const url = `http://127.0.0.1:${port}/`;
  release = 'A';
  const errors: string[] = [];
  page.on('console', (m) => void (m.type() === 'error' && errors.push(m.text())));
  await page.goto(url);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  release = 'B';
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update());
  const bar = page.getByRole('button', { name: 'Aktualisieren' });
  await expect(bar).toBeVisible();
  await expect(page.getByText('neu ·')).toBeVisible();
  await expect(page.getByText('Teständerung')).toBeVisible();

  // Without the tap, a reload still runs the old version.
  await page.reload();
  const active = () => page.evaluate(() => {
    const ch = new MessageChannel();
    return new Promise<string>((r) => {
      ch.port1.onmessage = (e) => r((e.data as { version: string }).version);
      navigator.serviceWorker.controller!.postMessage('info', [ch.port2]);
    });
  });
  expect(await active()).not.toBe('neu');

  await page.getByRole('button', { name: 'Aktualisieren' }).click();
  await page.waitForEvent('load');
  expect(await active()).toBe('neu');
  await expect(page.getByRole('button', { name: 'Aktualisieren' })).toHaveCount(0);
  expect(errors).toEqual([]); // includes CSP violations
});

test('the service worker leaves /lab/ alone', async ({ page }, info) => {
  test.skip(info.project.name !== 'laptop');
  release = 'A';
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  const res = await page.goto(`http://127.0.0.1:${port}/lab/nothing.html`);
  expect(res?.status()).toBe(404); // a handled navigation would have returned the app page
  expect(res?.fromServiceWorker()).toBe(false);
});
