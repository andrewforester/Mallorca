import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { CASH } from '../../../src/engine/index.ts';
import { handRecord } from '../../../src/game/records/record.ts';
import type { HandRecord } from '../../../src/game/records/record.ts';
import { BOTS } from '../bots.ts';
import { playPair } from '../match.ts';
import { summarize as stats } from '../stats.ts';
import { summarize } from './analysis.ts';
import type { LoadedHands } from './handsClient.ts';
import { RunList } from './RunList.tsx';
import { RunView } from './RunView.tsx';
import type { RunEntry } from './types.ts';

afterEach(cleanup);

function records(pairs: number): { records: HandRecord[]; nets: number[] } {
  const out: HandRecord[] = [];
  const nets: number[] = [];
  for (let index = 0; index < pairs; index++) {
    const pair = playPair(BOTS['random'], BOTS['always-call'], 5, index);
    nets.push(pair.net);
    pair.hands.forEach((events, k) => {
      out.push(
        handRecord(events, [], {
          sessionId: 'arena-5',
          mode: CASH,
          names: k === 0 ? ['random', 'always-call'] : ['always-call', 'random'],
          humanSeat: null,
          bot: { id: 'random-vs-always-call', version: '1' },
          playedAt: '2026-10-30T00:00:00.000Z',
        }),
      );
    });
  }
  return { records: out, nets };
}

function run(
  overrides: Partial<RunEntry['report']> = {},
  handsFile: string | null = 'r.jsonl',
): RunEntry {
  return {
    file: 'r.json',
    report: {
      a: 'random',
      b: 'always-call',
      pairs: 30,
      hands: 60,
      seed: 5,
      bbPer100: 0,
      ci95: 12.34,
      durationMs: 1000,
      commit: 'abc1234',
      finishedAt: '2026-10-30T09:15:00.000Z',
      ...overrides,
    },
    handsFile,
    handsBytes: handsFile === null ? null : 47_124_903,
  };
}

function loader(list: HandRecord[], skipped = 0) {
  return (): Promise<LoadedHands> =>
    Promise.resolve({
      summaries: list.map((r, line) => summarize(r, line)),
      skipped,
      record: (line: number) => Promise.resolve(list[line]!),
      close: () => {},
    });
}

describe('RunList', () => {
  it('shows each run with its bots, result, interval and hands', () => {
    render(
      <RunList
        runs={[run({ a: 'cfr', b: 'math', bbPer100: 32.81675, ci95: 9.2059, hands: 40000 })]}
        selected={null}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('cfr vs math')).toBeTruthy();
    expect(screen.getByText('+32.8 ± 9.2')).toBeTruthy();
    expect(screen.getByText('40000')).toBeTruthy();
    expect(screen.getByText('abc1234')).toBeTruthy();
  });

  it('says there are no runs yet', () => {
    render(<RunList runs={[]} selected={null} onSelect={() => {}} />);
    expect(screen.getByText(/No runs yet/)).toBeTruthy();
  });
});

describe('RunView', () => {
  it('says a run without hands has none', () => {
    render(<RunView run={run({}, null)} load={loader([])} />);
    expect(screen.getByText(/no saved hands/)).toBeTruthy();
  });

  it('says so when the hands file holds no readable hand', async () => {
    render(<RunView run={run()} load={loader([], 3)} />);
    expect(await screen.findByText(/holds no readable hand/)).toBeTruthy();
  });

  it('warns when the hands do not match the report', async () => {
    const { records: list } = records(30);
    render(<RunView run={run({ bbPer100: 999 })} load={loader(list)} />);
    expect(await screen.findByText(/do not match this report/)).toBeTruthy();
  });

  it('shows no warning when they match, and the slices', async () => {
    const { records: list, nets } = records(30);
    const bbPer100 = stats(nets, 20).bbPer100;
    render(<RunView run={run({ bbPer100 })} load={loader(list)} />);
    expect(await screen.findByText('Where the result comes from')).toBeTruthy();
    expect(screen.queryByText(/do not match this report/)).toBeNull();
    expect(screen.getAllByRole('cell', { name: 'Big blind' })).toHaveLength(1);
    expect(screen.getAllByRole('cell', { name: 'No showdown' })).toHaveLength(1);
  });

  it('reports skipped lines', async () => {
    const { records: list, nets } = records(30);
    render(<RunView run={run({ bbPer100: stats(nets, 20).bbPer100 })} load={loader(list, 2)} />);
    expect(await screen.findByText(/2 lines of the hands file could not be read/)).toBeTruthy();
  });

  it('opens a pair as two PokerStars hands', async () => {
    const { records: list, nets } = records(30);
    render(<RunView run={run({ bbPer100: stats(nets, 20).bbPer100 })} load={loader(list)} />);
    const rows = await screen.findAllByTestId('pair-row');
    fireEvent.click(rows[0]!);
    await waitFor(() => expect(screen.getAllByTestId('hand-text')).toHaveLength(2));
    const texts = screen.getAllByTestId('hand-text').map((el) => el.textContent ?? '');
    expect(texts[0]).toMatch(/Hold'em No Limit/);
    expect(texts[0]).toMatch(/random/);
  });

  it('says so when a hand cannot be read', async () => {
    const { records: list, nets } = records(30);
    const load = () =>
      loader(list)().then((hands) => ({
        ...hands,
        record: () => Promise.reject(new Error('no hand on line 7')),
      }));
    render(<RunView run={run({ bbPer100: stats(nets, 20).bbPer100 })} load={load} />);
    fireEvent.click((await screen.findAllByTestId('pair-row'))[0]!);
    expect(
      await screen.findByText(/Could not read the hands of this pair: no hand on line 7/),
    ).toBeTruthy();
  });
  it('reads the amounts in the big blind of the hands', async () => {
    const { records: list, nets } = records(30);
    const doubled = list.map((record) => ({
      ...record,
      mode: { kind: 'cash' as const, bigBlind: 40, buyIn: 2000 },
      events: record.events.map((e) => (e.type === 'handStarted' ? { ...e, bigBlind: 40 } : e)),
    }));
    render(<RunView run={run({ bbPer100: stats(nets, 40).bbPer100 })} load={loader(doubled)} />);
    const rows = await screen.findAllByTestId('pair-row');
    expect(screen.queryByText(/do not match this report/)).toBeNull();
    fireEvent.click(rows[0]!);
    const largest = nets.reduce(
      (best, n, i) => (Math.abs(n) > Math.abs(nets[best]!) ? i : best),
      0,
    );
    const net = nets[largest]! / 40;
    const text = `${net < 0 ? '-' : '+'}${Math.abs(net).toFixed(1)}`;
    const name = `Pair ${largest + 1}: random ${text} bb`;
    expect(screen.getByRole('heading', { name })).toBeTruthy();
  });
});
