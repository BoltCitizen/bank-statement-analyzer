'use strict';
// Browser test for the folder test page. The folder picker is replaced by the
// origin private file system (same handle API), so no real folder is touched.
// Run: node --test lab/folder-test/*.test.cjs
const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const DIR = __dirname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

function serve() {
  const server = http.createServer((req, res) => {
    const name = req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0].slice(1);
    const file = path.join(DIR, path.basename(name));
    if (!fs.existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': (TYPES[path.extname(file)] || 'text/plain') + '; charset=utf-8' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server)));
}

async function rows(page) {
  return page.$$eval('#pruefungen li', (lis) => lis.map((li) => ({
    name: li.querySelector('.name').textContent,
    status: li.querySelector('.status').textContent,
    detail: (li.querySelector('.detail') || {}).textContent || '',
  })));
}

test('Test starten, Marker eines anderen Geräts, Erneut prüfen nach Neuladen', async () => {
  const server = await serve();
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext();
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url });
    await ctx.addInitScript(() => {
      window.showDirectoryPicker = async () => {
        const root = await navigator.storage.getDirectory();
        return root.getDirectoryHandle('tresor', { create: true });
      };
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(url);

    // Another device left a marker earlier.
    await page.evaluate(async () => {
      const d = await window.showDirectoryPicker();
      const w = await (await d.getFileHandle('marker-Laptop.txt', { create: true })).createWritable();
      await w.write('Ordner-Test Marker\nGerät: Laptop\nZeit: 2026-11-26T08:00:00.000Z\n'); await w.close();
    });

    await page.fill('#geraet', 'Handy');
    await page.click('#waehlen');
    await page.waitForFunction(() => !document.getElementById('erneut').disabled);
    let r = await rows(page);
    const failed = r.filter((x) => x.status === 'Fehlgeschlagen');
    assert.deepStrictEqual(failed, [], JSON.stringify(failed));
    assert.ok(r.length >= 11, 'expected all checks, got ' + r.length);
    const fremd = r.find((x) => x.name === 'Marker anderer Geräte');
    assert.match(fremd.detail, /marker-Laptop\.txt \(2026-11-26T08:00:00\.000Z\)/);

    const files = await page.evaluate(async () => {
      const d = await window.showDirectoryPicker();
      const out = [];
      for await (const [n] of d.entries()) out.push(n);
      return out.sort();
    });
    assert.deepStrictEqual(files, ['marker-Handy.txt', 'marker-Laptop.txt', 'ordnertest-Handy', 'ordnertest-Handy.txt']);

    await page.click('#kopieren');
    await page.waitForFunction(() => document.getElementById('kopieren').textContent === '✓');
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(clip, /^Ergebnis: Test starten/);
    assert.match(clip, /OK \| Datei überschreiben ohne Kopie/);

    // "Restart": reload page; the stored handle must work without the picker.
    await page.evaluate(() => { window.showDirectoryPicker = () => { throw new Error('picker must not be used'); }; });
    await page.reload();
    await page.waitForFunction(() => !document.getElementById('erneut').disabled);
    await page.click('#erneut');
    await page.waitForFunction(() => !document.getElementById('erneut').disabled && document.querySelectorAll('#pruefungen li').length > 3);
    r = await rows(page);
    const failed2 = r.filter((x) => x.status === 'Fehlgeschlagen');
    assert.deepStrictEqual(failed2, [], JSON.stringify(failed2));
    assert.ok(r.some((x) => x.name === 'Berechtigung ohne Nachfrage' && x.status === 'OK'));
    assert.ok(r.some((x) => x.name === 'Eigene Testdatei lesen' && x.detail.startsWith('Inhalt stimmt ('))) ;

    assert.deepStrictEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});

test('Verzögerter Anbieter: leer direkt nach Schreiben, später richtig', async () => {
  const server = await serve();
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => {
      window.showDirectoryPicker = async () => (await navigator.storage.getDirectory()).getDirectoryHandle('tresor2', { create: true });
      const zuletzt = new Map();
      const cw = FileSystemFileHandle.prototype.createWritable;
      FileSystemFileHandle.prototype.createWritable = async function (...a) {
        const w = await cw.apply(this, a);
        const close = w.close.bind(w);
        const name = this.name;
        w.close = async () => { await close(); zuletzt.set(name, Date.now()); };
        return w;
      };
      const gf = FileSystemFileHandle.prototype.getFile;
      FileSystemFileHandle.prototype.getFile = async function () {
        const t = zuletzt.get(this.name);
        if (t && Date.now() - t < 1200) return new File([], this.name);
        return gf.call(this);
      };
    });
    const page = await ctx.newPage();
    await page.goto(url);
    await page.fill('#geraet', 'Handy');
    await page.click('#waehlen');
    await page.waitForFunction(() => !document.getElementById('erneut').disabled, null, { timeout: 60000 });
    const r = await rows(page);
    assert.deepStrictEqual(r.filter((x) => x.status === 'Fehlgeschlagen'), []);
    const z = r.find((x) => x.name === 'Datei zurücklesen');
    assert.strictEqual(z.status, 'Info');
    assert.match(z.detail, /^sofort 0 Byte gelesen, erwartet \d+ Byte; richtig nach \d+,\d s$/);
  } finally {
    await browser.close();
    server.close();
  }
});

test('Ohne showDirectoryPicker: Hinweis unten, Ordner wählen gesperrt', async () => {
  const server = await serve();
  const url = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => { delete window.showDirectoryPicker; });
    const page = await ctx.newPage();
    await page.goto(url);
    assert.match(await page.textContent('#fehler'), /showDirectoryPicker fehlt/);
    assert.strictEqual(await page.isDisabled('#waehlen'), true);
  } finally {
    await browser.close();
    server.close();
  }
});
