import type { DebugView, Style } from '../../game/index.ts';
import { Bar } from './Bar.tsx';
import { COPY } from './copy.ts';
import { f2 } from './format.ts';

const SENT = Object.keys(COPY.sent) as (keyof Style)[];

function Sent({ style }: { style: Style | null }) {
  if (style === null) {
    return <p class="debug-note">{COPY.notSent}</p>;
  }
  return (
    <table class="debug-table">
      <tbody>
        {SENT.map((key) => (
          <tr key={key}>
            <td>{COPY.sent[key]}</td>
            <td>{f2(style[key])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function StyleSection({ view }: { view: DebugView }) {
  return (
    <section class="debug-section" data-testid="debug-style">
      <h3>{COPY.sections.style}</h3>
      {view.engineStyle.map(([key, value]) => (
        <Bar key={key} label={COPY.style[key]} value={value} text={f2(value)} centered />
      ))}
      <h4>{COPY.sentTitle}</h4>
      <Sent style={view.sentStyle} />
    </section>
  );
}
