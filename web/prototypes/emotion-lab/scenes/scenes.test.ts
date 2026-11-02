import { createEngine } from '../../../src/emotion/index.ts';
import { PROFILES } from '../profiles.ts';
import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { mulberry32 } from '../../../src/cards/index.ts';
import { loadBlueprint } from './blueprint.ts';
import type { Ranges } from './blueprint.ts';
import { createRunner } from './runner.ts';
import type { RunnerHooks } from './runner.ts';
import { SCENES } from './scenes.ts';

const silent: RunnerHooks = {
  table: () => {},
  log: () => {},
  impulses: () => {},
  say: () => {},
  player: () => {},
  gaze: () => {},
  effort: () => {},
  head: () => {},
  gesture: () => {},
};

const sceneById = (id: string) => SCENES.find((s) => s.id === id)!;

function runnerFor(id: string) {
  const runner = createRunner(createEngine(PROFILES.mira.personality), silent, () => mulberry32(7));
  runner.start(sceneById(id));
  return runner;
}

describe('scene hands', () => {
  it('gives the aces 91% against the shown gutshot on the turn of the bad beat', () => {
    expect(runnerFor('badbeat').equityAt(0, 4, true)).toBeCloseTo(40 / 44, 2);
  });

  it('drops the bottom set to a few percent once top set is shown in the cooler', () => {
    const runner = runnerFor('cooler');
    expect(runner.equityAt(0, 3, false)).toBeGreaterThan(0.85);
    expect(runner.equityAt(0, 3, true)).toBeLessThan(0.06);
  });

  it('leaves ace king about 14% on the turn of the suckout', () => {
    expect(runnerFor('suckout').equityAt(0, 4, true)).toBeCloseTo(6 / 44, 2);
  });

  it('plays every scene to the end with every profile without throwing', () => {
    for (const profile of Object.values(PROFILES)) {
      for (const scene of SCENES) {
        const engine = createEngine(profile.personality);
        const runner = createRunner(engine, silent, () => mulberry32(3));
        runner.start(scene);
        for (let t = 0; t <= scene.length; t += 0.5) {
          runner.update(t);
          engine.step(0.5);
        }
        expect(engine.snapshot().prospect).toBeDefined();
      }
    }
  });
});

describe("the player's range from the blueprint", () => {
  let ranges: Ranges | null = null;

  beforeAll(async () => {
    ranges = await loadBlueprint(async (url) => new Uint8Array(await readFile(url)));
  });

  it('narrows him after his raise over her top pair and after his turn bet', () => {
    const runner = createRunner(
      createEngine(PROFILES.mira.personality),
      silent,
      () => mulberry32(7),
      ranges ?? undefined,
    );
    runner.start(sceneById('raisetoppair'));
    const random = runner.equityAt(0, 3, false);
    expect(random).toBeGreaterThan(0.8);
    expect(runner.equityAt(0, 3, false, 5)).toBeLessThan(random - 0.1);
    expect(runner.equityAt(0, 4, false, 9)).toBeLessThan(runner.equityAt(0, 4, false, 5) - 0.1);
  });

  it('reads every narrow beat right after an action of his in the line', () => {
    for (const scene of SCENES) {
      let hand = 0;
      for (const beat of scene.beats) {
        if (beat.do === 'deal') hand = beat.hand ?? 0;
        if (beat.do !== 'narrow') continue;
        const line = scene.hands[hand]?.line ?? [];
        expect(beat.after).toBeLessThanOrEqual(line.length);
        expect(line[beat.after - 1]?.startsWith('him ')).toBe(true);
      }
    }
  });
});
