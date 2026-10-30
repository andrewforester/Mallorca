import { useEffect, useState } from 'preact/hooks';
import { loadHands } from './handsClient.ts';
import { RunList } from './RunList.tsx';
import { RunView } from './RunView.tsx';
import { sourceFor } from './source.ts';
import type { RunEntry } from './types.ts';

const source = sourceFor(import.meta.env.DEV, import.meta.env.BASE_URL);
const load = (file: string) => loadHands(source.handsUrl(file));

type Runs =
  { kind: 'loading' } | { kind: 'failed'; message: string } | { kind: 'ready'; runs: RunEntry[] };

export function App() {
  const [runs, setRuns] = useState<Runs>({ kind: 'loading' });
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    fetch(source.runsUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`${source.runsUrl} answered ${response.status}`);
        return response.json() as Promise<RunEntry[]>;
      })
      .then(
        (list) => setRuns({ kind: 'ready', runs: list }),
        (error: unknown) => setRuns({ kind: 'failed', message: String(error) }),
      );
  }, []);
  const run = runs.kind === 'ready' ? runs.runs.find((r) => r.file === selected) : undefined;
  return (
    <main>
      <h1>Arena runs</h1>
      {runs.kind === 'loading' && <p class="note">Reading the runs.</p>}
      {runs.kind === 'failed' && (
        <p class="warning">{`Could not list the runs: ${runs.message}`}</p>
      )}
      {runs.kind === 'ready' && (
        <RunList runs={runs.runs} selected={selected} onSelect={setSelected} empty={source.empty} />
      )}
      {run !== undefined && <RunView key={run.file} run={run} load={load} />}
    </main>
  );
}
