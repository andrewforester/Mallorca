export interface PlateGeometry {
  focusX: string;
  focusY: string;
  feltTilt: string;
  opponentY: string;
  railY: string;
  boardY: string;
  heroBottom: string;
  cardScale: string;
}

export const LANDSCAPE: PlateGeometry = {
  focusX: '50%',
  focusY: '60%',
  feltTilt: '56deg',
  opponentY: '51%',
  railY: '57.6%',
  boardY: '70%',
  heroBottom: '16px',
  cardScale: 'clamp(48px, 3.9vw, 72px)',
};

export const PORTRAIT: PlateGeometry = {
  focusX: '50%',
  focusY: '55%',
  feltTilt: '50deg',
  opponentY: '42%',
  railY: '48%',
  boardY: '61%',
  heroBottom: '120px',
  cardScale: 'clamp(44px, 12vw, 56px)',
};

export const SIMPLE_LANDSCAPE: PlateGeometry = {
  focusX: '50%',
  focusY: '50%',
  feltTilt: '0deg',
  opponentY: '24%',
  railY: '30%',
  boardY: '50%',
  heroBottom: '24px',
  cardScale: 'clamp(48px, 4.6vw, 72px)',
};

export const SIMPLE_PORTRAIT: PlateGeometry = {
  focusX: '50%',
  focusY: '50%',
  feltTilt: '0deg',
  opponentY: '22%',
  railY: '28%',
  boardY: '48%',
  heroBottom: '132px',
  cardScale: 'clamp(44px, 12vw, 56px)',
};

const NAMES: Record<keyof PlateGeometry, string> = {
  focusX: 'focus-x',
  focusY: 'focus-y',
  feltTilt: 'felt-tilt',
  opponentY: 'opponent-y',
  railY: 'rail-y',
  boardY: 'board-y',
  heroBottom: 'hero-bottom',
  cardScale: 'card-scale',
};

export function geometryStyle(geometry: PlateGeometry, prefix: 'l' | 'p'): Record<string, string> {
  const style: Record<string, string> = {};
  for (const key of Object.keys(NAMES) as (keyof PlateGeometry)[]) {
    style[`--${prefix}-${NAMES[key]}`] = geometry[key];
  }
  return style;
}
