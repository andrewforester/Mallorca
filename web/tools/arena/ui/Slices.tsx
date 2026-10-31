import type { Slice, Slices as SliceGroups } from './analysis.ts';
import { LABELS, signed } from './format.ts';

function Group({ title, rows }: { title: string; rows: Slice[] }) {
  return (
    <table class="slice">
      <thead>
        <tr>
          <th>{title}</th>
          <th class="num">Hands</th>
          <th class="num">bb</th>
          <th class="num">bb/100</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.key}>
            <td>{LABELS[row.key] ?? row.key}</td>
            <td class="num">{row.hands}</td>
            <td class={`num ${row.bb < 0 ? 'loss' : 'win'}`}>{signed(row.bb, 0)}</td>
            <td class={`num ${row.bbPer100 < 0 ? 'loss' : 'win'}`}>{signed(row.bbPer100)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Slices({ slices }: { slices: SliceGroups }) {
  return (
    <section>
      <h3>Where the result comes from</h3>
      <p class="note">
        Per hand for A. A slice breaks the duplicate pairing, so it is much noisier than the run
        result and carries no interval.
      </p>
      <div class="slices">
        <Group title="Position" rows={slices.position} />
        <Group title="Last action" rows={slices.street} />
        <Group title="Showdown" rows={slices.showdown} />
      </div>
    </section>
  );
}
