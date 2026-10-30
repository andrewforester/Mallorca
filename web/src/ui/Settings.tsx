import { t } from './i18n.ts';
import type { Preferences } from './usePreferences.ts';

export function Settings({ preferences }: { preferences: Preferences }) {
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
      <label class="menu-toggle">
        <input
          type="checkbox"
          data-testid="sound"
          checked={preferences.sound}
          onChange={preferences.toggleSound}
        />
        <span>{t('status.sound')}</span>
      </label>
    </>
  );
}
