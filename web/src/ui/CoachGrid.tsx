import { CELLS, cellName } from '../game/index.ts';
import type { CoachMove } from '../game/index.ts';

const TONE_VAR = {
  fold: '--color-coach-fold',
  passive: '--color-coach-passive',
  small: '--color-coach-small',
  large: '--color-coach-large',
  allIn: '--color-coach-all-in',
} as const;

export function toneColor(move: CoachMove): string {
  return `var(${TONE_VAR[move.tone]})`;
}

function stripes(moves: CoachMove[], shares: number[]): string {
  let start = 0;
  const stops = moves.map((move, k) => {
    const end = start + (shares[k] ?? 0) * 100;
    const stop = `${toneColor(move)} ${start.toFixed(1)}% ${end.toFixed(1)}%`;
    start = end;
    return stop;
  });
  return `linear-gradient(to right, ${stops.join(', ')})`;
}

interface GridProps {
  kind: 'strategy' | 'range';
  testId: string;
  label: string;
  heroCell: number | null;
  cellStyle: (cell: number) => Record<string, string> | null;
}

function Grid({ kind, testId, label, heroCell, cellStyle }: GridProps) {
  return (
    <div class={`coach-grid coach-grid-${kind}`} role="img" aria-label={label} data-testid={testId}>
      {Array.from({ length: CELLS }, (_, cell) => {
        const style = cellStyle(cell);
        const classes = [
          'coach-cell',
          style === null ? 'coach-cell-dead' : '',
          heroCell === cell ? 'coach-cell-hero' : '',
        ];
        return (
          <span
            key={cell}
            class={classes.filter(Boolean).join(' ')}
            style={style ?? undefined}
            aria-hidden="true"
          >
            {cellName(cell)}
          </span>
        );
      })}
    </div>
  );
}

export function StrategyGrid(props: {
  moves: CoachMove[];
  cells: (number[] | null)[];
  heroCell: number;
  label: string;
}) {
  return (
    <Grid
      kind="strategy"
      testId="coach-strategy"
      label={props.label}
      heroCell={props.heroCell}
      cellStyle={(cell) => {
        const shares = props.cells[cell];
        return shares === null || shares === undefined
          ? null
          : { background: stripes(props.moves, shares) };
      }}
    />
  );
}

export function RangeGrid(props: {
  cells: (number | null)[];
  heroCell: number | null;
  label: string;
}) {
  const top = Math.max(...props.cells.map((w) => w ?? 0), Number.MIN_VALUE);
  return (
    <Grid
      kind="range"
      testId="coach-range"
      label={props.label}
      heroCell={props.heroCell}
      cellStyle={(cell) => {
        const weight = props.cells[cell];
        return weight === null || weight === undefined
          ? null
          : { '--weight': (weight / top).toFixed(3) };
      }}
    />
  );
}
