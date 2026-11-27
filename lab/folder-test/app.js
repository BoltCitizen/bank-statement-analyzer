'use strict';
// Ordner-Test: prüft, ob ein per showDirectoryPicker gewählter Ordner
// (z. B. ein Cryptomator-Tresor über den Android-Dokumentanbieter)
// lesbar und beschreibbar ist und den Neustart ohne Nachfrage übersteht.
// Keine Netzwerkzugriffe; alles bleibt im gewählten Ordner und im Browser.

(function () {
  const DB_NAME = 'ordner-test';
  const STORE = 'handles';
  const KEY = 'ordner';
  const LS_GERAET = 'ordner-test.geraet';
  const LS_INHALT = 'ordner-test.letzter-inhalt';

  const $ = (id) => document.getElementById(id);
  const el = {
    geraet: $('geraet'), waehlen: $('waehlen'), starten: $('starten'),
    erneut: $('erneut'), ordner: $('ordner'), kopieren: $('kopieren'),
    liste: $('pruefungen'), titel: $('ergebnis-titel'), fehler: $('fehler'),
  };

  let handle = null;
  let laeuft = false;
  let ergebnisse = [];
  let lauf = '';

  // ---------- IndexedDB ----------
  function db() {
    return new Promise((resolve, reject) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }
  async function idb(mode, fn) {
    const d = await db();
    try {
      return await new Promise((resolve, reject) => {
        const tx = d.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } finally { d.close(); }
  }
  const handleSpeichern = (h) => idb('readwrite', (s) => s.put(h, KEY));
  const handleLaden = () => idb('readonly', (s) => s.get(KEY));

  // ---------- localStorage (nur Komfort) ----------
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* egal */ } }

  // ---------- Gerätename ----------
  function vorgabeGeraet() {
    const mobil = (navigator.userAgentData && navigator.userAgentData.mobile) ||
      /Android|iPhone|Mobile/i.test(navigator.userAgent);
    return mobil ? 'Handy' : 'Laptop';
  }
  function geraet() {
    const roh = (el.geraet.value.trim() || el.geraet.placeholder);
    const sauber = roh.replace(/[^A-Za-z0-9ÄÖÜäöüß-]+/g, '-').replace(/^-+|-+$/g, '');
    return sauber || vorgabeGeraet();
  }

  // ---------- Anzeige ----------
  function fehlerZeigen(t) { el.fehler.textContent = t || ''; }
  function fehlerText(e) {
    if (!e) return 'Unbekannter Fehler';
    return (e.name ? e.name + ': ' : '') + (e.message || String(e));
  }
  function zeile(name, status, detail) {
    ergebnisse.push({ name, status, detail: detail || '' });
    const li = document.createElement('li');
    li.className = status === 'OK' ? 'ok' : status === 'Info' ? 'info' : 'fehlgeschlagen';
    const n = document.createElement('span'); n.className = 'name'; n.textContent = name;
    const s = document.createElement('span'); s.className = 'status';
    s.textContent = status === 'OK' ? 'OK' : status === 'Info' ? 'Info' : 'Fehlgeschlagen';
    li.append(n, s);
    if (detail) {
      const d = document.createElement('span'); d.className = 'detail'; d.textContent = detail;
      li.append(d);
    }
    el.liste.append(li);
  }
  // Führt eine Prüfung aus; Rückgabe: Ergebnis oder undefined bei Fehler.
  async function pruefe(name, fn) {
    try {
      const r = await fn();
      const detail = r && typeof r === 'object' && 'detail' in r ? r.detail : (r == null ? '' : String(r));
      const status = r && typeof r === 'object' && r.status ? r.status : 'OK';
      zeile(name, status, detail);
      return status === 'OK' || status === 'Info' ? (r && r.wert !== undefined ? r.wert : true) : undefined;
    } catch (e) {
      zeile(name, 'Fehlgeschlagen', fehlerText(e));
      return undefined;
    }
  }
  function neuerLauf(titel) {
    ergebnisse = [];
    lauf = titel;
    el.liste.textContent = '';
    el.titel.textContent = titel;
    fehlerZeigen('');
  }
  function knoepfe() {
    const vorhanden = typeof window.showDirectoryPicker === 'function';
    el.waehlen.disabled = laeuft || !vorhanden;
    el.starten.disabled = laeuft || !handle;
    el.erneut.disabled = laeuft || !handle;
    el.kopieren.disabled = laeuft || ergebnisse.length === 0;
    el.geraet.disabled = laeuft;
    el.ordner.textContent = handle ? 'Ordner: ' + handle.name : 'Kein Ordner gewählt';
  }

  // ---------- Dateihilfen ----------
  async function schreiben(dir, name, text) {
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(text);
    await w.close();
    return fh;
  }
  async function lesen(dir, name) {
    const fh = await dir.getFileHandle(name);
    return (await fh.getFile()).text();
  }
  const bytes = (t) => new TextEncoder().encode(t).length;
  const warte = (ms) => new Promise((r) => setTimeout(r, ms));
  const WARTEZEITEN = [500, 1000, 2000, 4000, 8000]; // zusammen 15,5 s
  // Liest zurück und vergleicht. Stimmt es nicht sofort, wird mit frischem
  // Handle mehrmals nachgelesen, um verzögerte Anbieter zu erkennen.
  async function zuruecklesen(dir, name, soll) {
    const start = performance.now();
    const fh0 = await dir.getFileHandle(name);
    const f0 = await fh0.getFile();
    const ist0 = await f0.text();
    if (ist0 === soll) return 'Inhalt stimmt (' + bytes(soll) + ' Byte)';
    const sofort = 'sofort ' + f0.size + ' Byte gelesen, erwartet ' + bytes(soll) + ' Byte';
    let letzt = ist0, groesse = f0.size;
    for (const ms of WARTEZEITEN) {
      await warte(ms);
      const f = await (await dir.getFileHandle(name)).getFile();
      letzt = await f.text(); groesse = f.size;
      if (letzt === soll) {
        const sek = ((performance.now() - start) / 1000).toFixed(1).replace('.', ',');
        return { status: 'Info', detail: sofort + '; richtig nach ' + sek + ' s' };
      }
    }
    throw new Error(sofort + '; nach 15 s noch ' + groesse + ' Byte: ' + JSON.stringify(letzt.slice(0, 40)));
  }
  async function auflisten(dir) {
    const namen = [];
    for await (const [name, h] of dir.entries()) namen.push(h.kind === 'directory' ? name + '/' : name);
    namen.sort((a, b) => a.localeCompare(b, 'de'));
    return namen;
  }
  function kurz(namen, max) {
    if (namen.length === 0) return '(leer)';
    const teil = namen.slice(0, max).join(', ');
    return namen.length > max ? teil + ', … (+' + (namen.length - max) + ')' : teil;
  }
  function inhalt(art) {
    return [
      'Ordner-Test ' + art,
      'Gerät: ' + geraet(),
      'Zeit: ' + new Date().toISOString(),
      'Zufall: ' + Math.random().toString(36).slice(2),
      'Umlaute: ÄÖÜäöüß €',
    ].join('\n') + '\n';
  }
  const namen = () => {
    const g = geraet();
    return { datei: 'ordnertest-' + g + '.txt', unterordner: 'ordnertest-' + g, marker: 'marker-' + g + '.txt' };
  };

  async function berechtigung(h, nachfragen) {
    const opt = { mode: 'readwrite' };
    if (typeof h.queryPermission !== 'function') return 'granted (keine Abfrage möglich)';
    let st = await h.queryPermission(opt);
    if (st !== 'granted' && nachfragen) st = await h.requestPermission(opt);
    return st;
  }

  async function fremdeMarker(dir) {
    const eigene = namen().marker;
    const gefunden = [];
    for await (const [name, h] of dir.entries()) {
      if (h.kind === 'file' && /^marker-.+\.txt$/.test(name) && name !== eigene) {
        const t = await (await h.getFile()).text();
        const zeit = (t.match(/^Zeit: (.*)$/m) || [])[1] || '?';
        gefunden.push(name + ' (' + zeit + ')');
      }
    }
    gefunden.sort();
    return gefunden.length
      ? { status: 'Info', detail: gefunden.join('\n') }
      : { status: 'Info', detail: 'Keine' };
  }

  // ---------- Test starten ----------
  async function testStarten() {
    if (!handle || laeuft) return;
    laeuft = true; knoepfe();
    neuerLauf('Ergebnis: Test starten');
    const n = namen();
    try {
      const st = await pruefe('Berechtigung Lesen und Schreiben', async () => {
        const s = await berechtigung(handle, true);
        if (!String(s).startsWith('granted')) throw new Error('Status: ' + s);
        return s;
      });
      if (st === undefined) return;

      await pruefe('Ordner auflisten', async () => {
        const l = await auflisten(handle);
        return l.length + ' Einträge: ' + kurz(l, 15);
      });

      const fh = await pruefe('Datei anlegen', async () => {
        const fh = await handle.getFileHandle(n.datei, { create: true });
        return { detail: n.datei, wert: fh };
      });

      let soll = inhalt('Datei');
      const geschrieben = fh && await pruefe('Datei schreiben', async () => {
        const w = await fh.createWritable();
        await w.write(soll); await w.close();
        lsSet(LS_INHALT, soll);
        return bytes(soll) + ' Byte';
      });

      geschrieben && await pruefe('Datei zurücklesen', () => zuruecklesen(handle, n.datei, soll));

      geschrieben && await pruefe('Datei überschreiben ohne Kopie', async () => {
        soll = inhalt('Datei überschrieben');
        await schreiben(handle, n.datei, soll);
        lsSet(LS_INHALT, soll);
        const r = await zuruecklesen(handle, n.datei, soll);
        const stamm = n.datei.replace(/\.txt$/, '');
        const kopien = (await auflisten(handle)).filter((x) => x.startsWith(stamm) && /\(\d+\)/.test(x.slice(stamm.length)));
        if (kopien.length) throw new Error('Kopien gefunden: ' + kopien.join(', '));
        return typeof r === 'string' ? r + ', keine Kopie' : { status: r.status, detail: r.detail + ', keine Kopie' };
      });

      const ud = await pruefe('Unterordner anlegen', async () => {
        const d = await handle.getDirectoryHandle(n.unterordner, { create: true });
        return { detail: n.unterordner + '/', wert: d };
      });

      ud && await pruefe('Datei im Unterordner schreiben und lesen', async () => {
        const t = inhalt('Unterordner');
        await schreiben(ud, 'inhalt.txt', t);
        return zuruecklesen(ud, 'inhalt.txt', t);
      });

      await pruefe('Marker mit Gerätename hinterlassen', async () => {
        const t = inhalt('Marker');
        await schreiben(handle, n.marker, t);
        return zuruecklesen(handle, n.marker, t);
      });

      await pruefe('Marker anderer Geräte', () => fremdeMarker(handle));

      await pruefe('Ordner für „Erneut prüfen“ merken', async () => {
        await handleSpeichern(handle);
        const zurueck = await handleLaden();
        if (!zurueck) throw new Error('Nicht gespeichert');
        return 'gespeichert';
      });

      await pruefe('Speicher dauerhaft', speicherDauerhaft);
    } finally {
      laeuft = false; knoepfe();
    }
  }

  async function speicherDauerhaft() {
    if (!navigator.storage || !navigator.storage.persisted) return { status: 'Info', detail: 'Nicht abfragbar' };
    let p = await navigator.storage.persisted();
    if (!p && navigator.storage.persist) p = await navigator.storage.persist();
    return { status: 'Info', detail: p ? 'ja' : 'nein (Browser darf gespeicherten Ordner löschen)' };
  }

  // ---------- Erneut prüfen ----------
  async function erneutPruefen() {
    if (laeuft) return;
    laeuft = true; knoepfe();
    neuerLauf('Ergebnis: Erneut prüfen');
    const n = namen();
    try {
      const h = await pruefe('Gemerkter Ordner vorhanden', async () => {
        const g = await handleLaden();
        if (!g) throw new Error('Kein Ordner gemerkt. Erst „Test starten“.');
        handle = g;
        return { detail: g.name, wert: g };
      });
      if (!h) return;

      const st = await pruefe('Berechtigung ohne Nachfrage', async () => {
        const s = await berechtigung(h, false);
        if (!String(s).startsWith('granted')) {
          throw new Error('Status: ' + s + ' (Browser würde nachfragen)');
        }
        return s;
      });

      if (st === undefined) {
        await pruefe('Berechtigung mit Nachfrage', async () => {
          const s = await berechtigung(h, true);
          if (!String(s).startsWith('granted')) throw new Error('Status: ' + s);
          return s + ' nach Nachfrage';
        });
      }

      await pruefe('Ordner auflisten', async () => {
        const l = await auflisten(h);
        return l.length + ' Einträge: ' + kurz(l, 15);
      });

      await pruefe('Eigene Testdatei lesen', async () => {
        const f = await (await h.getFileHandle(n.datei)).getFile();
        const ist = await f.text();
        const soll = lsGet(LS_INHALT);
        const zeile1 = JSON.stringify(ist.split('\n')[0] || '');
        if (soll && ist !== soll) {
          throw new Error(f.size + ' Byte gelesen, erwartet ' + bytes(soll) + ' Byte: ' + zeile1);
        }
        return (soll ? 'Inhalt stimmt' : 'Vergleich nicht möglich') + ' (' + f.size + ' Byte): ' + zeile1;
      });

      await pruefe('Eigene Testdatei schreiben', async () => {
        const t = inhalt('Datei nach Erneut prüfen');
        await schreiben(h, n.datei, t);
        lsSet(LS_INHALT, t);
        return zuruecklesen(h, n.datei, t);
      });

      await pruefe('Unterordner lesen', async () => {
        const d = await h.getDirectoryHandle(n.unterordner);
        await lesen(d, 'inhalt.txt');
        return n.unterordner + '/inhalt.txt';
      });

      await pruefe('Marker anderer Geräte', () => fremdeMarker(h));
      await pruefe('Speicher dauerhaft', speicherDauerhaft);
    } finally {
      laeuft = false; knoepfe();
    }
  }

  // ---------- Ordner wählen ----------
  async function ordnerWaehlen() {
    if (laeuft) return;
    fehlerZeigen('');
    let h;
    try {
      h = await window.showDirectoryPicker({ id: 'ordner-test', mode: 'readwrite' });
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      neuerLauf('Ergebnis: Ordner wählen');
      zeile('Ordner wählen', 'Fehlgeschlagen', fehlerText(e));
      knoepfe();
      return;
    }
    handle = h;
    knoepfe();
    await testStarten();
  }

  // ---------- Kopieren ----------
  function berichtText() {
    const kopf = [
      lauf,
      'Zeit: ' + new Date().toISOString(),
      'Gerät: ' + geraet(),
      'Ordner: ' + (handle ? handle.name : '-'),
      'Browser: ' + navigator.userAgent,
      'Seite: ' + location.href,
      '',
    ];
    const z = ergebnisse.map((r) => {
      const s = r.status === 'OK' ? 'OK' : r.status === 'Info' ? 'Info' : 'FEHLGESCHLAGEN';
      return s + ' | ' + r.name + (r.detail ? ' | ' + r.detail.replace(/\n/g, '; ') : '');
    });
    return kopf.concat(z).join('\n');
  }
  async function kopieren() {
    const t = berichtText();
    let ok = false;
    try { await navigator.clipboard.writeText(t); ok = true; } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.append(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
    }
    if (!ok) { fehlerZeigen('Kopieren ging nicht.'); return; }
    // Haken statt Text, gleich breit, etwa 2 Sekunden
    const b = el.kopieren;
    b.style.minWidth = b.offsetWidth + 'px';
    b.textContent = '✓';
    setTimeout(() => { b.textContent = 'Kopieren'; b.style.minWidth = ''; }, 2000);
  }

  // ---------- Start ----------
  el.geraet.placeholder = vorgabeGeraet();
  el.geraet.value = lsGet(LS_GERAET) || '';
  el.geraet.addEventListener('change', () => lsSet(LS_GERAET, el.geraet.value.trim()));
  el.waehlen.addEventListener('click', ordnerWaehlen);
  el.starten.addEventListener('click', testStarten);
  el.erneut.addEventListener('click', erneutPruefen);
  el.kopieren.addEventListener('click', kopieren);

  if (typeof window.showDirectoryPicker !== 'function') {
    fehlerZeigen('Dieser Browser kann keinen Ordner öffnen (showDirectoryPicker fehlt).');
  }
  handleLaden().then((h) => { if (h) handle = h; knoepfe(); }, () => knoepfe());
  knoepfe();
})();
