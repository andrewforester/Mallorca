import { mountFace, rigRenderer } from '../../src/ui/avatar/live.ts';
const weights: Record<string, number> = {};
for (const part of (new URLSearchParams(location.search).get('w') ?? '').split(',')) {
  const [n, v] = part.split(':');
  if (n) weights[n] = Number(v);
}
const frame = {
  felt: [0, 0, 0],
  shown: [0, 0, 0],
  mask: 0,
  weights,
  head: [0, 0, 0],
  gaze: [0, 0],
  idle: { nervous: 0, arousal: 0, blinkRate: 0.0001 },
  prosody: { rate: 1, pitch: 1, volume: 1 },
} as const;
await mountFace(document.getElementById('stage')!, {
  create: rigRenderer(`${import.meta.env.BASE_URL}avatar/her/`, 'side-swept'),
  frame: () => frame as never,
  calm: true,
  onLost: () => {},
});
document.body.dataset.ready = '1';
