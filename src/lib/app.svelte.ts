import { DataFolder, deviceIdFor } from './folder';
import { FsAccessStore, folderAccessSupported } from './store/fsaccess';
import type { FileStore } from './store/types';
import { getLocal, setLocal } from './local';

export type Phase = 'loading' | 'unsupported' | 'pick' | 'permission' | 'device' | 'ready';
export type View = 'start' | 'settings';

/** Where the app keeps "who am I and which folder" between starts. Replaced by a test double in e2e builds. */
export interface Local {
  getFolder(): Promise<FileSystemDirectoryHandle | undefined>;
  setFolder(h: FileSystemDirectoryHandle): Promise<void>;
  getDevice(): Promise<string | undefined>;
  setDevice(id: string): Promise<void>;
  getSeq(): Promise<number | undefined>;
  setSeq(seq: number): Promise<void>;
}

export const browserLocal: Local = {
  getFolder: () => getLocal('folder'),
  setFolder: (h) => setLocal('folder', h),
  getDevice: () => getLocal('device'),
  setDevice: (id) => setLocal('device', id),
  getSeq: () => getLocal('seq'),
  setSeq: (seq) => setLocal('seq', seq),
};

export class App {
  phase = $state<Phase>('loading');
  view = $state<View>('start');
  folderName = $state('');
  device = $state('');
  deviceName = $state('');
  knownDevices = $state<{ id: string; name: string }[]>([]);
  errors = $state<string[]>([]);
  canUndo = $state(false);
  busy = $state(false);

  private store: FileStore | null = null;
  private handle: FileSystemDirectoryHandle | null = null;
  folder: DataFolder | null = null;

  constructor(
    private readonly local: Local = browserLocal,
    /** Test builds pass a ready store instead of a picked folder. */
    private readonly testStore: { store: FileStore; name: string } | null = null,
  ) {}

  async start(): Promise<void> {
    try {
      if (this.testStore) return await this.useStore(this.testStore.store, this.testStore.name);
      if (!folderAccessSupported()) return void (this.phase = 'unsupported');
      const handle = await this.local.getFolder();
      if (!handle) return void (this.phase = 'pick');
      this.handle = handle;
      this.folderName = handle.name;
      if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') {
        await this.useStore(new FsAccessStore(handle), handle.name);
      } else {
        this.phase = 'permission';
      }
    } catch (e) {
      this.fail(e);
    }
  }

  /** "Ordner wählen" (also "Ordner wechseln"). */
  async pickFolder(): Promise<void> {
    try {
      const handle = await window.showDirectoryPicker({ id: 'bsa-data', mode: 'readwrite' });
      await this.local.setFolder(handle);
      this.handle = handle;
      this.view = 'start';
      await this.useStore(new FsAccessStore(handle), handle.name);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      this.fail(e);
    }
  }

  /** "Zugriff erlauben": the browser asks again after a restart if it doesn't keep the permission. */
  async allowAccess(): Promise<void> {
    if (!this.handle) return;
    try {
      if ((await this.handle.requestPermission({ mode: 'readwrite' })) !== 'granted') {
        this.errors = [...this.errors, 'Kein Zugriff auf den Ordner.'];
        return;
      }
      await this.useStore(new FsAccessStore(this.handle), this.handle.name);
    } catch (e) {
      this.fail(e);
    }
  }

  private async useStore(store: FileStore, name: string): Promise<void> {
    this.phase = 'loading';
    this.store = store;
    this.folderName = name;
    const ids = await DataFolder.devices(store);
    const device = await this.local.getDevice();
    if (device && ids.includes(device)) return await this.open(device);
    // Names of the devices already in this folder, so this one can continue as one of them.
    const probe = new DataFolder(store, '');
    await probe.load();
    this.knownDevices = ids.map((id) => ({ id, name: probe.state.devices.get(id) ?? id }));
    this.phase = 'device';
  }

  /** Sets up this browser as a new device with its own log file. */
  async createDevice(name: string): Promise<void> {
    const clean = name.trim();
    if (!clean) return void (this.errors = [...this.errors, 'Gerätename fehlt.']);
    const id = deviceIdFor(clean);
    if (this.knownDevices.some((d) => d.id === id)) {
      this.errors = [...this.errors, `„${clean}“ gibt es in diesem Ordner schon.`];
      return;
    }
    await this.guard(async () => {
      const f = new DataFolder(this.store!, id);
      await f.load();
      await f.register(clean);
      await this.local.setDevice(id);
      await this.local.setSeq(f.ownSeq);
      // Keep this instance: re-reading the file just written can be stale in the vault.
      this.use(f, []);
    });
  }

  /** Continues as a device that already has a log here (e.g. after clearing browser data). */
  async continueAs(id: string): Promise<void> {
    await this.guard(async () => {
      await this.local.setDevice(id);
      await this.local.setSeq(0); // what this browser wrote before belongs to another device
      await this.open(id);
    });
  }

  private async open(id: string): Promise<void> {
    const f = new DataFolder(this.store!, id);
    const { problems } = await f.load({ expectSeq: (await this.local.getSeq()) ?? 0 });
    this.use(f, problems.map((p) => p.message));
  }

  private use(f: DataFolder, errors: string[]): void {
    this.folder = f;
    this.device = f.device;
    this.deviceName = f.state.devices.get(f.device) ?? f.device;
    this.errors = errors;
    this.sync();
    this.phase = 'ready';
  }

  async undo(): Promise<void> {
    await this.guard(async () => {
      await this.folder?.undo();
      await this.saved();
    });
  }

  /** After every write: remember our seq, so a stale re-read after a restart is recognized. */
  private async saved(): Promise<void> {
    if (this.folder) await this.local.setSeq(this.folder.ownSeq);
    this.sync();
  }

  private sync(): void {
    this.canUndo = this.folder?.canUndo ?? false;
  }

  private async guard(run: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await run();
    } catch (e) {
      this.fail(e);
    } finally {
      this.busy = false;
    }
  }

  private fail(e: unknown): void {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    this.errors = [...this.errors, `Fehler: ${msg}`];
    if (this.phase === 'loading') this.phase = this.handle ? 'permission' : 'pick';
  }

  dismissError(i: number): void {
    this.errors = this.errors.filter((_, j) => j !== i);
  }
}
