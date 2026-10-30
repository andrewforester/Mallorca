import { megabytes, result, seconds, when } from './format.ts';
import type { RunEntry } from './types.ts';

interface Props {
  runs: RunEntry[];
  selected: string | null;
  onSelect: (file: string) => void;
}

function Row({
  run,
  selected,
  onSelect,
}: {
  run: RunEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  const r = run.report;
  return (
    <tr class={selected ? 'selected' : ''} onClick={onSelect} data-testid="run-row">
      <td>
        <button type="button" class="link">{`${r.a} vs ${r.b}`}</button>
      </td>
      <td class={`num ${r.bbPer100 < 0 ? 'loss' : 'win'}`}>{result(r)}</td>
      <td class="num">{r.hands}</td>
      <td class="num">{r.seed}</td>
      <td class="num">{seconds(r.durationMs)}</td>
      <td>{r.commit}</td>
      <td>{when(r.finishedAt)}</td>
      <td class="num">{run.handsBytes === null ? 'none' : megabytes(run.handsBytes)}</td>
    </tr>
  );
}

export function RunList({ runs, selected, onSelect }: Props) {
  if (runs.length === 0) {
    return <p class="note">No runs yet. Play one with npm run arena and it appears here.</p>;
  }
  return (
    <div class="scroll">
      <table class="runs">
        <thead>
          <tr>
            <th>Match</th>
            <th class="num">bb/100 for A</th>
            <th class="num">Hands</th>
            <th class="num">Seed</th>
            <th class="num">Time</th>
            <th>Commit</th>
            <th>Finished</th>
            <th class="num">Hand file</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <Row
              key={run.file}
              run={run}
              selected={run.file === selected}
              onSelect={() => onSelect(run.file)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
