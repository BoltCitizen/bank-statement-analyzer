import { describe, expect, it } from 'vitest';
import { DataFolder, deviceIdFor, isConflictCopy } from '../../src/lib/folder';
import { MemoryStore } from '../../src/lib/store/memory';

function clock(start = '2026-01-01T10:00:00.000Z') {
  let t = Date.parse(start);
  return () => new Date((t += 1000));
}

async function device(store: MemoryStore, id: string, now = clock()) {
  const f = new DataFolder(store, id, now);
  await f.load();
  if (!f.state.devices.has(id)) await f.register(id);
  return f;
}

describe('device ids and conflict copies', () => {
  it('builds file-safe ids', () => {
    expect(deviceIdFor('Vincents Handy')).toBe('vincents-handy');
    expect(deviceIdFor('Läptöp ß')).toBe('laptop-ss');
    expect(deviceIdFor('!!!')).toBe('geraet');
  });
  it.each(['handy (1).jsonl', 'handy (conflicted copy 2026-01-01).jsonl', 'handy - Kopie.jsonl', 'handy_Konflikt.jsonl'])(
    'detects %s',
    (n) => expect(isConflictCopy(n)).toBe(true),
  );
  it('accepts a normal log', () => expect(isConflictCopy('handy.jsonl')).toBe(false));
});

describe('DataFolder', () => {
  it('writes only its own log and reads all logs', async () => {
    const store = new MemoryStore();
    const phone = await device(store, 'handy');
    await phone.categorize('t1', 'Lebensmittel');
    const laptop = await device(store, 'laptop', clock('2026-01-01T11:00:00.000Z'));
    expect(laptop.state.tx.get('t1')?.category).toBe('Lebensmittel');
    await laptop.categorize('t2', 'Miete');
    expect([...store.files.keys()].sort()).toEqual(['log/handy.jsonl', 'log/laptop.jsonl']);
    expect(store.files.get('log/handy.jsonl')!.split('\n').filter(Boolean)).toHaveLength(2);
  });

  it('continues the sequence after a restart', async () => {
    const store = new MemoryStore();
    const a = await device(store, 'handy');
    await a.categorize('t1', 'X');
    const again = await device(store, 'handy', clock('2026-02-01T00:00:00.000Z'));
    await again.categorize('t1', 'Y');
    const ids = store.files.get('log/handy.jsonl')!.trim().split('\n').map((l) => JSON.parse(l).id);
    expect(ids).toEqual(['handy:1', 'handy:2', 'handy:3']);
  });

  it('undo takes back the newest action step by step, without deleting log lines', async () => {
    const store = new MemoryStore();
    const f = await device(store, 'handy');
    expect(f.canUndo).toBe(false); // registering is not a step
    await f.categorize('t1', 'A');
    await f.categorize('t1', 'B');
    await f.undo();
    expect(f.state.tx.get('t1')?.category).toBe('A');
    await f.undo();
    expect(f.state.tx.has('t1')).toBe(false);
    expect(f.canUndo).toBe(false);
    expect(await f.undo()).toBeNull();
    expect(store.files.get('log/handy.jsonl')!.trim().split('\n')).toHaveLength(5);
  });

  it('marks a conflict when two devices change one transaction before syncing; the later one wins', async () => {
    const store = new MemoryStore();
    const phone = await device(store, 'handy', clock('2026-01-01T10:00:00.000Z'));
    const laptop = await device(store, 'laptop', clock('2026-01-01T10:00:30.000Z'));
    await phone.categorize('t1', 'Lebensmittel'); // laptop has not seen this
    await laptop.categorize('t1', 'Drogerie');
    const merged = await device(store, 'handy');
    const t = merged.state.tx.get('t1')!;
    expect(t.category).toBe('Drogerie');
    expect(t.conflict).toEqual({ winner: 'laptop:2', loser: 'handy:2' });
  });

  it('a change after seeing the other device is no conflict and resolves an open one', async () => {
    const store = new MemoryStore();
    const phone = await device(store, 'handy', clock('2026-01-01T10:00:00.000Z'));
    const laptop = await device(store, 'laptop', clock('2026-01-01T10:00:30.000Z'));
    await phone.categorize('t1', 'A');
    await laptop.categorize('t1', 'B'); // conflict
    await phone.load();
    expect(phone.state.tx.get('t1')!.conflict).not.toBeNull();
    await phone.categorize('t1', 'C');
    const t = phone.state.tx.get('t1')!;
    expect(t.category).toBe('C');
    expect(t.conflict).toBeNull();
  });

  it('reports conflict copies and broken lines instead of merging them', async () => {
    const store = new MemoryStore({
      'log/handy.jsonl': '{"id":"handy:1","device":"handy","seq":1,"ts":"2026-01-01T00:00:00Z","action":"handy:1","type":"device","name":"Handy"}\n{kaputt\n',
      'log/handy (1).jsonl': '{"id":"handy:9","device":"handy","seq":9,"ts":"2026-01-01T00:00:00Z","action":"handy:9","type":"categorize","tx":"t1","category":"X","prev":null}\n',
    });
    const f = new DataFolder(store, 'laptop');
    const { problems } = await f.load();
    const messages = problems.map((p) => p.message);
    expect(messages).toHaveLength(2);
    expect(messages).toContain('Konfliktkopie gefunden: log/handy (1).jsonl. Sie wird nicht übernommen.');
    expect(messages.some((m) => m.startsWith('log/handy.jsonl, Zeile 2: nicht lesbar'))).toBe(true);
    expect(f.state.tx.has('t1')).toBe(false);
    expect(await DataFolder.devices(store)).toEqual(['handy']);
  });
});
