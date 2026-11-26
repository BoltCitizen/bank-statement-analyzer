/**
 * What this browser remembers locally (IndexedDB): the folder handle and this
 * device's id. No bank data is stored here; that stays in the folder.
 */
const DB = 'bsa';
const STORE = 'local';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export interface LocalState {
  folder?: FileSystemDirectoryHandle;
  device?: string;
}

export async function getLocal<K extends keyof LocalState>(key: K): Promise<LocalState[K]> {
  return (await tx('readonly', (s) => s.get(key))) as LocalState[K];
}

export async function setLocal<K extends keyof LocalState>(key: K, value: LocalState[K]): Promise<void> {
  await tx('readwrite', (s) => s.put(value, key));
}
