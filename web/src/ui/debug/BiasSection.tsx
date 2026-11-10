import type { DebugView, Bias, BiasKey } from '../../game/index.ts';
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

function Pushes({ rows }: { rows: [BiasKey, number][] }) {
  return (
    <table class="debug-table" data-testid="debug-push">
      <tbody>
        {rows.map(([key, value]) => (
          <tr key={key}>
            <td>{COPY.bias[key]}</td>
            <td>{f2(value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Bars({ testId, rows }: { testId: string; rows: [BiasKey, number][] }) {
  return (
    <div data-testid={testId}>
      {rows.map(([key, value]) => (
        <Bar key={key} label={COPY.bias[key]} value={value} text={f2(value)} centered />
      ))}
    </div>
  );
}

export function BiasSection({ view }: { view: DebugView }) {
  return (
    <section class="debug-section" data-testid="debug-bias">
      <h3>{COPY.sections.bias}</h3>
      <h4>{COPY.nowTitle}</h4>
      <Bars testId="debug-bias-now" rows={view.engineBias} />
      <h4>{COPY.styleTitle}</h4>
      <Bars testId="debug-style" rows={view.baseline} />
      <h4>{COPY.pushTitle}</h4>
      <Pushes rows={view.push} />
      <h4>{COPY.sentTitle}</h4>
      <Sent bias={view.sentBias} />
    </section>
  );
}
