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
  ) {}

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

  async load(): Promise<LoadResult> {
    const problems: FolderProblem[] = [];
    const logs: LogEntry[][] = [];
    let own: LogEntry[] = [];
    for (const e of await this.store.list(LOG_DIR)) {
      if (e.kind !== 'file' || !e.name.endsWith('.jsonl')) continue;
      if (isConflictCopy(e.name)) {
        problems.push({ message: `Konfliktkopie gefunden: ${LOG_DIR}/${e.name}. Sie wird nicht übernommen.` });
        continue;
      }
      const text = (await this.store.read(`${LOG_DIR}/${e.name}`)) ?? '';
      const parsed = parseLog(`${LOG_DIR}/${e.name}`, text);
      problems.push(...parsed.problems.map(describe));
      logs.push(parsed.entries);
      if (e.name === `${this.device}.jsonl`) own = parsed.entries;
    }
    this.entries = logs;
    this.own = own;
    this.seq = own.reduce((m, e) => Math.max(m, e.seq), 0);
    this.state = mergeLogs(this.entries);
    this.problems = problems;
    return { state: this.state, problems, ownSeq: this.seq };
  }

  /** Writes one user action (one or more entries) to this device's log. */
  async record(newEntries: NewEntry[], opts: { undoable?: boolean } = {}): Promise<string> {
    // Never earlier than anything this device has seen, so a change made after
    // seeing another device's change also sorts after it, even with a clock behind.
    const latest = this.entries.flat().reduce((m, e) => Math.max(m, Date.parse(e.ts)), 0);
    const ts = new Date(Math.max(this.now().getTime(), latest + 1)).toISOString();
    const action = `${this.device}:${this.seq + 1}`;
    const written: LogEntry[] = newEntries.map((n) => {
      this.seq += 1;
      return { ...n, id: `${this.device}:${this.seq}`, device: this.device, seq: this.seq, ts, action } as LogEntry;
    });
    await this.store.append(this.logPath, written.map((e) => JSON.stringify(e) + '\n').join(''));
    this.own.push(...written);
    if (!this.entries.includes(this.own)) this.entries.push(this.own);
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
