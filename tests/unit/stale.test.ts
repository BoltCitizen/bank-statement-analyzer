import { describe, expect, it } from 'vitest';
import { DataFolder, OWN_STALE } from '../../src/lib/folder';
import { MemoryStore } from '../../src/lib/store/memory';

/** Like the Cryptomator vault on Android: right after a write, reads return the old content. */
class StaleStore extends MemoryStore {
  private old = new Map<string, string | null>();
  staleReads = 0;

  override async write(path: string, text: string): Promise<void> {
    if (!this.old.has(path)) this.old.set(path, this.files.get(path) ?? null);
    await super.write(path, text);
  }

  override async read(path: string): Promise<string | null> {
    if (this.staleReads > 0 && this.old.has(path)) {
      this.staleReads -= 1;
      return this.old.get(path) ?? null;
    }
    return super.read(path);
  }

  settle(): void {
    this.old.clear();
  }
}

const noWait = async () => {};

describe('stale reads of the own log', () => {
  it('never reads its own writes back: reload keeps what was written in memory', async () => {
    const store = new StaleStore();
    const f = new DataFolder(store, 'handy', undefined, noWait);
    await f.load();
    await f.register('Handy');
    await f.categorize('t1', 'Lebensmittel');
    store.staleReads = 100;
    await f.load();
    expect(f.state.tx.get('t1')?.category).toBe('Lebensmittel');
    await f.categorize('t2', 'Miete');
    store.settle();
    const ids = store.files.get('log/handy.jsonl')!.trim().split('\n').map((l) => JSON.parse(l).id);
    expect(ids).toEqual(['handy:1', 'handy:2', 'handy:3']);
  });

  it('after a restart, re-reads a stale own log until it catches up with the remembered seq', async () => {
    const store = new StaleStore();
    const a = new DataFolder(store, 'handy', undefined, noWait);
    await a.load();
    await a.register('Handy');
    await a.categorize('t1', 'A');
    store.staleReads = 2; // first two reads still see the old (empty) file
    const b = new DataFolder(store, 'handy', undefined, noWait);
    await b.load({ expectSeq: a.ownSeq });
    expect(b.ownSeq).toBe(2);
    expect(b.state.tx.get('t1')?.category).toBe('A');
  });

  it('refuses to open a stale own log instead of overwriting newer entries', async () => {
    const store = new StaleStore();
    const a = new DataFolder(store, 'handy', undefined, noWait);
    await a.load();
    await a.register('Handy');
    await a.categorize('t1', 'A');
    store.staleReads = 100;
    const b = new DataFolder(store, 'handy', undefined, noWait);
    await expect(b.load({ expectSeq: a.ownSeq })).rejects.toThrow(OWN_STALE);
  });

  it('a failed write does not use up sequence numbers', async () => {
    const store = new MemoryStore();
    const f = new DataFolder(store, 'handy', undefined, noWait);
    await f.load();
    await f.register('Handy');
    const write = store.write.bind(store);
    store.write = async () => {
      throw new Error('voll');
    };
    await expect(f.categorize('t1', 'A')).rejects.toThrow('voll');
    store.write = write;
    await f.categorize('t1', 'A');
    expect(f.ownSeq).toBe(2);
  });
});
