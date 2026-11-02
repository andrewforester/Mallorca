import type { DebugView, Bias } from '../../game/index.ts';
import { Bar } from './Bar.tsx';
import { COPY } from './copy.ts';
import { f2 } from './format.ts';

const SENT = Object.keys(COPY.sent) as (keyof Bias)[];

function Sent({ bias }: { bias: Bias | null }) {
  if (bias === null) {
    return <p class="debug-note">{COPY.notSent}</p>;
  }
  return (
    <table class="debug-table">
      <tbody>
        {SENT.map((key) => (
          <tr key={key}>
            <td>{COPY.sent[key]}</td>
            <td>{f2(bias[key])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function BiasSection({ view }: { view: DebugView }) {
  return (
    <section class="debug-section" data-testid="debug-bias">
      <h3>{COPY.sections.bias}</h3>
      {view.engineBias.map(([key, value]) => (
        <Bar key={key} label={COPY.bias[key]} value={value} text={f2(value)} centered />
      ))}
      <h4>{COPY.sentTitle}</h4>
      <Sent bias={view.sentBias} />
    </section>
  );
}
