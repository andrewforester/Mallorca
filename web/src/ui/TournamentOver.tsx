import { t } from './i18n.ts';

export interface TournamentOverProps {
  won: boolean;
  winner: string;
  hands: number;
  onPlayAgain: () => void;
  onLeave: () => void;
}

export function TournamentOver(props: TournamentOverProps) {
  const { won, winner, hands, onPlayAgain, onLeave } = props;
  return (
    <div class="overlay" data-testid="tournament-over" role="dialog" aria-modal="true">
      <div class="dialog end-panel">
        <h2 class="dialog-title">{t('over.title')}</h2>
        <p class="dialog-line">
          {t(won ? 'over.won' : 'over.lost', { count: hands, name: winner })}
        </p>
        <div class="end-actions">
          <button type="button" class="button" data-testid="play-again" onClick={onPlayAgain}>
            {t('over.again')}
          </button>
          <button type="button" class="button" data-testid="leave-tonight" onClick={onLeave}>
            {t('over.leave')}
          </button>
        </div>
      </div>
    </div>
  );
}
