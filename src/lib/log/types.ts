/**
 * One line of log/<device>.jsonl. Each device appends only to its own file.
 * Current state = all CSVs + all device logs merged by time (see merge.ts).
 */
export type LogEntry = DeviceEntry | CategorizeEntry | UndoEntry;

interface Base {
  /** Unique: "<device>:<seq>". */
  id: string;
  device: string;
  /** Counts up per device, starting at 1. */
  seq: number;
  /** ISO time of the change on the writing device. */
  ts: string;
  /** All entries of one user action share it; undo works on whole actions. */
  action: string;
}

/** First entry of every device log: its display name. */
export interface DeviceEntry extends Base {
  type: 'device';
  name: string;
}

/** Manual categorization of one transaction; category null clears it. */
export interface CategorizeEntry extends Base {
  type: 'categorize';
  tx: string;
  category: string | null;
  /** Id of the categorization of this tx the writer saw as current, or null. Used to see conflicts. */
  prev: string | null;
}

/** Takes back one earlier action (all its entries). Never undone itself; log entries are never deleted. */
export interface UndoEntry extends Base {
  type: 'undo';
  undoes: string;
}

export type NewEntry =
  | Omit<DeviceEntry, keyof Base>
  | Omit<CategorizeEntry, keyof Base>
  | Omit<UndoEntry, keyof Base>;
