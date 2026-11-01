import type { Impulse, TableEvent } from '../emotion/index.ts';

export const JOURNAL_SIZE = 50;

export interface Felt {
  handNumber: number;
  event: TableEvent;
  impulses: Impulse[];
}

export interface JournalEntry extends Felt {
  words: string[];
  spoke: boolean;
}

export class Journal {
  private entries: JournalEntry[] = [];

  add(felt: readonly Felt[], words: readonly string[], spoke: boolean): void {
    const fresh = felt.map((f) => ({ ...f, words: [...words], spoke })).reverse();
    this.entries = [...fresh, ...this.entries].slice(0, JOURNAL_SIZE);
  }

  list(): JournalEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }
}
