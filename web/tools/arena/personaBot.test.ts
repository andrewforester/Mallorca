import { beforeAll, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../../src/cards/index.ts';
import type { BotBias } from '../../src/brains/index.ts';
import type { EngineEvent } from '../../src/engine/index.ts';
import { PERSONALITIES, createPersona, styleOf, toBotBias } from '../../src/persona/index.ts';
import type { Persona } from '../../src/persona/index.ts';
import { botFactory, prepareBots } from './bots.ts';
import type { BotFactory } from './bots.ts';
import { cfrBrainOf, SHIPPED } from './cfrModels.ts';
import { playPair } from './match.ts';
import { createPersonaBot } from './personaBot.ts';

interface Step {
  events: readonly EngineEvent[];
  now: number;
  hand: number;
  seat: number;
}

interface Watched {
  biases: BotBias[];
  persona: Persona | null;
  steps: Step[];
}

function watched(seen: Watched, personality = PERSONALITIES.nina): BotFactory {
  return (rng, seat) => {
    const brain = cfrBrainOf(SHIPPED, rng);
    const setBias = brain.setBias.bind(brain);
    brain.setBias = (bias) => {
      seen.biases.push(bias);
      setBias(bias);
    };
    const persona = createPersona({ seat, rng, personality });
    seen.persona = persona;
    const observe = persona.observe.bind(persona);
    vi.spyOn(persona, 'observe').mockImplementation((events: readonly EngineEvent[], now) => {
      const moments = observe(events, now);
      seen.steps.push({ events, now, hand: persona.view(now).hand.handNumber, seat });
      return moments;
    });
    return createPersonaBot(brain, persona, seat);
  };
}

describe('createPersonaBot', () => {
  beforeAll(() => prepareBots(['cfr']));

  it('starts from her natural style and moves it as she feels the session', () => {
    const seen: Watched = { biases: [], persona: null, steps: [] };
    playPair(watched(seen), botFactory('always-raise'), 2, 0, 40);
    const nina = PERSONALITIES.nina;
    expect(seen.biases[0]).toEqual(toBotBias(styleOf(nina.bigFive)));
    const moved = seen.biases.some(
      (b) => Math.abs(b.aggression - seen.biases[0]!.aggression) > 0.01,
    );
    expect(moved).toBe(true);
  }, 60_000);

  it('runs her clock on the model time of the table', () => {
    const seen: Watched = { biases: [], persona: null, steps: [] };
    playPair(watched(seen), botFactory('always-call'), 1, 0, 3);
    let now = 0;
    for (const step of seen.steps.filter((x) => x.seat === seen.steps[0]!.seat)) {
      for (const e of step.events) {
        now += e.type === 'handStarted' ? 8000 : e.type === 'acted' ? 6000 : 0;
      }
      expect(step.now).toBe(now);
    }
    expect(now).toBeGreaterThan(3 * 8000);
  }, 60_000);

  it('narrows her view of his range after each step with his action in a live hand', () => {
    const seen: Watched = { biases: [], persona: null, steps: [] };
    const narrowed: number[] = [];
    const factory: BotFactory = (rng, seat) => {
      const bot = watched(seen)(rng, seat);
      vi.spyOn(seen.persona!, 'narrow').mockImplementation((_w, hand) => narrowed.push(hand));
      return bot;
    };
    playPair(botFactory('always-call'), factory, 4, 0, 3);
    const expected = seen.steps
      .filter(({ events }) => !events.some((e) => e.type === 'handEnded'))
      .filter(({ events, seat }) => events.some((e) => e.type === 'acted' && e.seat !== seat))
      .map(({ hand }) => hand);
    expect(expected.length).toBeGreaterThan(0);
    expect(narrowed).toEqual(expected);
  }, 60_000);

  it('reads his range from the brain only on a step with his action in a live hand', () => {
    const seen: Watched = { biases: [], persona: null, steps: [] };
    let reads = 0;
    const counting: BotFactory = (rng, seat) => {
      const brain = cfrBrainOf(SHIPPED, rng);
      const range = brain.opponentRange.bind(brain);
      brain.opponentRange = () => {
        reads += 1;
        return range();
      };
      const persona = createPersona({ seat, rng, personality: PERSONALITIES.nina });
      const observe = persona.observe.bind(persona);
      vi.spyOn(persona, 'observe').mockImplementation((events: readonly EngineEvent[], now) => {
        const moments = observe(events, now);
        seen.steps.push({ events, now, hand: 0, seat });
        return moments;
      });
      return createPersonaBot(brain, persona, seat);
    };
    playPair(botFactory('always-call'), counting, 4, 0, 3);
    const expected = seen.steps
      .filter(({ events }) => !events.some((e) => e.type === 'handEnded'))
      .filter(({ events, seat }) => events.some((e) => e.type === 'acted' && e.seat !== seat));
    expect(reads).toBe(expected.length);
  }, 60_000);

  it('sets the bias of her persona before every decision', () => {
    const brain = cfrBrainOf(SHIPPED, mulberry32(1));
    const set = vi.spyOn(brain, 'setBias');
    const persona = createPersona({ seat: 0, rng: mulberry32(1), personality: PERSONALITIES.lola });
    const bot = createPersonaBot(brain, persona, 0);
    const view = persona.view(0).bias;
    expect(set).not.toHaveBeenCalled();
    bot.decide({ fold: false, check: true, call: null, raise: null });
    expect(set).toHaveBeenCalledWith(view);
  });
});
