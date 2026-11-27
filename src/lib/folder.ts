import type { FileStore } from './store/types';
import { mergeLogs, parseLog, type LogProblem, type State } from './log/merge';
import type { LogEntry, NewEntry } from './log/types';

export const LOG_DIR = 'log';

/** File names that Cryptomator, pCloud or the OS create when two versions of a file collide. */
const CONFLICT_COPY = /(\(\d+\)|conflict|konflikt|kopie|copy)/i;

export function isConflictCopy(name: string): boolean {
  return CONFLICT_COPY.test(name.replace(/\.jsonl$/i, ''));
}

/** Device ids are file names: lower case a–z, 0–9 and "-". */
export function deviceIdFor(name: string): string {
  const id = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return id || 'geraet';
}

const OWN_READ_ATTEMPTS = 6;
const OWN_READ_RETRY_MS = 1000;
export const OWN_STALE = 'Die eigene Log-Datei ist noch nicht aktuell. Bitte in ein paar Sekunden neu öffnen.';

export interface FolderProblem {
  message: string;
}

export interface LoadResult {
  state: State;
  /** Broken log lines and sync conflict copies. Shown as errors; nothing is merged from conflict copies. */
  problems: FolderProblem[];
  ownSeq: number;
}

/** The data folder as one device sees it. This device writes only log/<device>.jsonl. */
export class DataFolder {
  private seq = 0;
  private entries: LogEntry[][] = [];
  private own: LogEntry[] = [];
  state: State = mergeLogs([]);
  problems: FolderProblem[] = [];
  /** Actions of this session, newest last, that "Rückgängig" can take back. */
  private undoStack: string[] = [];

  constructor(
    readonly store: FileStore,
    readonly device: string,
    private readonly now: () => Date = () => new Date(),
    private readonly wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  /** Highest seq in this device's log as far as this session knows. */
  get ownSeq(): number {
    return this.seq;
  }

  get logPath(): string {
    return `${LOG_DIR}/${this.device}.jsonl`;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  /** Lists all device ids that have a log, without conflict copies. */
  static async devices(store: FileStore): Promise<string[]> {
    return (await store.list(LOG_DIR))
      .filter((e) => e.kind === 'file' && e.name.endsWith('.jsonl') && !isConflictCopy(e.name))
      .map((e) => e.name.slice(0, -'.jsonl'.length));
  }

  /**
   * Reads all logs. expectSeq is the highest seq this device is known to have
   * written (remembered in the browser): a re-read of its own log that is
   * behind it is stale, so it is read again for a few seconds and then refused,
   * because writing on top of a stale copy would lose entries.
   */
  async load(opts: { expectSeq?: number } = {}): Promise<LoadResult> {
    const problems: FolderProblem[] = [];
    const logs: LogEntry[][] = [];
    let own: LogEntry[] = [];
    for (const e of await this.store.list(LOG_DIR)) {
      if (e.kind !== 'file' || !e.name.endsWith('.jsonl')) continue;
      if (isConflictCopy(e.name)) {
        problems.push({ message: `Konfliktkopie gefunden: ${LOG_DIR}/${e.name}. Sie wird nicht übernommen.` });
        continue;
      }
      const isOwn = e.name === `${this.device}.jsonl`;
      const parsed = isOwn
        ? await this.readOwn(Math.max(opts.expectSeq ?? 0, this.seq))
        : parseLog(`${LOG_DIR}/${e.name}`, (await this.store.read(`${LOG_DIR}/${e.name}`)) ?? '');
      problems.push(...parsed.problems.map(describe));
      logs.push(parsed.entries);
      if (isOwn) own = parsed.entries;
    }
    if (!own.length && (opts.expectSeq ?? 0) > this.seq) {
      throw new Error(OWN_STALE);
    }
    // Our own log: what we wrote this session beats a re-read, which may be stale.
    const fileSeq = own.reduce((m, x) => Math.max(m, x.seq), 0);
    const memSeq = this.own.reduce((m, x) => Math.max(m, x.seq), 0);
    if (memSeq > fileSeq) {
      const i = logs.indexOf(own);
      if (i >= 0) logs[i] = this.own;
      else logs.push(this.own);
      own = this.own;
    }
    this.entries = logs;
    this.own = own;
    this.seq = own.reduce((m, e) => Math.max(m, e.seq), 0);
    this.state = mergeLogs(this.entries);
    this.problems = problems;
    return { state: this.state, problems, ownSeq: this.seq };
  }

  private async readOwn(expect: number): Promise<{ entries: LogEntry[]; problems: LogProblem[] }> {
    for (let attempt = 1; ; attempt++) {
      const parsed = parseLog(this.logPath, (await this.store.read(this.logPath)) ?? '');
      const seq = parsed.entries.reduce((m, x) => Math.max(m, x.seq), 0);
      // What this session wrote itself is known in memory; only a gap before that matters.
      if (seq >= expect || this.seq >= expect) return parsed;
      if (attempt >= OWN_READ_ATTEMPTS) throw new Error(OWN_STALE);
      await this.wait(OWN_READ_RETRY_MS);
    }
  }

  /** Writes one user action (one or more entries) to this device's log. */
  async record(newEntries: NewEntry[], opts: { undoable?: boolean } = {}): Promise<string> {
    // Never earlier than anything this device has seen, so a change made after
    // seeing another device's change also sorts after it, even with a clock behind.
    const latest = this.entries.flat().reduce((m, e) => Math.max(m, Date.parse(e.ts)), 0);
    const ts = new Date(Math.max(this.now().getTime(), latest + 1)).toISOString();
    const action = `${this.device}:${this.seq + 1}`;
    let seq = this.seq;
    const written: LogEntry[] = newEntries.map((n) => {
      seq += 1;
      return { ...n, id: `${this.device}:${seq}`, device: this.device, seq, ts, action } as LogEntry;
    });
    const next = [...this.own, ...written];
    // Whole file from memory: no append, no read-back of our own file.
    await this.store.write(this.logPath, next.map((e) => JSON.stringify(e) + '\n').join(''));
    this.seq = seq;
    const i = this.entries.indexOf(this.own);
    this.own = next;
    if (i >= 0) this.entries[i] = this.own;
    else this.entries.push(this.own);
    this.state = mergeLogs(this.entries);
    if (opts.undoable !== false) this.undoStack.push(action);
    return action;
  }

  /** Sets up this device: writes its name as the first entry of its log. */
  async register(name: string): Promise<void> {
    await this.record([{ type: 'device', name }], { undoable: false });
  }

  /** "Rückgängig": takes back the newest action of this session. */
  async undo(): Promise<string | null> {
    const action = this.undoStack.pop();
    if (!action) return null;
    await this.record([{ type: 'undo', undoes: action }], { undoable: false });
    return action;
  }

  /** Manual categorization; null clears it. */
  async categorize(tx: string, category: string | null): Promise<void> {
    const prev = this.state.tx.get(tx)?.by ?? null;
    await this.record([{ type: 'categorize', tx, category, prev }]);
  }
}

function describe(p: LogProblem): FolderProblem {
  return { message: `${p.file}, Zeile ${p.line}: nicht lesbar (${p.message}).` };
}
