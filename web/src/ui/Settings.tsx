import { t } from './i18n.ts';
import { voiceAvailable } from './avatar/voice.ts';
import type { Preferences } from './usePreferences.ts';

export interface SettingsProps {
  preferences: Preferences;
  conversation?: boolean;
  conversationOn?: boolean;
  onConversation?: (on: boolean) => void;
}

function Toggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label class="menu-toggle">
      <span>{label}</span>
      <input type="checkbox" role="switch" data-testid={id} checked={checked} onChange={onChange} />
    </label>
  );
}

function ConversationSettings({ preferences, conversationOn, onConversation }: SettingsProps) {
  const on = conversationOn ?? preferences.conversation;
  return (
    <>
      <Toggle
        id="table-conversation"
        label={t('conversation.settings.conversation')}
        checked={on}
        onChange={() => {
          const next = !on;
          preferences.setConversation(next);
          onConversation?.(next);
        }}
      />
    </>
  );
}

function FaceSettings({ preferences }: { preferences: Preferences }) {
  return (
    <>
      <Toggle
        id="face"
        label={t('status.face')}
        checked={preferences.face}
        onChange={preferences.toggleFace}
      />
      {voiceAvailable() && (
        <Toggle
          id="voice"
          label={t('status.voice')}
          checked={preferences.voice}
          onChange={preferences.toggleVoice}
        />
      )}
    </>
  );
}

export function Settings(props: SettingsProps) {
  const { preferences } = props;
  return (
    <>
      <Toggle
        id="sound"
        label={t('status.sound')}
        checked={preferences.sound}
        onChange={preferences.toggleSound}
      />
      <FaceSettings preferences={preferences} />
      {props.conversation === true && <ConversationSettings {...props} />}
      <Toggle
        id="coach-mode"
        label={t('coach.mode')}
        checked={preferences.coach}
        onChange={preferences.toggleCoach}
      />
      <Toggle
        id="auto-next"
        label={t('status.autoNext')}
        checked={preferences.autoNext}
        onChange={preferences.toggleAutoNext}
      />
      <Toggle
        id="simple-table"
        label={t('status.simpleTable')}
        checked={preferences.simple}
        onChange={preferences.toggleSimple}
      />
    </>
  );
}
