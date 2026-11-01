import type { Impulse, TableEvent } from '../emotion/index.ts';

export const JOURNAL_SIZE = 50;

export interface Felt {
  handNumber: number;
  event: TableEvent;
  impulses: Impulse[];
}

export interface JournalEntry extends Felt {
  id: number;
  words: string[];
}

export class Journal {
  private entries: JournalEntry[] = [];
  private lastId = 0;

  add(felt: readonly Felt[], words: readonly string[]): void {
    const fresh = felt.map((f) => ({ ...f, id: (this.lastId += 1), words: [...words] }));
    this.entries = [...this.entries, ...fresh].slice(-JOURNAL_SIZE);
  }

  list(): JournalEntry[] {
    return [...this.entries].reverse();
  }

  since(id: number): JournalEntry[] {
    return this.entries.filter((e) => e.id > id);
  }

  last(): number {
    return this.lastId;
  }

  clear(): void {
    this.entries = [];
  }
}
