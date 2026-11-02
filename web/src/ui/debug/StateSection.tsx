import type { DebugLoad, DebugView, Pad } from '../../game/index.ts';
import { Bar } from './Bar.tsx';
import { COPY } from './copy.ts';
import { bb, f2, padText, pct } from './format.ts';

const SIZE = 160;
const HALF = SIZE / 2;
const REACH = HALF - 12;

const x = (p: Pad): number => HALF + p[0] * REACH;
const y = (p: Pad): number => HALF - p[1] * REACH;

function MoodMap({ mood, rest }: { mood: Pad; rest: Pad | null }) {
  return (
    <svg class="debug-map" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={COPY.mood.title}>
      <line class="debug-axis" x1={8} y1={HALF} x2={SIZE - 8} y2={HALF} />
      <line class="debug-axis" x1={HALF} y1={8} x2={HALF} y2={SIZE - 8} />
      <text x={SIZE - 8} y={HALF - 4} text-anchor="end">
        {COPY.mood.pleasant}
      </text>
      <text x={8} y={HALF - 4}>
        {COPY.mood.unpleasant}
      </text>
      <text x={HALF + 4} y={14}>
        {COPY.mood.aroused}
      </text>
      <text x={HALF + 4} y={SIZE - 6}>
        {COPY.mood.calm}
      </text>
      {rest !== null && (
        <circle class="debug-rest" cx={x(rest)} cy={y(rest)} r={6}>
          <title>{COPY.mood.rest}</title>
        </circle>
      )}
      <circle class="debug-mood-dot" cx={x(mood)} cy={y(mood)} r={5}>
        <title>{COPY.mood.current}</title>
      </circle>
    </svg>
  );
}

function Mood({ view }: { view: DebugView }) {
  const { mood, octant, defaultMood } = view;
  return (
    <div data-testid="debug-mood" class="debug-block">
      <h4>{COPY.mood.title}</h4>
      {mood !== null && <MoodMap mood={mood} rest={defaultMood} />}
      {mood !== null && <p class="debug-numbers">{padText(mood)}</p>}
      {octant !== null && (
        <p class="debug-note">{`${COPY.strength[octant.strength]} ${COPY.octant[octant.octant]}`}</p>
      )}
      {defaultMood !== null && (
        <p class="debug-note">{`${COPY.mood.rest}: ${padText(defaultMood)}`}</p>
      )}
    </div>
  );
}

const NO_LOAD: DebugLoad = { total: 0, sources: [], overload: 0, composure: 0, leakage: 0 };

function Load({ view }: { view: DebugView }) {
  const load = view.load ?? NO_LOAD;
  return (
    <div data-testid="debug-load" class="debug-block">
      <h4>{COPY.load.title}</h4>
      <Bar label={COPY.load.overload} value={load.overload} text={pct(load.overload)} />
      <Bar label={COPY.load.total} value={load.total / 2} text={f2(load.total)} />
      <Bar label={COPY.load.composure} value={load.composure / 2} text={f2(load.composure)} />
      <Bar label={COPY.load.leakage} value={load.leakage} text={pct(load.leakage)} />
      {load.sources.map(([source, value]) => (
        <Bar key={source} label={COPY.source[source]} value={value} text={f2(value)} />
      ))}
      <p class="debug-note">{`${COPY.load.session}: ${bb(view.sessionNetBb)}`}</p>
      <p class="debug-note">{`${COPY.load.pressure}: ${f2(view.pressure)}`}</p>
    </div>
  );
}

export function StateSection({ view }: { view: DebugView }) {
  return (
    <section class="debug-section">
      <h3>{COPY.sections.state}</h3>
      <div data-testid="debug-emotions" class="debug-block">
        {view.emotions.map(([emotion, value]) => (
          <Bar key={emotion} label={COPY.emotion[emotion]} value={value} text={f2(value)} />
        ))}
      </div>
      <Mood view={view} />
      <Load view={view} />
    </section>
  );
}
