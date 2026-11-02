import { formatCard } from '../../game/index.ts';
import type { TraceEntry } from '../../game/index.ts';
import { TALK } from './conversationCopy.ts';
import { f2 } from './format.ts';

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

const two = (n: number): string => String(n).padStart(2, '0');

function clock(ms: number): string {
  const d = new Date(ms);
  const tenth = Math.floor(d.getMilliseconds() / 100);
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}.${tenth}`;
}

function Head({ entry }: { entry: TraceEntry }) {
  const { occasion } = entry.verdict;
  const end = occasion.end === null ? '' : ` ${occasion.end}`;
  return (
    <span class="debug-entry-head">
      {`${TALK.hand} ${occasion.handNumber}, ${occasion.actionStreet}, ${clock(entry.atMs)}: ${occasion.kind}${end}`}
    </span>
  );
}

function Impulses({ entry }: { entry: TraceEntry }) {
  return (
    <>
      {entry.verdict.occasion.impulses.map((i, n) => (
        <span class="debug-impulse" key={n}>{`${i.emotion} +${f2(i.amount)}`}</span>
      ))}
    </>
  );
}

function Rules({ entry }: { entry: TraceEntry }) {
  const { matched, rule } = entry.verdict;
  if (matched.length === 0) {
    return <span class="debug-note">{`${TALK.rules}: ${TALK.noRules}`}</span>;
  }
  return (
    <span class="debug-note">
      {`${TALK.rules}: `}
      {matched
        .map((m) => `${m.id} ${m.act} ${f2(m.chance)}${m.id === rule ? ` (${TALK.chosen})` : ''}`)
        .join('; ')}
    </span>
  );
}

function Gates({ entry }: { entry: TraceEntry }) {
  const { chance, roll, reason, sinceLastMs } = entry.verdict;
  const parts: string[] = [];
  if (sinceLastMs !== null) parts.push(`${seconds(sinceLastMs)} ${TALK.sinceLast}`);
  if (chance !== null) {
    parts.push(
      `${TALK.chance} ${f2(chance.base)}, ${f2(chance.masked)} x ${f2(chance.speakFactor)} = ${f2(chance.final)}`,
    );
  }
  if (roll !== null) parts.push(`${TALK.roll} ${f2(roll)}`);
  const silence =
    reason === null
      ? null
      : reason === 'roll'
        ? `${TALK.silent.roll} ${f2(roll ?? 0)} ${TALK.over} ${f2(chance?.final ?? 0)}`
        : TALK.silent[reason];
  return (
    <>
      {parts.length > 0 && <span class="debug-note">{parts.join(', ')}</span>}
      {silence !== null && <span class="debug-silence">{silence}</span>}
    </>
  );
}

function Plan({ entry }: { entry: TraceEntry }) {
  const { plan, humour } = entry;
  if (plan === null) return null;
  const voice =
    plan.voice.emotion === 'calm' ? 'calm' : `${plan.voice.emotion} ${f2(plan.voice.intensity)}`;
  const joke =
    plan.humour === null
      ? TALK.noHumour
      : `${plan.humour.style} ${plan.humour.target} ${plan.humour.intensity}`;
  const claim =
    plan.claim === null
      ? ''
      : `, ${TALK.claim} ${plan.claim.about} ${plan.claim.honest ? TALK.honest : TALK.acted}`;
  const draw = humour === null ? '' : ` (p ${f2(humour.p)}, ${TALK.roll} ${f2(humour.roll)})`;
  return (
    <>
      <span class="debug-plan">
        {`${TALK.plan}: ${plan.act}, ${voice}, ${plan.words.min} to ${plan.words.max} ${TALK.words}${claim}`}
      </span>
      <span class="debug-note">{`${TALK.humour}: ${joke}${draw}`}</span>
      <span class="debug-note">{factsText(plan)}</span>
    </>
  );
}

type PlanOf = NonNullable<TraceEntry['plan']>;

function factsText(plan: PlanOf): string {
  const f = plan.facts;
  const parts = [
    f.street,
    `pot ${f.potBb.toFixed(1).replace(/\.0$/, '')} bb`,
    `stacks ${f.stacksBb.her} and ${f.stacksBb.player} bb`,
  ];
  if (f.board.length > 0) parts.push(`board ${f.board.map(formatCard).join(' ')}`);
  if (f.card !== null) parts.push(`card ${formatCard(f.card)}`);
  if (f.shown !== null) {
    parts.push(
      `shown ${f.shown.her.map(formatCard).join(' ')} / ${f.shown.player.map(formatCard).join(' ')}`,
    );
  }
  return `${TALK.facts}: ${parts.join(', ')}`;
}

const numbers = (label: string, values: Record<string, number>): string =>
  `${label} ${Object.entries(values)
    .map(([k, v]) => `${k} ${f2(v)}`)
    .join(', ')}`;

function HumourNumbers({ entry }: { entry: TraceEntry }) {
  const { humour } = entry;
  if (humour === null) return null;
  const roll = humour.styleRoll === null ? '' : `; ${TALK.styleRoll} ${f2(humour.styleRoll)}`;
  return (
    <span class="debug-note">
      {`${numbers(TALK.tendency, humour.tendency)}; ${numbers(TALK.state, humour.state)}${roll}`}
    </span>
  );
}

function Exchange({ entry }: { entry: TraceEntry }) {
  const { request, answer } = entry;
  return (
    <>
      {request !== null && (
        <span class="debug-note">{`${TALK.sent} ${clock(request.sentAtMs)}`}</span>
      )}
      {request?.prompt && (
        <details class="debug-prompt">
          <summary>{TALK.prompt}</summary>
          <pre>{`${request.prompt.system}\n\n${request.prompt.state}`}</pre>
        </details>
      )}
      {answer?.attempts.map((a, n) => (
        <span class="debug-attempt" key={n}>
          {`"${a.text}" ${a.rejected.length === 0 ? TALK.passed : a.rejected.join(', ')}`}
        </span>
      ))}
      {answer !== null && request !== null && (
        <span class="debug-note">{`${answer.atMs - request.sentAtMs} ms`}</span>
      )}
    </>
  );
}

export function TraceItem({ entry }: { entry: TraceEntry }) {
  return (
    <li id={`trace-${entry.id}`} data-testid={`trace-${entry.id}`}>
      <Head entry={entry} />
      <Impulses entry={entry} />
      <Rules entry={entry} />
      <Gates entry={entry} />
      <Plan entry={entry} />
      <HumourNumbers entry={entry} />
      <Exchange entry={entry} />
      <span class="debug-note">
        {`${TALK.fate}: ${TALK.fates[entry.fate]}. ${TALK.journal}: `}
        {entry.verdict.occasion.journalIds.map((id) => (
          <a key={id} href={`#journal-${id}`}>{`${id} `}</a>
        ))}
      </span>
    </li>
  );
}
