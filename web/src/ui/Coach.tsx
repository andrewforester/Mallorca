import { useState } from 'preact/hooks';
import type { CoachFacts, CoachState, Hint } from '../game/index.ts';
import { RangeGrid, StrategyGrid, moveColor } from './CoachGrid.tsx';
import { BlockersView, CompositionView, OutsView } from './CoachInsights.tsx';
import { isMixed, moveText, percent, shares } from './coachPhrases.ts';
import { t } from './i18n.ts';

type Tab = 'hint' | 'range' | 'numbers';

const TABS: readonly Tab[] = ['hint', 'range', 'numbers'];

function HintLine({ hint }: { hint: Hint | null }) {
  return (
    <div class="coach-hint" data-testid="coach-hint">
      <h3 class="coach-heading">{t('coach.hintHeading')}</h3>
      {hint === null ? (
        <p class="coach-note">{t('coach.noHint')}</p>
      ) : (
        <>
          <p class="coach-shares">
            {shares(hint).map(({ move, share }) => (
              <span key={`${move.label}-${move.amount}`} class="coach-share">
                <span class="coach-swatch" style={{ background: moveColor(move, hint.moves) }} />
                {t('coach.share', { move: moveText(move), percent: Math.round(share * 100) })}
              </span>
            ))}
          </p>
          {isMixed(hint) && <p class="coach-note">{t('coach.mixed')}</p>}
          {hint.approximate && <p class="coach-note">{t('coach.approximate')}</p>}
        </>
      )}
    </div>
  );
}

function StrategyTab({ facts }: { facts: CoachFacts }) {
  const { hint, strategy } = facts;
  if (hint === null || strategy === null) {
    return <p class="coach-note">{t('coach.noHint')}</p>;
  }
  return (
    <>
      <StrategyGrid
        moves={hint.moves}
        cells={strategy}
        heroCell={hint.heroCell}
        label={t('coach.strategyCaption')}
      />
      <p class="coach-legend">
        {hint.moves.map((move) => (
          <span key={`${move.label}-${move.amount}`} class="coach-share">
            <span class="coach-swatch" style={{ background: moveColor(move, hint.moves) }} />
            {moveText(move)}
          </span>
        ))}
      </p>
    </>
  );
}

function RangeTab({ facts }: { facts: CoachFacts }) {
  if (facts.range === null) {
    return <p class="coach-note">{t('coach.noRange')}</p>;
  }
  return (
    <>
      <RangeGrid
        cells={facts.range}
        heroCell={facts.hint?.heroCell ?? null}
        label={t('coach.rangeCaption')}
      />
      <p class="coach-note">{t('coach.combos', { combos: Math.round(facts.combos ?? 0) })}</p>
      {facts.composition !== null && <CompositionView composition={facts.composition} />}
    </>
  );
}

function Row({ term, value, detail }: { term: string; value: number; detail?: string }) {
  return (
    <div class="coach-number">
      <dt>{term}</dt>
      <dd>
        <span class="coach-value">{percent(value)}</span>
        {detail !== undefined && <span class="coach-detail">{detail}</span>}
      </dd>
    </div>
  );
}

function NumbersTab({ facts }: { facts: CoachFacts }) {
  const { odds } = facts;
  return (
    <div data-testid="coach-numbers">
      <dl class="coach-numbers">
        {Number.isFinite(facts.equity) && (
          <Row
            term={t('coach.equity')}
            value={facts.equity}
            detail={t(`coach.versus.${facts.versus}`)}
          />
        )}
        {odds !== null && (
          <>
            <Row term={t('coach.required')} value={odds.requiredEquity} />
            <Row term={t('coach.mdf')} value={odds.mdf} />
            <Row term={t('coach.bluffs')} value={odds.bluffShare} />
          </>
        )}
      </dl>
      {odds === null && <p class="coach-note">{t('coach.noBet')}</p>}
      {facts.outs !== null && <OutsView outs={facts.outs} />}
      {facts.blockers !== null && <BlockersView share={facts.blockers} />}
    </div>
  );
}

interface FactsProps {
  facts: CoachFacts;
  tab: Tab;
  setTab: (tab: Tab) => void;
}

function Facts({ facts, tab, setTab }: FactsProps) {
  return (
    <>
      <HintLine hint={facts.hint} />
      <div class="coach-tabs" role="tablist">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            class="coach-tab"
            aria-selected={tab === name}
            data-testid={`coach-tab-${name}`}
            onClick={() => setTab(name)}
          >
            {t(`coach.tabs.${name}`)}
          </button>
        ))}
      </div>
      <div class="coach-tabpanel" role="tabpanel">
        {tab === 'hint' && <StrategyTab facts={facts} />}
        {tab === 'range' && <RangeTab facts={facts} />}
        {tab === 'numbers' && <NumbersTab facts={facts} />}
      </div>
    </>
  );
}

export function Coach({ state }: { state: CoachState }) {
  const [tab, setTab] = useState<Tab>('hint');
  const status = state.status === 'off' ? 'idle' : state.status;
  return (
    <section class="coach-panel glass" aria-label={t('coach.label')}>
      {state.status === 'ready' && state.facts !== null ? (
        <Facts facts={state.facts} tab={tab} setTab={setTab} />
      ) : (
        <p class="coach-status" data-testid="coach-status">
          {t(`coach.${status === 'ready' ? 'idle' : status}`)}
        </p>
      )}
    </section>
  );
}
