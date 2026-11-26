import { splitPath, type DirEntry, type FileStore } from './types';

/** In-memory FileStore: test double for unit and browser tests. */
export class MemoryStore implements FileStore {
  readonly files = new Map<string, string>();

  constructor(initial: Record<string, string> = {}) {
    for (const [p, t] of Object.entries(initial)) this.files.set(clean(p), t);
  }

  async list(dir: string): Promise<DirEntry[]> {
    const prefix = clean(dir) ? `${clean(dir)}/` : '';
    const seen = new Map<string, DirEntry>();
    for (const path of this.files.keys()) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      const [head, ...tail] = rest.split('/');
      if (!head) continue;
      seen.set(head, { name: head, kind: tail.length ? 'directory' : 'file' });
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async read(path: string): Promise<string | null> {
    return this.files.get(clean(path)) ?? null;
  }

  async write(path: string, text: string): Promise<void> {
    splitPath(path);
    this.files.set(clean(path), text);
  }

  async append(path: string, text: string): Promise<void> {
    splitPath(path);
    this.files.set(clean(path), (this.files.get(clean(path)) ?? '') + text);
  }
}

function clean(p: string): string {
  return p.split('/').filter(Boolean).join('/');
}
