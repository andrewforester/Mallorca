import { PERSONALITIES } from '../../game/index.ts';
import type { BigFive, DebugView, Personality, PersonalityKey, Session } from '../../game/index.ts';
import { COPY } from './copy.ts';
import { f2, padText } from './format.ts';

const KEYS = Object.keys(PERSONALITIES) as PersonalityKey[];
const BIG_FIVE = Object.keys(COPY.bigFive) as (keyof BigFive)[];

interface Slider {
  id: string;
  label: string;
  min: number;
  value: number;
  put: (p: Personality, v: number) => Personality;
}

function slidersOf(view: DebugView): Slider[] {
  const five = BIG_FIVE.map((key) => ({
    id: key,
    label: COPY.bigFive[key],
    min: -1,
    value: view.bigFive[key],
    put: (p: Personality, v: number) => ({ ...p, bigFive: { ...p.bigFive, [key]: v } }),
  }));
  return [
    ...five,
    {
      id: 'suppression',
      label: COPY.suppression,
      min: 0,
      value: view.suppression,
      put: (p, v) => ({ ...p, suppression: v }),
    },
    {
      id: 'experience',
      label: COPY.experience,
      min: 0,
      value: view.experience,
      put: (p, v) => ({ ...p, experience: v }),
    },
  ];
}

function current(view: DebugView): Personality {
  return { bigFive: view.bigFive, suppression: view.suppression, experience: view.experience };
}

function Traits({ view }: { view: DebugView }) {
  const t = view.traits;
  if (t === null) {
    return null;
  }
  return (
    <table class="debug-table">
      <tbody>
        <tr>
          <td>{COPY.traits.defaultMood}</td>
          <td>{padText(t.defaultMood)}</td>
        </tr>
        <tr>
          <td>{COPY.traits.composure}</td>
          <td>{f2(t.composure)}</td>
        </tr>
        <tr>
          <td>{COPY.traits.discipline}</td>
          <td>{f2(t.discipline)}</td>
        </tr>
        {t.gains.map(([emotion, gain]) => (
          <tr key={emotion}>
            <td>{`${COPY.traits.gain} ${COPY.emotion[emotion]}`}</td>
            <td>{f2(gain)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Sliders({ view, session }: { view: DebugView; session: Session }) {
  return (
    <details class="debug-details">
      <summary>{COPY.sliders}</summary>
      {slidersOf(view).map((s) => (
        <div class="debug-slider" key={s.id}>
          <label for={`debug-slider-${s.id}`}>{s.label}</label>
          <input
            id={`debug-slider-${s.id}`}
            type="range"
            min={s.min}
            max={1}
            step={0.05}
            value={s.value}
            onInput={(e) => {
              const v = Number((e.currentTarget as HTMLInputElement).value);
              session.getState().setPersonality(s.put(current(view), v));
            }}
          />
          <span class="debug-bar-value">{f2(s.value)}</span>
        </div>
      ))}
      <Traits view={view} />
    </details>
  );
}

export function PersonalitySection({ view, session }: { view: DebugView; session: Session }) {
  const chosen = view.personality.key;
  return (
    <section class="debug-section">
      <h3>{COPY.sections.personality}</h3>
      <div class="debug-picks">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            class="debug-pick"
            data-testid={`debug-personality-${key}`}
            aria-pressed={chosen === key}
            onClick={() => session.getState().setPersonality(key)}
          >
            {COPY.personality[key]}
          </button>
        ))}
        {chosen === 'custom' && <span class="debug-note">{COPY.personality.custom}</span>}
      </div>
      <button
        type="button"
        class="debug-reset"
        data-testid="debug-reset"
        onClick={() => session.getState().resetFeeling()}
      >
        {COPY.reset}
      </button>
      <Sliders view={view} session={session} />
    </section>
  );
}
