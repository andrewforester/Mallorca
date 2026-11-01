import { t } from './i18n.ts';
import { voiceAvailable } from './avatar/voice.ts';
import type { Preferences } from './usePreferences.ts';

export interface SettingsProps {
  preferences: Preferences;
  conversation?: boolean;
  conversationOn?: boolean;
  onConversation?: (on: boolean) => void;
}

function ConversationSettings({ preferences, conversationOn, onConversation }: SettingsProps) {
  const on = conversationOn ?? preferences.conversation;
  return (
    <>
      <label class="menu-toggle">
        <input
          type="checkbox"
          data-testid="table-conversation"
          checked={on}
          onChange={() => {
            const next = !on;
            preferences.setConversation(next);
            onConversation?.(next);
          }}
        />
        <span>{t('conversation.settings.conversation')}</span>
      </label>
    </>
  );
}

function FaceSettings({ preferences }: { preferences: Preferences }) {
  return (
    <>
      <label class="menu-toggle">
        <input
          type="checkbox"
          data-testid="face"
          checked={preferences.face}
          onChange={preferences.toggleFace}
        />
        <span>{t('status.face')}</span>
      </label>
      {voiceAvailable() && (
        <label class="menu-toggle">
          <input
            type="checkbox"
            data-testid="voice"
            checked={preferences.voice}
            onChange={preferences.toggleVoice}
          />
          <span>{t('status.voice')}</span>
        </label>
      )}
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
      <label class="menu-toggle">
        <input
          type="checkbox"
          data-testid="sound"
          checked={preferences.sound}
          onChange={preferences.toggleSound}
        />
        <span>{t('status.sound')}</span>
      </label>
      <label class="menu-toggle">
        <input
          type="checkbox"
          data-testid="coach-mode"
          checked={preferences.coach}
          onChange={preferences.toggleCoach}
        />
        <span>{t('coach.mode')}</span>
      </label>
      <FaceSettings preferences={preferences} />
      {props.conversation === true && <ConversationSettings {...props} />}
    </>
  );
}
