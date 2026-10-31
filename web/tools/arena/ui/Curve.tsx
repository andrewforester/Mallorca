const WIDTH = 720;
const HEIGHT = 220;
const PAD = 8;

interface Props {
  points: { pair: number; bb: number }[];
}

export function Curve({ points }: Props) {
  const last = points.at(-1);
  if (last === undefined) return null;
  const values = points.map((p) => p.bb);
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values);
  const span = high - low || 1;
  const x = (pair: number) => PAD + ((WIDTH - 2 * PAD) * pair) / last.pair;
  const y = (bb: number) => PAD + ((HEIGHT - 2 * PAD) * (high - bb)) / span;
  const path = [`${x(0)},${y(0)}`, ...points.map((p) => `${x(p.pair)},${y(p.bb)}`)].join(' ');
  return (
    <figure class="curve">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Cumulative big blinds for A by pair"
      >
        <line class="zero" x1={PAD} x2={WIDTH - PAD} y1={y(0)} y2={y(0)} />
        <polyline class={last.bb < 0 ? 'loss' : 'win'} points={path} />
      </svg>
      <figcaption>
        <span>{`High ${Math.round(high)} bb, low ${Math.round(low)} bb`}</span>
        <span>{`${Math.round(last.bb)} bb after ${last.pair} pairs`}</span>
      </figcaption>
    </figure>
  );
}
