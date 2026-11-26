import type { CategorizeEntry, LogEntry } from './types';

export interface LogProblem {
  file: string;
  line: number;
  message: string;
}

/** Parses one device log. A broken line is reported, never dropped silently. */
export function parseLog(file: string, text: string): { entries: LogEntry[]; problems: LogProblem[] } {
  const entries: LogEntry[] = [];
  const problems: LogProblem[] = [];
  const lines = text.split('\n');
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    try {
      const e = JSON.parse(line) as LogEntry;
      if (typeof e.id !== 'string' || typeof e.device !== 'string' || typeof e.seq !== 'number' || typeof e.ts !== 'string') {
        throw new Error('Pflichtfelder fehlen');
      }
      entries.push(e);
    } catch (err) {
      problems.push({ file, line: i + 1, message: err instanceof Error ? err.message : String(err) });
    }
  });
  return { entries, problems };
}

/** Total order over all devices: time, then device, then seq. Same input → same order on every device. */
export function compareEntries(a: LogEntry, b: LogEntry): number {
  if (a.ts !== b.ts) return a.ts < b.ts ? -1 : 1;
  if (a.device !== b.device) return a.device < b.device ? -1 : 1;
  return a.seq - b.seq;
}

export interface TxState {
  category: string | null;
  /** The entry that set the current category. */
  by: string;
  /** Set when two devices changed this transaction without seeing each other's change. The later one won. */
  conflict: { winner: string; loser: string } | null;
}

export interface State {
  devices: Map<string, string>;
  tx: Map<string, TxState>;
  /** Actions that are taken back. */
  undone: Set<string>;
}

export function mergeLogs(logs: LogEntry[][]): State {
  const all = logs.flat().sort(compareEntries);
  const undone = new Set<string>();
  for (const e of all) if (e.type === 'undo') undone.add(e.undoes);

  const devices = new Map<string, string>();
  const tx = new Map<string, TxState>();
  // The last categorization per tx, including undone ones, to judge "prev".
  for (const e of all) {
    if (e.type === 'device') {
      devices.set(e.device, e.name);
      continue;
    }
    if (e.type !== 'categorize' || undone.has(e.action)) continue;
    applyCategorize(tx, e);
  }
  return { devices, tx, undone };
}

function applyCategorize(tx: Map<string, TxState>, e: CategorizeEntry): void {
  const cur = tx.get(e.tx);
  let conflict = cur?.conflict ?? null;
  if (cur && e.prev === cur.by) {
    conflict = null; // the writer saw the current state: a deliberate change, also resolves a conflict
  } else if (cur && deviceOf(cur.by) !== e.device) {
    conflict = { winner: e.id, loser: cur.by };
  }
  tx.set(e.tx, { category: e.category, by: e.id, conflict });
}

function deviceOf(id: string): string {
  return id.slice(0, id.lastIndexOf(':'));
}
