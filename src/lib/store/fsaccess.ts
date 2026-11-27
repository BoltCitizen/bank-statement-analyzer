import { splitPath, type DirEntry, type FileStore } from './types';

/** FileStore on a folder picked with showDirectoryPicker (File System Access API). */
export class FsAccessStore implements FileStore {
  constructor(readonly root: FileSystemDirectoryHandle) {}

  private async dir(parts: string[], create: boolean): Promise<FileSystemDirectoryHandle | null> {
    let dir = this.root;
    for (const part of parts) {
      try {
        dir = await dir.getDirectoryHandle(part, { create });
      } catch (e) {
        if (!create && isNotFound(e)) return null;
        throw e;
      }
    }
    return dir;
  }

  async list(path: string): Promise<DirEntry[]> {
    const dir = await this.dir(path.split('/').filter(Boolean), false);
    if (!dir) return [];
    const out: DirEntry[] = [];
    for await (const [name, handle] of dir.entries()) {
      out.push({ name, kind: handle.kind });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  async read(path: string): Promise<string | null> {
    const { dirs, name } = splitPath(path);
    const dir = await this.dir(dirs, false);
    if (!dir) return null;
    // The vault's document provider can answer NotReadableError for a few
    // seconds after a sync wrote the file; try again before giving up.
    for (let attempt = 1; ; attempt++) {
      try {
        const file = await (await dir.getFileHandle(name)).getFile();
        return await file.text();
      } catch (e) {
        if (isNotFound(e)) return null;
        if (!isNotReadable(e) || attempt >= READ_ATTEMPTS) throw e;
        await new Promise((r) => setTimeout(r, READ_RETRY_MS));
      }
    }
  }

  async write(path: string, text: string): Promise<void> {
    const { dirs, name } = splitPath(path);
    const dir = (await this.dir(dirs, true))!;
    const handle = await dir.getFileHandle(name, { create: true });
    const w = await handle.createWritable({ keepExistingData: false });
    await w.write(text);
    await w.close();
  }

}

const READ_ATTEMPTS = 6;
const READ_RETRY_MS = 1000;

function isNotReadable(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'NotReadableError';
}

function isNotFound(e: unknown): boolean {
  return e instanceof DOMException && (e.name === 'NotFoundError' || e.name === 'TypeMismatchError');
}

export function folderAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}
