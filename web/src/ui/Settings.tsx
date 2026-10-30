import type { Level } from '../game/index.ts';
import { t } from './i18n.ts';
import type { Preferences } from './usePreferences.ts';

const LEVELS: readonly Level[] = ['obvious', 'subtle', 'hidden'];

export interface SettingsProps {
  preferences: Preferences;
  talk?: boolean;
  onTalk?: (on: boolean) => void;
  onTells?: (level: Level) => void;
}

function TalkSettings({ preferences, onTalk, onTells }: SettingsProps) {
  return (
    <>
      <label class="menu-toggle">
        <input
          type="checkbox"
          data-testid="table-talk"
          checked={preferences.talk}
          onChange={() => {
            const next = !preferences.talk;
            preferences.setTalk(next);
            onTalk?.(next);
          }}
        />
        <span>{t('talk.settings.talk')}</span>
      </label>
      <label class="menu-toggle menu-select">
        <span>{t('talk.settings.tells')}</span>
        <select
          data-testid="tells"
          value={preferences.tells}
          onChange={(event) => {
            const value = (event.currentTarget as HTMLSelectElement).value;
            const level = LEVELS.find((candidate) => candidate === value) ?? 'subtle';
            preferences.setTells(level);
            onTells?.(level);
          }}
        >
          {LEVELS.map((level) => (
            <option key={level} value={level}>
              {t(`talk.settings.levels.${level}`)}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

export function Settings(props: SettingsProps) {
  const { preferences } = props;
  return (
    <>
      <label class="menu-toggle">
        <input
          type="checkbox"
          data-testid="simple-table"
          checked={preferences.simple}
          onChange={preferences.toggleSimple}
        />
        <span>{t('status.simpleTable')}</span>
      </label>
      <label class="menu-toggle">
        <input
          type="checkbox"
          data-testid="auto-next"
          checked={preferences.autoNext}
          onChange={preferences.toggleAutoNext}
        />
        <span>{t('status.autoNext')}</span>
      </label>
      {props.talk === true && <TalkSettings {...props} />}
    </>
  );
}
