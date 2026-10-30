import { useEffect, useMemo, useState } from 'preact/hooks';
import { cumulative, pairNets, slices } from './analysis.ts';
import type { PairRow } from './analysis.ts';
import { Curve } from './Curve.tsx';
import { BIG_BLIND, megabytes, result, signed } from './format.ts';
import { HandList } from './HandList.tsx';
import type { LoadedHands } from './handsClient.ts';
import { PairPanel } from './PairPanel.tsx';
import { Slices } from './Slices.tsx';
import type { RunEntry } from './types.ts';

const TOLERANCE = 0.05;

interface Props {
  run: RunEntry;
  load: (file: string) => Promise<LoadedHands>;
}

type State =
  { kind: 'loading' } | { kind: 'failed'; message: string } | { kind: 'ready'; hands: LoadedHands };

function useHands(file: string | null, load: Props['load']): State {
  const [state, setState] = useState<State>({ kind: 'loading' });
  useEffect(() => {
    if (file === null) return;
    let live = true;
    let loaded: LoadedHands | null = null;
    setState({ kind: 'loading' });
    load(file).then(
      (hands) => {
        loaded = hands;
        if (live) setState({ kind: 'ready', hands });
        else hands.close();
      },
      (error: unknown) => live && setState({ kind: 'failed', message: String(error) }),
    );
    return () => {
      live = false;
      loaded?.close();
    };
  }, [file, load]);
  return state;
}

function Checks({ run, hands }: { run: RunEntry; hands: LoadedHands }) {
  const nets = useMemo(() => pairNets(hands.summaries), [hands]);
  const mean = nets.reduce((s, n) => s + (n / 2 / BIG_BLIND) * 100, 0) / Math.max(1, nets.length);
  const mismatch =
    nets.length !== run.report.pairs || Math.abs(mean - run.report.bbPer100) > TOLERANCE;
  return (
    <>
      {mismatch && (
        <p class="warning">
          {`The hands do not match this report: ${nets.length} pairs at ${signed(mean)} bb/100.`}
        </p>
      )}
      {hands.skipped > 0 && (
        <p class="warning">{`${hands.skipped} lines of the hands file could not be read and are left out.`}</p>
      )}
    </>
  );
}

function Analysis({ run, hands }: { run: RunEntry; hands: LoadedHands }) {
  const [open, setOpen] = useState<PairRow | null>(null);
  const points = useMemo(() => cumulative(pairNets(hands.summaries), BIG_BLIND), [hands]);
  const groups = useMemo(() => slices(hands.summaries, BIG_BLIND), [hands]);
  return (
    <>
      <Checks run={run} hands={hands} />
      <section>
        <h3>{`Cumulative big blinds for ${run.report.a}`}</h3>
        <Curve points={points} />
      </section>
      <Slices slices={groups} />
      <div class="pair-layout">
        <HandList hands={hands.summaries} open={open} onOpen={setOpen} />
        {open !== null && <PairPanel row={open} a={run.report.a} record={hands.record} />}
      </div>
    </>
  );
}

function Body({ run, load }: Props) {
  const state = useHands(run.handsFile, load);
  if (run.handsFile === null) return <p class="note">This run has no saved hands.</p>;
  if (state.kind === 'failed')
    return <p class="warning">{`Could not read the hands: ${state.message}`}</p>;
  if (state.kind === 'loading') {
    const size = run.handsBytes === null ? '' : ` (${megabytes(run.handsBytes)})`;
    return <p class="note">{`Reading ${run.handsFile}${size}.`}</p>;
  }
  return <Analysis run={run} hands={state.hands} />;
}

export function RunView({ run, load }: Props) {
  const r = run.report;
  return (
    <article class="run">
      <h2>{`${r.a} vs ${r.b}: ${result(r)} bb/100`}</h2>
      <p class="note">{`${r.hands} hands in ${r.pairs} duplicate pairs, seed ${r.seed}, commit ${r.commit}, ${run.file}.`}</p>
      <Body run={run} load={load} />
    </article>
  );
}
