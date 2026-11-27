/** The app's view of the data folder. Paths use "/" and are relative to the folder. */
export interface FileStore {
  /** Entries directly inside dir ("" = the folder itself). Missing dir → []. */
  list(dir: string): Promise<DirEntry[]>;
  /** File content, or null if the file does not exist. */
  read(path: string): Promise<string | null>;
  /**
   * Creates parent folders as needed and replaces the whole file.
   * There is no append: in the Cryptomator vault on Android a read right after
   * a write can fail or return old content for ~5 s, so callers keep what they
   * wrote in memory and never read their own writes back.
   */
  write(path: string, text: string): Promise<void>;
}

export interface DirEntry {
  name: string;
  kind: 'file' | 'directory';
}

export function splitPath(path: string): { dirs: string[]; name: string } {
  const parts = path.split('/').filter(Boolean);
  const name = parts.pop();
  if (!name) throw new Error(`Ungültiger Pfad: "${path}"`);
  return { dirs: parts, name };
}
