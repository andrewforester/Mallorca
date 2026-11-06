# Mallorca redesign: spec for implementation

Source of truth: the design canvas "Mallorca framework" (https://claude.ai/code/artifact/c527db42-177e-4b77-b65a-cda7d5a1c692), stage pages 1 to 7, the Light Trial, and the components `MallorcaTable`, `MallorcaReview`, `MallorcaTalk`, `MallorcaSystem`, `MallorcaOpponents`, `MallorcaNotebook`. Every value below is copied from their inline styles and scripts; UI strings are quoted in their exact English. When this file and the canvas disagree, the canvas wins.

The redesign is built on the `redesign` branch; each subtask is a pull request into it, and one final pull request merges it into `master`. The attic photo scene and the felt are removed: the centre of the table is her face frame.

Reference hand used everywhere: **hand 37**. Blinds 10/20, you have A♠ K♦ on the button. Flop K♥ 7♣ 2♦, turn 5♠, river 3♥. She shows 7♥ 7♦ (three of a kind) and wins 1480.

---

## 1. Visual system (dark table theme)

Concept (stage 2): "An evening by a lamp. She sits opposite, the table between you." A dark, warm room. Light falls on her face. Cards are paper-light. There is no felt, no chip stacks and no neon. Her voice is set in italic serif next to her face. The coach is a cold blue-grey panel with monospaced numbers.

### 1.1 Color tokens (from the stage 7 token library, all confirmed in components)

| Token | Hex | Use |
|---|---|---|
| `bg.night` | `#1D1716` | App and table background |
| `bg.layer` | `#231B19` | Log layer, Talk layer, goal-card unselected |
| `surface` | `#271E1B` | Action panel, sheets, menu, settings groups, result tile |
| `surface.raised` | `#3A2E29` | Toast, my chat bubble, slider track, selected segment, toggle off |
| `ink` | `#F3EBE1` | Main text (14:1 on night) |
| `ink.muted` | `#B9AB9C` | Secondary text (8:1) |
| `ink.faint` | `#8E8174` | Captions, slider labels, "More in Settings", progress fill of auto-next |
| `paper` | `#F4ECE0` | Cards, her speech bubbles, Call/secondary-filled button, dealer chip, slider thumb |
| `her.accent` | `#E0A868` | Amber: Raise button, chip dot, best-hand frame, "On tilt", "Off the strategy", active Talk/Log label, toggle on, focus ring |
| `her.surface` | `#2A201C` | Sound prompt, mic permission card, Her side card, Resume card, selected goal card |
| `coach.accent` | `#8FBAD0` | Slate: coach labels, tab underline, "In the strategy" |
| `coach.surface` | `#1B2428` | Coach line, coach sheet, coach panels |

Additional values used in components (not in the token table, but needed):

- Other inks: `#E9DFD3` (header buttons, pot text), `#D9CDBF` (Her log rows, rules body text, card descriptions), `#2A2420` (text on paper bubbles), `#1D1716` (text on paper/amber buttons).
- Coach family: border `#2F4650`; row divider and bar track `#26363C`; skeleton and "More" button and answer box `#25343A`; selected coach level row `#22333A`; coach text tints `#CFE3EC` (labels), `#D6E8EF` (mono coach line, verdict pill text), `#E3EFF4` (coach prose), `#B4CCD6` (glossary text, captions), `#7F98A2` (words-left line), `#7D9098` (fold bar in desktop legend and mix rows), `#3A4A50` (fold cell in the 169 grid), `#4D5F66` (empty grid cell text).
- Her family borders: `#4A372D` (her.surface border), `#5A4330` (Resume card border; off-strategy street row border), `#4A3A30` (all-in hold base, chat banner border), `#3A2B22` (selected size preset fill), `#2F2522` (her action tag pill; chat banner fill), `#E0C9A8` ("She felt / She showed" line).
- Other: `#4A3D36` (sheet grabber; disabled Send), `#1A1413` (segmented control track, text input fill), `#D6CFC5` (keyboard placeholder in mock).
- Scrim: `rgba(15,11,10,0.35)`. Hairlines: `rgba(243,235,225,0.07)` (header bottom border), `0.08` (menu rows, log), `0.06` (settings rows), `0.14` (tag pill border, empty card slot dashed), `0.15` to `0.2` (outline chips, input border), `0.3` to `0.35` (outline buttons, 1.5 px).
- Suits on paper (4-colour): ♠ `#1D1716`, ♥ `#B8402E`, ♦ `#2D64A8`, ♣ `#2F7A4A`. Suits as text on dark (Notebook lists): ♠ `#E9DFD3`, ♥ `#E8806F`, ♦ `#7FA8E0`, ♣ `#7FBF93`.
- Designer note: amber and slate have the same lightness and saturation; they differ only in hue.

### 1.2 The "lamp" face zone (replaces felt)

There is no table felt. The visual centre is her face frame:

- Background: `radial-gradient(ellipse 70% 60% at 50% 38%, #5A4436 0%, #33261F 55%, #241B18 100%)` on phone; `ellipse 60% 60%` on desktop. On the Meet screen the outer stop is `#1D1716` so it fades into the page.
- Phone frame: `margin: 0 10px`, `border-radius: 22px`, `overflow: hidden`, height animates with `transition: height 600ms ease`. Desktop frame: `border-radius: 26px`, `margin-top: 20px`, inside a 680 px centre column.
- Mock-only placeholder (not for production): stripes `repeating-linear-gradient(135deg, rgba(255,235,210,0.035) 0 8px, transparent 8px 16px)`, a dashed oval `1.5px dashed rgba(243,235,225,0.3)` that sets the framing, and a label in Plex Mono 11 px `rgba(243,235,225,0.6)`.
- Face loading: no spinner. The portrait shows in the same frame with a 3 px amber line (`#E0A868`, 38 % width) at the bottom edge.
- Persona tints (Opponents): each persona has her own muted gradient, e.g. Mira `#4C4A36 → #2E2B1F → #1F1D17`, Ingrid `#43474A → #282B2D → #1B1D1E`, Lola `#5A3A3C → #352223 → #241819`, Nina `#3C4552 → #252B33 → #1A1E23`.

### 1.3 Typography

Fonts (Google Fonts): **Newsreader** (ital, opsz 6..72, wght 400/500, italic 400), **IBM Plex Sans** 400/500/600, **IBM Plex Mono** 400/500.

| Role | Spec |
|---|---|
| Display (end screens, page titles) | Newsreader 400, 34 px/1.1 phone (end), 30 px (Settings/Coach/Goal/This hand), 40 px desktop end, 44 px desktop Goal, 28 px phone rules title, 40 px desktop rules |
| Title | Newsreader 400, 22 px (desktop header wordmark "Mallorca", Tonight header, goal cards on phone) |
| Her voice | Newsreader italic 400: 15 px/1.3 (face off), 16 px/1.3 (chat), 17 px/1.3 (bubble at face), 18 px/1.35 (phone subtitle, review quote), 19 px (Meet), 20 px/1.3 desktop bubble, 21 px desktop Tonight, 22 px desktop subtitle, 26 px desktop Meet |
| Action | Plex Sans 600, 16 px (58 px phone buttons, 56 px desktop) |
| Body | Plex Sans 400, 14 to 15 px; line-height 1.4 to 1.55 |
| Caption | Plex Sans 12 to 13 px |
| Numbers | Plex Mono 500, 13 to 15 px (stacks 14 px 400, pot 15 px 500 phone / 16 px desktop, coach line 13 px), bet sheet value 34 px phone / 30 px desktop, end big number 40 px, review tiles 22 px phone / 24 px desktop |

Rule: Newsreader italic is only for her words. Plex Sans is the interface. Plex Mono is for numbers, stacks and the coach.

### 1.4 Spacing, radii, touch, motion

- Space scale: **4 · 8 · 12 · 16 · 24 · 32**. Common paddings: action panel `12px 14px 26px`; sheets `10px 16px 26px`; header phone 52 px tall with `0 4px 0 18px`; desktop header 64 px with `0 20px 0 32px`.
- Radii: **8 cards · 12 rows · 16 buttons · 22 face and sheets** (desktop buttons 14, desktop face 26, desktop menu 18, pills 999).
- Touch: minimum 44 px; action buttons **58 px on phone, 56 px on desktop**. On 360×740 buttons and presets keep 44 to 58 px.
- Motion: 300 ms bets to the pot · 600 ms face push-in · 25 ms per letter of her line · her line hides after 7 s (plus 25 ms per character) · Talk face resize 500 ms · reduce motion: everything instant, no push-in.

### 1.5 Shadows

- Hole cards: `0 6px 18px rgba(0,0,0,0.35)`.
- Slider thumb: `0 2px 6px rgba(0,0,0,0.4)`.
- Desktop menu popover: `0 20px 50px rgba(0,0,0,0.5)`.
- Mic ring: `box-shadow: 0 0 0 {14px listening | 6px open mic | 0} rgba(224,168,104,0.25)`, 200 ms transition.
- Everything else is flat; separation comes from surface colour and 1 px borders.

### 1.6 Cards

Paper `#F4ECE0`, rank on top (600 weight), suit glyph below, centred, `line-height: 1`, colour by suit (4-colour).

| Card | Size | Radius | Rank / suit size |
|---|---|---|---|
| Board, phone | 52×72 | 8 | 22 / 19 |
| Board, desktop | 62×86 | 8 | 25 / 22 |
| Hole, phone | 66×92 | 9 | 28 / 24, shadow |
| Hole, desktop | 72×100 | 10 | 30 / 26, shadow |
| Her shown cards, phone | 48×68 | 7 | 21 / 18, 2 px amber border |
| Her shown cards, desktop | 56×78 | 8 | 23 / 20, 2 px amber border |
| Talk mini board / hole | 24×34 / 26×36 | 4 | 11 / 10, 12 / 11 |
| Review street board | 30×42 (desktop detail 50×70) | 5 (7) | 13 / 12 (21 / 18) |
| Rules cards | 56×80 phone, 72×102 desktop | 8 / 10 | 23 / 20, 30 / 26 |

- Empty board slot: same size, `1.5px dashed rgba(243,235,225,0.14)`.
- Best five at showdown: 2 px `#E0A868` border, no blinking.
- Card backs (her hidden cards, beside her name): 16×22 phone, 18×25 desktop, radius 3, `repeating-linear-gradient(135deg, #4A372D 0 3px, #3A2C26 3px 6px)`, border `1px rgba(243,235,225,0.18)`.
- Screen reader: cards in full words ("King of hearts").

### 1.7 Chips and bets

No chip stacks. A bet is **one chip dot plus a number**: dot 12 px (14 desktop), `background: #E0A868; border: 2px solid #F4ECE0; border-radius: 50%`, followed by Plex Mono 500 14 px (15 desktop). The pot is text, "Pot 460", Plex Mono 500 15 px `#E9DFD3`. The pot moves to the winner in 300 ms. Dealer button: 22 px circle, `#F4ECE0` with `#1D1716` "D" in Plex Sans 600 11 px.

Her action tag: pill `padding: 6px 12px` (desktop `7px 14px`), radius 999, `#2F2522`, `1px rgba(243,235,225,0.14)` border, 13 px (desktop 14). Contents: "Big blind", "Thinking…", "Check", "Raise to 260", "Bet 420", "Three of a kind", "Won 1480", "Split pot".

### 1.8 Buttons

Three action roles, always in this order on phone (left to right) with column ratio **1 : 1.2 : 1.4**, gap 8 px:

| Role | Style |
|---|---|
| Passive (Fold, Back, Review hand, Not now, Play again, That's enough for tonight, Leave table) | `background: transparent; border: 1.5px solid rgba(243,235,225,0.35); color: #F3EBE1` |
| Secondary filled (Call, Check, Next hand, Sound on, I know the rules, Sit down, Continue with email, Allow microphone, Send) | `background: #F4ECE0; color: #1D1716; border: none` |
| Primary amber (Raise, Bet, confirm size) | `background: #E0A868; color: #1D1716; border: none` |

All: Plex Sans 600 16 px, height 58 px, radius 16 (phone). Desktop: stacked vertically in the right column, Raise on top, Call, Fold at the bottom, height 56, radius 14, label left and key hint right (`padding: 0 18px`); key hint Plex Mono 500 12 px, `padding: 2px 7px; radius 5`, background `rgba(29,23,22,0.15)` on amber, `0.1` on paper, `rgba(243,235,225,0.1)` on outline. Keys **R, C, F**.

Hold for all-in: base `#4A3A30`, amber fill grows left to right over 0.6 s (prototype: 5 % every 30 ms), label "Hold for all-in 1940" in `#F3EBE1` on base and `#1D1716` on the fill.

Small secondary buttons: 44 px tall, radius 10 to 12, `1px solid rgba(243,235,225,0.2)`, 14 px `#E9DFD3` (Copy as text, Add a note, Save, Wait, Type instead). Text buttons in headers: 44 px, no background, 14 px phone / 15 px desktop.

Focus ring: amber 2 px.

### 1.9 Sheets, panels, layers

- **Action panel** (phone, always at the bottom): `#271E1B`, `border-radius: 22px 22px 0 0`, `padding: 12px 14px 26px`, gap 10.
- **Bottom sheet menu** (phone): scrim `rgba(15,11,10,0.35)`, sheet `#271E1B`, radius `22px 22px 0 0`, padding `10px 16px 26px`, grabber 40×4 `#4A3D36`, rows 48 px with `rgba(243,235,225,0.08)` divider, 15 px label, 14 px `#B9AB9C` value.
- **Desktop menu**: popover at `top: 72px; right: 20px`, width 340, radius 18, `#271E1B`, shadow as above, rows 46 px; scrim starts below the 64 px header.
- **Coach sheet** (phone): replaces the table area (not the face): `#1B2428`, top border `1px #2F4650`; header line in Plex Mono 500 12.5 px `#E9DFD3` with "Hide" in `#8FBAD0`; tabs 44 px with 2 px underline `#8FBAD0` when active, active text `#F3EBE1`, inactive `#8FBAD0`.
- **Log layer**: `#231B19`, top border `rgba(243,235,225,0.08)`; desktop version is a card radius 16 in the left column.
- **Toast**: `#3A2E29`, radius 12, `padding: 10px 14px`, 13 px; phone sits 52 px above the action panel; desktop in the right column.
- **Verdict pill** (coach level After): `#1B2428`, `1px #2F4650`, radius 999, 13 px `#D6E8EF`, shown 2.2 s, never over the face.
- **Coach card / line**: `#1B2428`, `1px #2F4650`, radius 12 (14 desktop).
- **Her card** (sound prompt, mic permission, Her side): `#2A201C`, `1px #4A372D`, radius 12 to 16.
- **Notice banner** (Talk errors): `#2F2522`, `1px #4A3A30`, radius 10, 13 px. No red, no alarm icons.
- **Approximate**: `1px dashed #8FBAD0`, radius 10, 13 px `#D6E8EF`.
- **Skeleton** while counting: bars 14 px (12 in summaries), radius 4, `#25343A`, widths 80 / 62 / 70 %.
- **Toggle**: 44×26, radius 13, off `#3A2E29`, on `#E0A868`, thumb 20 px `#F4ECE0` at left 3 / 21 px.
- **Segmented control**: track `#1A1413`, padding 3, radius 12; segments 38 px, radius 9, 13.5 px 500; selected `#3A2E29` + `#F3EBE1`, others `#B9AB9C`.
- **Chips** (quick phrases): 36 px, radius 18, `1px rgba(243,235,225,0.2)`, 13.5 px `#E9DFD3`.
- **Text input**: 44 px (46 desktop), radius 22, fill `#1A1413`, border `rgba(243,235,225,0.2)`, 15 px Plex Sans, placeholder `#8E8174`, max 200 chars.
- **Speech bubble**: paper `#F4ECE0`, text `#2A2420`, radius `16px 16px 16px 4px` (tail bottom-left) at the face on phone; `18px 18px 4px 18px` (tail bottom-right) to the left of the frame on desktop, width 280, `padding: 14px 18px`. Chat bubbles: hers `14px 14px 14px 4px` paper; mine `14px 14px 4px 14px` `#3A2E29`.
- **Verdict marks** (shape plus word, never colour alone): ● In the strategy `#8FBAD0`, ◐ Rare in the strategy `#CFE3EC`, ○ Off the strategy `#E0A868`. No red crosses.

---

## 2. Information architecture (stage 1, Framework)

Title: "The table is home. Everything else comes to the table in layers."

### 2.1 Five principles

1. **One place, not a menu.** Five places: Tonight, the table, Notebook, Opponents, Settings. No tab bar during play; the table opens layers from below.
2. **The face is untouchable.** The top of the screen belongs to her. Layers grow from the bottom and shrink the table; the face is only cropped tighter. Nothing covers it.
3. **Two voices, two materials.** She is warm: lines near her face, a living typeface. The coach is cold: a strict panel, monospaced numbers, no face, no name.
4. **Depth on one axis.** Instead of coach checkboxes, one scale: Off, After, Line, Numbers, Full. The goal picked at first run sets the starting point.
5. **Leaving is just as easy.** Leave table is always one tap from the menu. At session end "Play again" and "That's enough for tonight" have equal weight.

### 2.2 Places, layers, moments (19 screens and layers, 11 new)

- **Entry:** First run (Meet Mallorca, Know the rules?, Rules in 2 min, Your goal) [new]. Sign-in offer, only at moments of value: after the first session, at the worded review, in Notebook [new].
- **Evening:** **Tonight** (start screen and hub: she is in frame, who you play, mode, coach level, Resume tournament; entries to Notebook, Opponents, Settings). **Table** (phases deal, preflop, flop, turn, river, showdown; video is a framing of the face, not a screen). Layers over the table: **Coach** (Line, Strategy, Her range, Numbers, This session), **Talk** (Text, Voice, quick phrases), **Hand log** (current hand by street), **Menu** (quick settings, Pause, Leave table). Moments: **Hand result** (showdown, her reaction, coach line, Next hand), **Hand review** (detailed, her side, Ask the coach) [new], **Session wrap** (result, the coach's story: three observations and one goal; leads to Notebook or Goodnight) [new].
- **Outside play:** **Notebook** [new]: Hands (sessions, hands, filters), Replay (mini table step by step), Hand review (same screen as at the table), Your game (accuracy, trend, leaks), Leak (cost, spots, hands), Coach notes. **Opponents** [new]: Choose (five cards), Her card, You and her, Her look (#75); changes only between sessions. **Settings**: groups instead of a checkbox list, account as a separate row on top: Table (simple table, sound, auto next hand, reduce motion), Her (face, voice, table talk, look), Coach (depth, when to review), Data (export, clear, move to account), Device (face quality), Account (sign in, sync, delete data). Stage 7 adds an Accessibility group.

Why Notebook rather than three sections: history, review and analysis answer one question, "what happened and what to fix". Hand review is one screen from every entry: from the table, from history, from a leak.

### 2.3 Navigation model

- **Phone:** no tab bar. Tonight is the hub with three quiet entries (Notebook, Opponents as two outline buttons; Settings as a header text button). At the table the header carries Talk, Log and ≡ (menu). Layers open from the bottom and close by swiping down or Esc, returning to the table in the same state.
- **Desktop:** the stage 1 note puts the hub as "a narrow side column outside the table". The stage 7 desktop Tonight implements it as a 64 px header with Notebook · Opponents · Settings text buttons and the same three-column grid as the table (`minmax(0,1fr) 680px minmax(0,1fr)`), with the session controls in the right column. Layers open as **side columns**: Talk (and Hand log) on the left, Coach on the right above the actions. The centre with her face never shrinks.
- **Screen map (left to right):** A first run (Meet → Know the rules? → Rules → Your goal) → B hub Tonight (Sit down, Resume tournament, opponent/mode/coach, Notebook/Opponents/Settings) → C Table (hand 37 all phases, Coach, Talk/Voice/Video, Hand log, Menu) ⇄ D between hands (Showdown, Hand result, Hand review "Back to table") → E end (Session wrap "+12.5 bb · 48 hands", Coach notes, Paused "tournament saved") → F leave (Goodnight "Sleep well. The table will be here." with a quiet offer to save history to an account, no "more" button). Out of play, from Tonight and Session wrap: Notebook · Hands, Notebook · Your game, Opponents, Settings · Account.
- **Return rule:** Hand review opened from the table always has "Back to table"; the hand does not proceed while it is open.
- **Pause:** Leave table during a tournament saves it; Tonight shows "Resume tournament · Level 4 · Hand 32". A cash game ends the session through Session wrap.
- **Changing opponent:** only from Tonight and Session wrap. Opponents is not in the table menu.

### 2.4 Face share of screen height (phone rule)

62 % showdown and her decision, 46 % evening, 40 % coach line, 26 % open layer, 20 % keyboard. Never under 20 %; the same shares at 360×740. (Stage 2 component values in §3.1.)

### 2.5 Decisions taken (all marked as accepted proposals in 7a)

- All brief assumptions accepted: five personas, a faceless coach, she explains herself in one line after showdown, no voice commands, no payments.
- Five places, no tab bar; Tonight is hub and start screen.
- History, review and analysis merged into Notebook; Hand review one screen for all entries.
- Coach levels Off, After, Line, Numbers, Full. "Just play" starts at Off, "Get better" at After.
- Review default: "Only when I slip".
- Auto-advance: on in the evening mode, 2 s, no visible countdown number; paused while a coach line is showing. Off in training.
- **No early actions** (no pre-check/fold): she thinks about 0.7 s and her pause is part of the read. Revisit if pauses get longer.
- "On tilt" appears under her name on the plate as text when overload is high, and in the hand log. No icon, no meter.
- Video is the Close-up framing inside the table, not a separate screen.
- Leave table without confirmation; a tournament is saved and paused.
- Desktop layers open as side columns; phone layers from the bottom.
- Error protection: Fold when a free check is available needs a second tap; all-in via the button or slider at max requires a 0.6 s hold with fill; bet size by presets plus a full-width slider.
- Coach "peek": on Off and After, "Show strategy" in the coach layer opens the hint for this move without changing the level. Review timing setting: After every hand · Only when I slip · End of session (default Only when I slip). Coach layer states: The coach is counting · Approximate spot · Words are on their way (server text) · Coach unavailable offline.
- When a feature is missing it vanishes completely or explains itself in one sentence; no broken buttons (table in 2.6).

### 2.6 When a feature is unavailable

| Feature | When | What the player sees |
|---|---|---|
| Her face | Loading, no WebGL, weak device, turned off | Portrait in the same frame, no spinner. Off: name and stack in a soft frame, the face slot shrinks and the table grows. |
| Talk | No server, not the solver | Talk button hidden. Settings · Her: "Table talk needs a connection". |
| Her line | No answer in 5 s, network dropped | She stayed silent, which is human. Your message: "Not delivered. Tap to retry". |
| Limit | 200 lines, daily voice and words limit | Remaining visible in Talk ahead of time. When used up: "That's all the talking for today. Back tomorrow." |
| Her voice | Browser without speech synthesis | Her voice switch not shown; subtitles stay. |
| Microphone | Permission denied | One line in Talk on how to enable it, plus the input field. We never ask again ourselves. |
| Coach | Computing, spot outside the tree, no explanation | The coach is counting · Approximate · grades at once, words load later. |
| History | Not signed in | Works locally, label "On this device only". Sign-in moves it to the account in one step. |

### 2.7 Was → Becomes (stage 1, 7b, verbatim)

| Was | Becomes |
|---|---|
| Bot range | Her range |
| Strategy move | In the strategy |
| Equity to call | Equity needed to call |
| The coach is thinking. | The coach is counting |
| Not delivered | Not delivered. Tap to retry |
| Session (tab) | This session |
| Coach mode (checkbox) | Coach: Off · After · Line · Numbers · Full |
| You win 1480 with Flush | You win 1480 with a flush |
| Thinking… | Thinking… (for screen readers: Mallorca is thinking) |
| (new) | Show strategy · Review · Back to table · On this device only · Resume tournament · You haven't met yet |

---

## 3. Table (stage 2)

### 3.1 Phone 390×844, top to bottom

1. **Header**, 52 px, `padding: 0 4px 0 18px`. Left: status 13 px `#B9AB9C`: "Blinds 10/20 · Hand 37" (tournament: "Tournament · Level 1 · 10/20 · Hand 10"; end screens: "Cash game · Blinds 10/20"). Right: text buttons 44 px, 14 px `#E9DFD3`: "Talk" (hidden when there is no server), "Log" (amber `#E0A868` while open), "≡" (aria-label "Menu", 44×44, 20 px).
2. **Face frame**, margin `0 10px`, radius 22, height by state (`transition: height 600ms ease`), min-height 150 px (120 on 360×740, 96 when off):
   - 360 px default (evening);
   - 320 px when a coach line is showing (Line level and above with a decision, or a result with the coach on);
   - 260 px with the bet-size sheet open;
   - 210 px with the coach sheet or log open ("tighter crop");
   - 430 px at showdown ("slow push-in"); stage note: the face grows from 43 % to 51 % in 600 ms;
   - 340 px on end screens;
   - 96 px with the face turned off (name "Mallorca" in Newsreader 26 px, left padding 20; her line then appears as a 15 px bubble at the right, tail bottom-right);
   - on 360×740 all heights × 0.8.
   - Her line bubble: bottom-left of the frame, `left: 14px; bottom: 14px; max-width: 200px; padding: 10px 14px`, Newsreader italic 17/1.3, typed at 25 ms per letter, hides after ~7 s.
   - Her shown cards (showdown): bottom-right, `right: 14px; bottom: 14px`, 48×68 with amber border.
3. **Her plate**, `padding: 10px 20px 0`, min-height 34. Left: "Mallorca" 15 px 500, stack Plex Mono 14 px `#B9AB9C`, two card backs, optionally "On tilt" 13 px amber. Right: bet (chip dot + number) and action tag pill.
4. **Board area** (flex 1, centred, gap 8): five slots 52×72 with gap 6, then "Pot 460" (Plex Mono 500 15 px `#E9DFD3`), then result text 14 px 500 ("Mallorca wins 1480 with three of a kind").
5. **Your row**, `padding: 0 20px 12px`, centred, gap 16: two hole cards 66×92, then a column: "You" 15 px 500 + dealer "D" chip, stack Plex Mono 14 px muted, bet + your tag ("Small blind", "Raise to 60", "Bet 80", 13 px muted).
6. **Action panel** (see 1.9). Contents by state, top to bottom: sound prompt, tournament level note, coach line or peek link, coach result, then one of: three action buttons, wait text, size sheet, fold check, auto-next bar, result buttons.

### 3.2 Phase states and strings (prototype script)

| Step | Her tag | Panel | Buttons / text |
|---|---|---|---|
| Deal | Big blind | wait | "Dealing" (her bet 20, your bet 10, your tag "Small blind") |
| Preflop, your move | Big blind | buttons | Fold · Call 20 · Raise to 60 |
| She's thinking | Thinking… | wait | "Mallorca is thinking" (15 px `#B9AB9C`, 58 px tall) |
| Flop, after her check | Check | buttons | Fold · Check · Bet 80 |
| Flop, her raise and line | Raise to 260 | buttons | Fold · Call 180 · Raise to 700; her line "I hope you don't have a king." |
| Turn | Check | buttons | Fold · Check · Bet 320 |
| River, her bet | Bet 420 | buttons | Fold · Call 420 · Raise to 1160 |
| Showdown | Three of a kind | blank wait | face 430 px, her cards 7♥ 7♦, her line "Sorry. I really had it this time.", best five outlined (7♣ on board) |
| Result | Won 1480 | result | "Review hand" (outline) · "Next hand" (paper), ratio 1 : 1.4 |
| Split pot | Split pot | result | her line "Even. I'll take it.", "Split pot 240 each" |

### 3.3 Bet-size sheet (overlay "sheet")

Replaces the three buttons in the same panel. Top row: verb ("Raise to" / "Bet") 14 px muted, value Plex Mono 500 **34 px**. Presets grid of three, 44 px, radius 12, label 14 px + value Plex Mono 11 px muted; selected preset border `#E0A868` and fill `#3A2B22`, others border `rgba(243,235,225,0.2)`. Presets: **Half pot, Pot, All-in**; when the pot is larger than the stack, **Min** replaces Pot (river: Min 840 · Half pot 1160 · All-in 1680). Slider row: "−" 44×44 radius 12, track 6 px `#3A2E29` with amber fill, thumb 26 px paper with shadow, "+" 44×44. Step and ± equal the big blind (20). Min and max under the track in Plex Mono 11 px `#8E8174`. Bottom: "Back" (outline) and confirm "Raise to 700" (amber), ratio 1 : 2. At max the confirm becomes "Hold for all-in 1940" (0.6 s hold). Desktop: the same as a card `#271E1B` radius 16 padding 16, value 30 px, presets radius 10, thumb 22 px, labels "440 · ← →", buttons 52 px radius 12; keys: R opens, arrows ± blind, Enter confirms, Esc back, hold Enter for all-in.

### 3.4 Fold protection

When Check is available and you tap Fold: the panel shows "Checking is free. Fold anyway?" (15 px centred) above two buttons 1 : 1, "Fold anyway" (outline) and "Check" (paper). Check sits under the thumb. Normal moves have no confirmations.

### 3.5 Coach on the table (Line level, phone)

Coach line above the buttons: `#1B2428`, `1px #2F4650`, radius 12, `padding: 4px 4px 4px 12px`: "Strategy" 12 px `#8FBAD0`, line Plex Mono 500 13 px `#D6E8EF` ("Call 72% · Raise 21% · Fold 7%"), button "More" 36 px radius 8 `#25343A` `#CFE3EC` 13 px. Result summary: card with "● Flop call · In the strategy" (slate) and "○ River call · Off the strategy" (amber) in 12 px, then prose 14 px/1.45 `#E3EFF4` "Good call on the flop. The river call cost you: her river bets here are rarely bluffs." Clean hand: "● Clean hand. Every move was in the strategy." 13 px slate. Details in §4.

### 3.6 Menu, log, sound, auto-next, tournament, tilt, end screens

- **Menu rows** (label · value): Sound · On; Her face · Live; Her voice · Off; Table talk · On (or "Needs a connection" without a server); Coach · {level}; Auto next hand · Off. Then "Leave table" (outline, 52 px, radius 14) and caption "More in Settings" 12 px `#8E8174`.
- **Hand log** (phone layer replacing the table): header "Hand 37 · log" 14 px 500 and "Hide". Rows are a 96 px street column (12.5 px muted, shown only at a street change, with a `rgba(243,235,225,0.1)` top rule) plus the event 14 px (yours `#F3EBE1`, hers `#D9CDBF`) and her quote under it in Newsreader italic 15 px `#F4ECE0`. Footer 12.5 px `#8E8174`: "Your move. The log stays open while you play." or "Play goes on while the log is open." Events: "Mallorca posts 20 · You post 10", "You raise to 60", "Mallorca calls 60", "Mallorca checks", "You bet 80", "Mallorca raises to 260", "You call 180", "You check", "Mallorca bets 420", "You call 420", "Mallorca shows 7♥ 7♦ and wins 1480". Street labels "Preflop", "Flop K♥ 7♣ 2♦", "Turn 5♠", "River 3♥", "Showdown". On desktop the log is the left column, and her table line goes into the log.
- **Sound prompt** (at her first line): her card "She'd like to say something. Turn sound on?" with "Not now" (outline) and "Sound on" (paper), 44 px, ratio 1 : 1.4.
- **Auto next (evening):** "Next hand in a moment" 15 px muted + "Wait" (outline 44 px); a 3 px bar `#3A2E29` with `#8E8174` fill, no numbers.
- **Tournament level change:** one line before the next hand, amber 6 px dot + "Level 2 next hand: blinds 15/30" 13 px `#E9DFD3`. No popups.
- **On tilt:** "On tilt" 13 px amber next to her stack, plain text; appears at high overload and leaves without animation.
- **End screens** (padding `26px 24px 30px`; title Newsreader 34/1.1, subtitle 15 px muted; buttons 1 : 1, both outline, equal weight):
  - Session over (cash): "Session over" / "Thank you for the company." / big "+12.5 bb" (Plex Mono 40) with "48 hands · 26.0 bb/100" / coach card "Coach" + "Three notes from tonight and one thing to try next time" / "Play again" · "That's enough for tonight". Her line "That was a lovely evening."
  - Good game (tournament): "Good game" / "You lost the tournament at level 8, hand 74." / coach card / "Play again" · "That's enough for tonight". Her line "Good game. You made me work for it."
  - Tournament paused: "Tournament paused" / "Level 4 · Hand 32 · You 2350 · Mallorca 1650. It will wait for you." / "Resume" · "That's enough for tonight".
  - Goodnight: "Sleep well." / "The table will be here." / footer "Your hands are saved on this device. Keep them on all your devices" (link amber). Her line "Sleep well." No return button.

### 3.7 Desktop 1440×900

- Header 64 px, bottom border `rgba(243,235,225,0.07)`, `padding: 0 20px 0 32px`. Left: "Mallorca" Newsreader 22 + status 14 px muted. Right, 44 px buttons radius 10, 15 px: "Talk", "Hand log" (active fill `#2A201C`, amber text), "Coach · {Level}" in slate, "Menu".
- Grid `minmax(0,1fr) 680px minmax(0,1fr)`. **Left column** (`padding: 20px 24px 28px 32px`): Hand log or Talk. **Centre 680 px**: face frame (440 px default, 560 showdown, 420 end, 120 off), her line bubble outside the frame to the left (`right: 100%; margin-right: 20px; bottom: 40px; width: 280px`, italic 20/1.3), her plate (17 px name, 15 px mono stack), board 62×86 gap 8, pot 16 px, your row with 72×100 cards, `padding-bottom: 28px`. **Right column** (`padding: 20px 32px 28px`, aligned to the bottom, gap 12): coach panel (Numbers and Full keep it always open; header "Strategy with your hand" + coach line), toast, verdict pill, coach line card (Line level: "Strategy with your hand" 13 px slate + 15 px mono), result summary, then actions stacked Raise / Call / Fold with key hints.
- Result: "Next hand" (paper) above "Review hand" (outline). End screens centred in the middle column; end buttons stack in the right column with the coach card above.
- Designer note: the stage 2 note says "her line to the left of the frame, never on top; the coach lives on the right. When Talk is open the line goes into the conversation."

### 3.8 360×740 check

Same component: face shrinks by 20 %, buttons and presets keep 44 to 58 px, no horizontal scroll.

### 3.9 Stage 2 assumptions

The dark theme is the only one for the table; light only outside play (Notebook, Settings) on request. Raise presets Half pot, Pot, All-in (Min instead of Pot when the pot exceeds the stack). Slider step and ± equal the big blind. Bets shown as one chip and a number; the pot travels to the winner in 300 ms. Her action label lives on the plate under the frame, not on the face; "Thinking…" there too. Her line sits at the bottom edge of the frame on phone and left of the frame on desktop; with a layer open it moves to Talk. Result waits for Next hand; in auto mode (evening) after 2 s, but not while a coach line is shown.

### 3.10 Was → Becomes (stage 2, 2ae, verbatim)

| Was | Becomes |
|---|---|
| Mallorca wins 1480 with Three of a kind | Mallorca wins 1480 with three of a kind |
| Thinking… (action panel) | Mallorca is thinking |
| (none) | Checking is free. Fold anyway? |
| All-in | Hold for all-in 1940 |
| Good game | Good game + «You lost the tournament at level 8, hand 74.» |
| (none) | Tournament paused · Resume · It will wait for you. |
| Sleep well. The table will be here. | Split into a title and a subtitle |
| (none) | Review hand · Thank you for the company. · Keep them on all your devices |

---

## 4. Coach and hand review (stage 3)

Title: "You decide first. Then the coach says why." The coach lives in the cold blue-grey panel, grows from below and never touches her face.

### 4.1 Levels and what they show

| Level | During your move | After |
|---|---|---|
| Off | Nothing (reviews in Notebook). Start for "Just play". | Nothing. |
| After | Only the quiet dashed link "Show strategy for this move" (36 px, `1px dashed #2F4650`, radius 10, 13 px slate). | Verdict pill for 2.2 s, e.g. "Call 180 · In the strategy"; result line if there was a slip. Start for "Get better". |
| Line | Coach line above the buttons with shares; "More" opens the sheet with Numbers. | Result summary. |
| Numbers | Sheet tabs: Numbers, Her range, This session. Each number has an "i" button with a glossary line. | Same. |
| Full | Adds the Strategy tab first: shares and EV per action (#59), the 169-hand grid with your hand outlined. | Same. |

Tab sets per level: Line → [Numbers]; Numbers → [Numbers, Her range, This session]; Full → [Strategy, Numbers, Her range, This session].

### 4.2 Phone coach sheet

Replaces the table, not the face: face shrinks to 210 px with a tighter crop; the table collapses into the sheet header strip in Plex Mono 12.5 px, e.g. "Pot 460 · K♥ 7♣ 2♦ · A♠ K♦ · To call 180". Action buttons do not move. Content padding `14px 16px`, gap 12.

- **The coach is counting** (0.7 s at each decision): "The coach is counting" 14 px slate and three skeleton bars. Never zeros.
- **Numbers tab**: rows min 44 px with a `#26363C` bottom rule: label 14 px `#CFE3EC`, value Plex Mono 500 15 px `#F3EBE1` right-aligned (max 170 px), "i" button 32 px circle `1px #2F4650`, Newsreader italic 13 px slate (active fill `#25343A`). The glossary opens one sentence under the row (13 px/1.45 `#B4CCD6`), with the hand's numbers filled in; no popups. Rows on the flop: Your equity 64% · Equity needed to call 28% · Minimum defence 43% · Bluffs this bet can hold 28% · Outs "5 · 10% next card · 20% by river" · Blockers "Your K♦ removes some of her kings". Glossary: Your equity "How often your hand wins against her whole range if all the cards were dealt."; Equity needed to call "The share of the final pot you pay. Call when your equity is higher than this. 180 to win 640 is 28%."; Minimum defence "How often you need to continue so her bluffs do not win automatically."; Bluffs this bet can hold "If more than this share of her bets are bluffs, calling makes money."; Outs "Cards that probably give you the best hand."; Blockers "Cards in your hand that make some of her hands impossible."
- **Strategy tab** (Full): rows grid `110px 1fr 44px 62px`: label 13.5 px `#CFE3EC`, bar 8 px radius 4 on `#26363C` filled amber (raise) / paper (call) / `#7D9098` (fold), share Plex Mono 13, EV Plex Mono 12 slate ("+3.1 bb"). Flop: Call 180 72% +3.1 · Raise to 700 21% +2.9 · Fold 7% 0.0. Then "Your whole range here · your hand outlined" (12 px slate), the 13×13 grid (cells 22 px tall, radius 3, gap 2, Plex Mono 7.5 px; each cell a horizontal gradient amber raise / paper call / `#3A4A50` fold; cells outside the range transparent with `#4D5F66` text; your hand AKo outlined `0 0 0 2px #F3EBE1`), legend "Raise · Call · Fold · EV per action, bb" with 10 px swatches.
- **Her range tab**: "Her range" + combos ("86 combos" on the flop, "41 combos" on the river), rows grid `150px 1fr 40px` with slate bars: Sets and better 18 · Two pair 4 · Top pair or overpair 31 · Other pairs 22 · Draws 9 · Nothing yet 16 (river 46/15/24/5/0/10). Footer 12.5 px slate: "The coach never sees her cards. This is everything she could hold after this action."
- **This session tab**: rows "Fold to a river bet" / "You 38% · strategy 55% · 24 spots"; "Call a flop raise" / "Not enough yet · 6 of 10"; "Bet the turn after a call" / "Not enough yet · 4 of 10". Footer "A leak appears after 10 decisions of one kind."
- **Approximate spot**: dashed slate box "Approximate spot. This line is outside the solver tree, so the numbers are estimates."

### 4.3 Short summary after the hand (3m to 3p)

- Slip: two verdict lines plus the prose sentence (see §3.5).
- Words loading: two skeleton bars (12 px, 90 % and 60 %) and "Words are on their way" 12 px slate.
- Clean hand, very quiet: "● Clean hand. Every move was in the strategy."
- When to show (setting): **After every hand** (grades and a line after every hand; a clean hand as one quiet line); **Only when I slip · default** (a line only on "Off the strategy" or a loss over 2 bb, otherwise nothing); **End of session** (nothing during play; all reviews in coach notes after Leave table). The summary never blocks Next hand, and pauses auto-advance while it is on screen.

### 4.4 Hand review, phone (390, scrolls; full scroll is 1640 px)

1. Header 52 px: "‹ Back to table" (15 px) left, "Hand 37 · Cash 10/20" 13 px muted right; bottom border `rgba(243,235,225,0.07)`.
2. Content `padding: 20px 18px 32px`, gap 18. Title "This hand" Newsreader 30/1.1; under it 14 px muted "Mallorca won 1480 with three of a kind." (no showdown: "Mallorca won 1480. She didn't show.").
3. Two tiles 1 : 1, gap 8: warm "Result" `#271E1B` with "−37 bb" (Plex Mono 22); cold "Decisions" `#1B2428` + border with "4 of 5" and "in the strategy". Caption 13 px muted: "Good decisions can still lose a hand. The coach grades the decisions, not the cards."
4. "Street by street" (12 px slate), accordion rows radius 12, min 56 px, grid `76px 1fr auto`: name 14 px 500 + short 11.5 px muted, your action Plex Mono 14, verdict 12.5 px in its colour. Selected row fill `#1B2428` border `#2F4650`; an off-strategy row has border `#5A4330`; others `rgba(243,235,225,0.08)`. Expanded: board mini cards 30×42 + context, a grid You / Strategy / Cost (cost amber), the coach words 14 px/1.5 `#E3EFF4`, and "She felt **X** · She showed **Y**" (12.5 px `#E0C9A8`, values `#F3EBE1`) above a `#2F4650` rule.
   - Preflop · "A♠ K♦ on the button" · Raise to 60 · ● · "A standard open from the button with one of your best hands."
   - Flop · "after her check" · Bet 80 · ● · "A small bet with top pair and the best kicker. Worse kings and sevens pay you."
   - Flop · "facing her raise" · Call 180 · ● · "Top pair is too strong to fold and too thin to raise into sets and two pair. Calling keeps her bluffs in."
   - Turn · "5♠ · both check" · Check · ● · "After her flop raise, checking keeps the pot under control. Her check is often a trap."
   - River · "3♥ · her bet 420" · Call 420 · ○ Off the strategy · Cost −12.1 bb · "After a flop raise and a big river bet, her range is mostly sets and two pair. You need 28% to call and have about 12%. Folding a strong hand here is the hard, right move."
   - Approximate variant on the turn: dashed box "Approximate spot. This grade is an estimate."
5. **Her side** (only after showdown): her card `#2A201C` + `#4A372D` border, radius 16, padding 16: label "Her side" 12 px amber, her two cards; "A set of sevens from the flop. She hid the strength behind a worried face and an apology."; a Felt / Showed table by street (Preflop Calm/Calm, Flop Hope/Worry, Turn Pride/Doubt, River Confidence/Hesitation); her quote Newsreader italic 18/1.35 "I had a set from the flop. The worried face was for you." signed "Mallorca". This is the only place her feelings are named in words. Without showdown: dashed box "No showdown, so her cards and feelings stay private. Only her range is shown above."
6. **Ask the coach** (coach card, radius 16): three question buttons (min 44, radius 10, selected border slate): "Why not raise the flop?", "Why fold a king on the river?", "What did her flop raise mean?"; "The coach is thinking" while answering (0.9 s); answer box `#25343A` 14 px; a pill field "Ask about this hand" (44 px, radius 22, border `#2F4650`); "Words left today: 18 of 20" 12 px `#7F98A2`. Answers: "Raising to 700 folds out her bluffs and gets called by sets and two pair. Calling wins more from the hands you beat." / "Her line, a flop raise and then a big river bet, is mostly sets and two pair. Top pair beats only her few bluffs." / "Her raise to 260 is about 70% value and 30% bluffs and draws. That is why calling once is right, but not twice."
7. Buttons "Copy as text", "Add a note", "Save"; footer 12.5 px `#8E8174` "Reviews show: only when I slip · Change in Settings".

### 4.5 Hand review, desktop

Header 64 px: "‹ Back to table" + "This hand" (Newsreader 22) left; "Hand 37 · Cash 10/20 · Mallorca won 1480 with three of a kind." right. Grid `420px 1fr 380px`, gap 24, padding `24px 32px`. Left: tiles ("Decisions in the strategy" / "4 of 5", 24 px mono), caption, street rows (min 60, grid `96px 1fr auto`), action buttons. Centre: street detail card `#271E1B` radius 18 padding 20 ("River · 3♥ · her bet 420" Newsreader 24, verdict, 50×70 board, "You Call 420 · Cost −12.1 bb"), then the coach card radius 18 ("Coach · strategy with your hand", bars, words 16 px/1.55, Ask the coach with chips 40 px and the field showing "18 of 20 left today"). Right: Her side card with a 150 px face still ("her face at this moment · replay"), quote 20 px.

Coach panel on the desktop table (Numbers/Full): right column card radius 16 with tabs (44 px, 13.5 px), smaller rows (42 px, 28 px "i"), grid cells 19 px. Footer of Her range: "The coach never sees her cards."

### 4.6 Stage 3 assumptions

EV, equity and range numbers in the mocks are plausible, not solved. "Only when I slip" fires on "Off the strategy" or a loss over 2 bb. The phone coach sheet stays open between streets until hidden; it closes itself after the hand. On desktop Numbers and Full keep the panel always open; Line and After behave as on phone. "Felt / Showed" come from the emotion log, two words per street, no meters. Her explanation in review is one line, generated like table lines, from the shared word limit. A question to the coach spends the daily worded-review limit; remaining is shown at the field. The 169 grid shows only your range in this spot; hands outside it are empty. The After pill lasts 2.2 s and never covers the face.

### 4.7 Was → Becomes (stage 3, 3aa, verbatim)

| Was | Becomes |
|---|---|
| Strategy move | In the strategy |
| Bot range | Her range |
| Equity to call | Equity needed to call |
| The coach is thinking. | The coach is counting (calculation) · The coach is thinking (answer to a question) |
| Session | This session |
| Your leaks | This session (at the table) · Your leaks (in Notebook) |
| (none) | Show strategy for this move · Clean hand. Every move was in the strategy. · Words are on their way · Approximate spot · Ask the coach · Ask about this hand · She felt / She showed · Good decisions can still lose a hand. |

---

## 5. Talk (stage 4)

Title: "Conversation at the table that never gets in the way of your move." One Talk layer, three modes: **Text, Voice, Close-up**, switched in one segmented control. Action buttons always visible, even above the keyboard. Her words are always in serif; in voice they run as subtitles under the face, never on top.

### 5.1 Phone 390×844, top to bottom

1. Header 52 px: "Blinds 10/20 · Hand 37"; "Talk" in amber 500 (active; tap closes back to the table), "Log", "≡".
2. Face frame, radius 22, `transition 500ms`: **Text 260 px** (oval 130×170); **with keyboard 150 px** ("her face · eyes to chin"); **Voice 330 px**; **Close-up 450 px** ("close-up · her face talks and reacts"). State pill at the bottom centre of the frame: `rgba(29,23,22,0.82)`, radius 999, `padding: 6px 12px`, 13 px, 8 px dot: Listening (amber), Thinking (slate), Speaking (paper), "Mic on · listening" (amber), "Mic paused" (`#8E8174`).
3. Subtitle (voice modes): Newsreader italic 18/1.35 `#F4ECE0`, centred, `padding: 10px 24px 0`.
4. Table collapsed to a strip (`padding: 10px 16px 0`): board mini cards 24×34 + "Pot 460" (Plex Mono 12.5); right: her tag ("Raise to 260" / "Thinking…") 12.5 px muted and your hole cards 26×36.
5. Talk layer `#231B19`, top border `rgba(243,235,225,0.07)`, margin-top 10:
   - Row: segmented control "Text · Voice · Close-up"; right the limit in 11.5 px `#8E8174` (max 110 px): "186 of 200 left today" / "0 of 200 left today" / "Live voice: 14 of 20 min left today" / "Live voice: used up today".
   - Notice banner when needed (see 5.3).
   - **Text**: thread bottom-aligned, gap 8, bubbles max 80 %: hers paper italic 16/1.3; mine `#3A2E29` 14.5 px; under mine optionally "Not delivered. Tap to retry" (12 px amber, 28 px tap) or "said aloud" (11 px faint). Typing shows her bubble filling letter by letter (25 ms per letter after a 0.9 s pause). Quick phrases row: "Nice hand", "You're bluffing", "Not this time". Input row: field placeholder "Say something to Mallorca" (offline "Waiting for the connection", limit "Talk is resting until tomorrow"), "Send" button (paper; disabled `#4A3D36`).
   - **Voice**: centred column: "You" caption + transcript 15 px `#E9DFD3`; mic button 88 px circle (`#3A2E29` idle with a 16×28 radius-8 glyph in `#F3EBE1`; amber with dark glyph while listening or open mic); label 14 px muted: "Hold to talk" / "Listening. Let go to send" / "She is thinking" / "She is speaking" / "Mic on. Tap to pause" / "Mic paused. Tap to resume"; mode chips 32 px radius 999: "Hold to talk" · "Open mic" (selected `#3A2E29`).
   - **Close-up**: as voice but no transcript and no mode chips; face 450 px.
6. Action panel `#271E1B`, `padding: 8px 12px 24px` (8 px with keyboard): three buttons ratio 1 : 1.2 : 1.4, radius 12, 15 px, **48 px** tall (**40 px** above the keyboard): "Fold", "Call 180", "Raise…" ("Raise…" opens the size sheet and hides the keyboard). On her turn: "Mallorca is thinking" 14 px muted, 44 px.
7. System keyboard 260 px below.

Prototype dialogue: hers "I hope you don't have a king." · mine "You're bluffing" · hers "Am I? You could call and find out." Replies: Nice hand → "Thank you. I got lucky."; Not this time → "We will see about that."; other → "Mm. Play your hand, I am listening." Voice: you "Are you really that strong?", she "Strong enough. Your move."

### 5.2 Desktop 1440×900

Header as the table, "Talk" active (fill `#2A201C`, amber). Grid **`380px 1fr 380px`**. Left: Talk column `#231B19` with right border, padding 16: segmented (38 px, 14 px), limit 12 px, thread (bubbles max 85 %, hers 17 px italic, mine 15 px), quick phrases wrap, input 46 px radius 23 + "Send" 46 px. Voice: mic 88 px, label "… · or hold Space". Centre (`padding: 20px 40px 28px`): face max-width 600 × 420 (Close-up 760 × 600), pill 14 px, subtitle italic 22/1.35 max 620, board cards 48×66 (36×50 in close-up), "Pot 460" 15 px, line "Mallorca 1680 · Raise to 260 · You 1860 · A♠ K♦". Right: actions stacked Raise to 700 / Call 180 / Fold, 56 px radius 14. The centre with her does not shrink.

### 5.3 States and errors (exact strings)

- She stays silent: if no answer in 5 s, nothing is shown (not an error).
- Undelivered: "Not delivered. Tap to retry".
- Offline banner: "No connection. She can't hear you right now. The game goes on." (field and phrases dimmed, phrase text `#6E6359`).
- Limit banner: "That's all the talking for today. Back tomorrow. The game goes on."
- Voice limit banner: "Live voice is used up for today. She will speak in her simple voice, with subtitles."
- No synthesis: "This browser can't speak. Her words appear as subtitles."
- Mic permission card (her card, before the system prompt): title "Talk to her out loud?"; body "Your browser will ask for the microphone. We listen only while you hold the button, and keep the words, not the audio." (desktop: "…while you hold Space or the button…"); buttons "Not now" (outline) and "Allow microphone" (paper), 48 px (46 desktop), ratio 1 : 1.4. "Not now" returns to text with no repeat questions.
- Mic denied: dashed card "The microphone is off for this site. You can turn it on in your browser's site settings, or keep typing." + "Type instead".
- No voice commands: saying "call" is a line to her, not a move.
- Rule of the move: action buttons are never hidden by Talk and never wait for her answer; if she answers after you moved, her line just arrives in the thread.

### 5.4 Stage 4 assumptions

Default Hold to talk; Open mic is turned on manually and shows a permanent "Mic on" pill with a pause. Player audio is never stored, only the transcript. Limits: 200 text lines a day, 20 minutes of live voice; the simple browser voice is unlimited. Quick phrases count against the limit and dim with the field when it runs out. With Talk open, her table line is not duplicated as a bubble at the face; it arrives in the thread while her lips move. Spoken lines enter the thread marked "said aloud". Without a server the Talk button is hidden; Settings · Her shows "Table talk needs a connection". Close-up works on all devices; weak devices show the portrait large with viseme lip movement.

### 5.5 Was → Becomes (stage 4, 4x, verbatim)

| Was | Becomes |
|---|---|
| Not delivered | Not delivered. Tap to retry |
| Table talk (menu) | Talk (button at the table) · Table talk (setting) |
| (none) | Text · Voice · Close-up |
| (none) | Hold to talk · Open mic · Listening · Thinking · Speaking · said aloud |
| (none) | Talk to her out loud? · Allow microphone · Not now · Type instead |
| (none) | No connection. She can't hear you right now. The game goes on. · That's all the talking for today. Back tomorrow. · Live voice: 14 of 20 min left today |

---

## 6. System: onboarding, Tonight, settings, account (stage 7)

Title: "An introduction instead of a tutorial. Settings by meaning, not checkboxes." First run starts with her, not a sign-in screen. The goal sets the coach. Permissions are asked at the moment of need. Account offered when there is something to keep.

### 6.1 First evening order

1. **Meet.** She looks up and speaks first. No logo, no sign-in form. Two buttons: I know the rules / teach me.
2. **Rules**, optional. Four cards on the hand 37 example, each with her line. Skip always visible.
3. **Goal.** "Just play" sets the coach to Off, "Get better" to After. The caption says honestly what you will get.
4. **Table.** Sound asked at her first line: "She'd like to say something. Turn sound on?" Microphone only in Voice.
5. **Sign-in.** Not before the end of the first evening, as a quiet line on Goodnight and in Notebook.

### 6.2 Phone screens

**Meet** (no header): lamp area 560 px (gradient to `#1D1716`, oval 200×260 at top 110, label "her face · looks up from shuffling"), bubble bottom-left (`left: 20px; bottom: 24px; max-width: 280px; padding: 12px 16px`, italic 19/1.3): "Hi. I'm Mallorca. I was hoping someone would come by. Do you play?" Below, aligned to the bottom (`padding: 0 16px 28px`, gap 10): 13.5 px muted "Heads-up hold'em, just the two of you. No money, no account needed."; "I know the rules" (paper, 56 px, radius 16) → Goal; "Teach me first" (outline) → Rules.

**Rules** (4 cards): header 52 px "Rules in 2 minutes · 2 of 4" (13 px muted) + "Skip"; 3 px progress bar `#3A2E29` with amber fill (25 % per card), margin `0 18px`. Body `padding: 24px`, gap 22, centred: card row (56×80, min-height 96), title Newsreader 28/1.2, text 15.5/1.55 `#D9CDBF`, her bubble (italic 16, max 300). Footer "Back" (outline) · "Next" / "Got it" (paper), ratio 1 : 1.6, 56 px.

| # | Title | Text | Her line | Cards |
|---|---|---|---|---|
| 1 | Two cards each | You get two cards only you can see. She gets two of her own. | Don't show me yours. I won't show you mine. | A♠ K♦ |
| 2 | Five on the table | Five shared cards come out in three steps: the flop, the turn, the river. | This is where it gets interesting. | K♥ 7♣ 2♦ 5♠ 3♥ |
| 3 | Bet, call or fold | Between steps you can bet, match her bet, or give up the hand. If one of you folds, the other takes the pot. | Sometimes I bet with nothing. Sometimes. | none |
| 4 | Best five cards win | If nobody folds, you both show. The best five-card hand from your two and the five shared wins. | Three sevens beat a pair of kings. Remember that. | 7♥ 7♦ 7♣ (amber) K♥ 5♠ |

**Goal**: empty 52 px header; "What would you like tonight?" Newsreader 30/1.15; 14 px muted "This sets the coach to start with. You can change it at any time."; two option cards (padding 18, radius 16, border 1.5 px; selected `#E0A868` border on `#2A201C`, unselected `rgba(243,235,225,0.12)` on `#231B19`): title Newsreader 22, description 14 px `#D9CDBF`, tag 12.5 px (amber selected, faint otherwise).
- "Just play" · "A quiet evening at the table. The coach stays out of the way." · "Coach: Off"
- "Get better" (default selected) · "Decide first, then the coach tells you how it went and why." · "Coach: After my move"
Footer "Sit down" (paper, full width, 56 px).

**Tonight** (hub): header 52 px: "Tonight" Newsreader 22 left, "Settings" right. Face 330 px (oval 150×196), bubble bottom-left italic 17: "Back again? Good. I've been practising." Content `padding: 14px 16px 12px`, gap 10:
- Resume card (her card, border `#5A4330`, radius 14): "Resume tournament" 15 px 500 / "Level 4 · Hand 32 · You 2350" 12.5 px muted / amber "›".
- Two tiles 1 : 1 (`#271E1B`, radius 12, min 56): "Game" / "Cash · 100 bb"; "Coach" (slate label) / "After my move" (tap opens Coach settings).
- Coach goal card (coach surface): "From last time" / "Call more often with top pair when she bets the river."
- Two outline buttons 44 px: "Notebook", "Opponents".
- Footer: "Sit down with Mallorca" (paper, min 56, full width; wraps for long strings).
The Russian variant has longer strings; wrapping allowed in buttons, no truncation.

**Settings** (scroll, 1500 px tall full): back "‹ Tonight"; title "Settings" Newsreader 30; account row (`#271E1B`, radius 14, padding 14): signed out "Sign in" / "Keep your evenings on every device", signed in "andrew@example.com" / "Synced a minute ago", chevron. Groups: caption 12 px (Her in amber, Coach in slate, others muted), list `#271E1B` radius 14, rows min 50 with `rgba(243,235,225,0.06)` rules, label 14.5 px, note 12 px faint, value 14 px muted or toggle.
- **Table**: Simple table (toggle, "Fewer animations, flat chips"), Sound (on), Auto next hand (off, "Waits while a coach line is showing"), Reduce motion (off).
- **Her**: Her face · Live; Her voice · Off; Table talk (toggle on); Her look · Soon (faint).
- **Coach**: Coach · After; Reviews · Only when I slip (both open the Coach screen).
- **Data**: Export as text; Export JSON; Clear history · Two taps.
- **Device**: Face quality · Light model ("Full rig on desktop, light model on phones").
- **Accessibility**: Subtitles for her voice (on); Four-colour suits (on); Text size · System.
- **Limited variant** (features unavailable): Her face · Portrait ("This device shows a still portrait"); Her voice · Not available, faint ("This browser can't speak. Subtitles stay on."); Table talk · Offline, faint ("Table talk needs a connection"); Face quality · Portrait. Rule: dimmed row plus one sentence why; no broken toggles.

**Coach** screen: "‹ Settings", title "Coach"; caption "How much the coach shows during a hand"; radio list on coach surface (rows padding `12px 14px`, radio 18 px with 2 px slate ring and 8 px slate dot, selected row `#22333A`): Off "Just the game. Reviews stay in Notebook." · After "Nothing while you decide. A quiet grade after your move." · Line "One line above your buttons: how the strategy plays your hand." · Numbers "Equity, price to call, outs, her range. Each number explained." · Full "Everything, including the 169-hand grid and EV of each move." Caption "When to review a hand": After every hand · Only when I slip · End of session. Footer 12.5 px faint: "Words from the coach need a connection: 18 of 20 left today. Grades always work offline."

**Account, signed out**: "‹ Settings"; "Keep your evenings everywhere" Newsreader 30/1.15; "An account keeps your hands, coach notes and what she remembers about you on every device. Playing without one is fine."; info box "On this device now: 1,248 hands, 14 coach notes."; buttons 54 px radius 14: "Continue with email" (paper), "Continue with Google", "Continue with Apple" (outline); "Not now" text 44 px. After sign-in toast: "Signed in. 1,248 hands moved to your account."

**Account, signed in**: "Account" + "andrew@example.com"; list Sync · A minute ago, Devices · Phone, laptop; "Today's limits" with grey bars (4 px, `#3A2E29` track, `#8E8174` fill, no red): Table talk 186 of 200 · Live voice 14 of 20 min · Coach words 18 of 20; caption "Limits reset at midnight. Playing is never limited."; "Delete my data" (outline row); second tap within 4 s: amber border and text "Tap again to delete everything: hands, notes, what she remembers"; "Sign out".

### 6.3 Desktop 1440×900

- **Meet**: grid `1fr 560px`; left lamp (oval 300×390); right panel padding 64, gap 22: bubble italic 26/1.3 (radius `18px 18px 18px 4px`, padding `16px 20px`), caption 15 px, buttons 56 px radius 14.
- **Rules**: header 64 px with "Rules in 2 minutes · n of 4" and "Skip"; cards 72×102; title Newsreader 40/1.15; text 18 px max 620; bubble 19 px max 440; buttons 440 px wide.
- **Goal**: title 44 px; two 400 px cards (min 180, padding 24, radius 18, title Newsreader 28); "Sit down" 400 px.
- **Tonight**: header 64 px: "Mallorca" + "Tonight", right Notebook · Opponents · Settings. Grid `1fr 680px 1fr`: centre face 560 px (oval 220×286), her bubble left of the frame (italic 21, width 300), caption "Mallorca · warm and calm, rarely loses her temper"; right column bottom-aligned: Resume card, Game tile, Coach tile, "From last time" card, "Sit down with Mallorca". (The opponent page adds: on desktop the mode is duplicated by a button next to Sit down, e.g. "Cash · 100 bb".)
- **Settings / Coach / Account**: header 64 px "‹ Tonight" + "Settings"; grid `300px 1fr`: side nav (44 px items radius 10, selected `#2A201C` + ink, others muted): Account · All settings · Coach; content `padding: 28px 48px 40px`, column **max 620 px**; rows min 52; account titles Newsreader 34; sign-in buttons max 400 wide; Delete and Sign out side by side 2 : 1.

### 6.4 Accessibility (7p)

Keyboard: F, C, R, arrows, Enter, Esc, Space for voice; focus ring amber 2 px. Screen reader: her line reads "Mallorca says…", the coach "Coach…"; cards in full words ("King of hearts"). Suit by glyph and colour; grades by shape and word; highlight by frame, not colour alone. Reduce motion: no face push-in, bets and cards appear at once. Subtitles for her voice on by default. All text at least AA; tap targets from 44 px.

### 6.5 Assumptions (7q)

Tonight is the start screen for returning players; first run starts at Meet. Sign-in via email link, Google or Apple; no passwords. Settings are stored locally and synced after sign-in. The Russian mock shows length headroom; wrapping allowed in buttons, no truncation. The dark theme is the only one for play; the light trial is separate and may become the Notebook and Settings theme.

### 6.6 Strings (7r, verbatim)

New: Hi. I'm Mallorca. · I know the rules · Teach me first · Rules in 2 minutes · What would you like tonight? · Just play · Get better · Tonight · From last time · Resume tournament · Keep your evenings everywhere · Continue with email · Today's limits · Playing is never limited. · Delete my data · Tap again to delete everything.

From the menu: Table talk, Her face, Her voice, Auto next hand, Sound, Coach mode moved into groups; "Coach mode" became "Coach" with the level as its value.

### 6.7 Component library (7o) summary

Action buttons (Fold, Call 180, Raise to 700, Hold for all-in 1940 empty and filling); size presets and slider (Half pot 580, Pot 900, All-in 1940); playing cards (board, hole, highlight, empty, back); her voice (bubble, quote "What she remembers about you" / "You call a lot on the river.", subtitle "Strong enough. Your move."); table plates and pills (Mallorca 1680, On tilt, Raise to 260; Listening, Thinking, Speaking); segmented (Text · Voice · Close-up), chips (Nice hand, Slips), toggle, input ("Say something to Mallorca"); coach line ("Strategy · Call 72% · Raise 21% · More"), numbers row with glossary, summary; verdicts; states (counting, "Approximate spot. The numbers are estimates.", notice "No connection. The game goes on.").

---

## 7. Opponents (stage 5), summary

"People are chosen, not algorithms." No stars, bars or percentages on the card: portrait, name, one-line character and three answers in words (how she plays, how she reads, how hard). Difficulty is part of the character.

- **Two phone patterns:** 5a **List** (calm, all visible; current one tagged "Tonight") and 5b **One at a time** (live face large, her greeting, character; arrows to page). **Recommendation:** 5b for first acquaintance and onboarding, 5a as the permanent screen from Tonight.**
- List header "‹ Tonight", title "Who's at the table tonight?", subtitle "Each of them plays, feels and talks in her own way."; footers "Others will join the table later. For now it's the two of you." and "You can change who you play with between evenings, not during one."
- Personas: **Mallorca** ("Warm and calm. Rarely loses her temper.", A real game), **Mira** ("Even-tempered and kind.", Comfortable), **Ingrid** ("A professional. Plays to win.", The toughest, "Adapts to how you play"), **Lola** ("The life of the party.", Easy-going), **Nina** ("Nervous, and new to the game.", A gentle start). Difficulty words: A gentle start · Easy-going · Comfortable · A real game · The toughest.
- Card sections: How she plays · Reading her · How hard · You and {name} (Evenings, Hands, Result with an honest sample caveat, Reading her bluffs in the cold coach style) · What she remembers about you (2 to 3 lines in her voice, "She forgets it all if you clear your history.") · Her look · Soon · "Sit down with {name}". Not met: "You haven't met yet. She starts getting to know you from the first hand."
- Special cases: solo persona, one face with different characters, first visit, pager with one face. Desktop: grid of personas left, card right, mode button "Cash · 100 bb" beside "Sit down".
- Was → Becomes: Classic · Solver · Solver v2 → five personas by name; Heads-up against Mallorca → Who's at the table tonight? · Sit down with Mallorca; new: How she plays · Reading her · How hard; You and Mallorca · Evenings · What she remembers about you · Reading her bluffs; You haven't met yet. · Too few hands to judge anything yet. · Others will join the table later. · You can change who you play with between evenings, not during one.

## 8. Notebook (stage 6), summary

"Not every number in a row, but an answer to 'what to fix'." Three tabs: **Hands, Your game, Coach notes**. The main number is decision accuracy, not winnings; results always carry a human caveat about sample size. Path leak → spots → replay in three taps. No leaderboards, streaks, day counts or awards.

- **Hands:** sessions expand to hands; filters "Big pots · Slips · Showdown · Saved"; leak filter strip "Spot: Fold to a river bet · 3 most costly first · Clear"; marks ● Clean (slate), ◐ Worth a look, ○ Slip (amber); suits shown as coloured text on dark (♥ `#E8806F`, ♦ `#7FA8E0`, ♣ `#7FBF93`, ♠ `#E9DFD3`); footer Export as text · Export JSON · Clear history (second tap "Tap again to clear"). Local-only banner "Your hands live on this device only. Keep them on all your devices". Empty: "Nothing here yet" / "Every hand you play is kept here, with the coach's notes. Your first evening will appear after you leave the table."
- **Replay:** mini table with her face still at that moment, steps with arrows and a clickable timeline (tall ticks are your decisions, coloured by grade), coach words at decisions, her feelings after showdown ("She felt confidence and showed hesitation."), buttons Full review · Add a note · Copy as text · Play this spot again (dashed, idea only).
- **Your game:** big "71%" "Decisions in the strategy", "Up from 63% over your last 8 evenings. This is the number to watch."; Hands 1,248 · 14 evenings; Result "+4.1 bb/100" "too early to tell", "After 1,248 hands the true result could be anywhere from −14 to +22 bb/100. It takes many thousands of hands to know."; "What to fix first" (top three leaks with cost in bb/100, you vs strategy, confidence in words: under 15 spots "too few", 15 to 60 "a direction", over 60 "clear"); "Against each of them"; "Import hands from other sites · Soon".
- **Leak:** "Fold to a river bet", explanation, "You call 38% · Strategy 55%", "Costs about 3.2 bb per 100 hands. 24 spots: enough to see a direction, not yet to be sure.", most costly spots, "21 more spots in Hands, filtered by this leak."
- **Coach notes** (where session end leads): "Tonight with Mallorca · 48 hands · +12.5 bb · 26.0 bb/100", "Three things the coach noticed", "One thing to try next time: When she bets the river after calling the turn, call more often with top pair.", "Based on 48 hands. A hint, not a verdict.", links "See the three river folds", "Replay hand 37".
- **Move to account** (first sign-in): "Bring your evenings with you?" / "1,248 hands and 14 coach notes are on this device. Move them to your account to see them everywhere." / "Move to my account" · "Keep them here only" / "Nothing is deleted from this device."
- Desktop: three columns (sections, list, detail).
- Was → Becomes: Export history as text → Export as text · Export JSON; Your leaks → What to fix first; Clear history · Tap again to clear (unchanged); new: Notebook · Hands · Your game · Coach notes · Clean · Worth a look · Slip; Decisions in the strategy · too early to tell · Enough spots to see a direction · Too few spots to judge yet; Three things the coach noticed · One thing to try next time · A hint, not a verdict. · Bring your evenings with you? · Nothing is deleted from this device.

---

## 9. Light Trial

"A late lunch under an awning: a linen shirt, a leather strap, a green canopy." A trial light palette taken from her portrait (`assets/mallorca-portrait.png`, used in the face frame with `object-fit: cover; object-position: 50% 22%`). Her colour is warm (skin, terracotta); the coach is the awning green, cold and separate. The background is linen, not white. Same table, same hand 37, same layer order; only materials change.

| Token | Hex | Role |
|---|---|---|
| Linen | `#F6F2EC` | Background |
| Shirt | `#FFFDF9` | Surfaces, cards, her bubble |
| Sand | `#E9DFD2` | Panels (action panel, face frame fill) |
| Hair | `#2B1D17` | Text; also the Call button fill and the dealer chip |
| Brow | `#6F5A4D` | Secondary text |
| Leather | `#9A5733` | Her accent: Raise button, card backs (with `#B06C45` stripes) |
| Awning | `#1E6E58` | Coach accent (deep `#14503F`, surface `#E3F0EA`, border `#B9D8CA`, button `#CFE6DB`) |
| Gold | `#C9A46A` | Highlights: chip dot (with `#FFFDF9` border and 1 px gold ring), best-hand frame |

Other values: card border `1px #DDD3C6`, card shadow `0 2px 6px rgba(43,29,23,0.08)` (board) and `0 6px 16px rgba(43,29,23,0.14)` (hole); her bubble shadow `0 4px 14px rgba(43,29,23,0.18)`; empty slot `1.5px dashed #D2C6B7`; Fold outline `1.5px #8C7566`; suits ♥ `#A8323A`, ♦ `#2F5F9E`, ♣ `#2F6B3F`, ♠ `#2B1D17`; buttons: Fold outline, Call `#2B1D17` with `#F6F2EC` text, Raise `#9A5733` with `#FFFDF9` text. Mocks: La phone flop with Line coach, Lb phone showdown and coach summary, Lc desktop with Numbers panel.

Contrast: text `#2B1D17` on linen 15:1, secondary `#6F5A4D` 6:1, white on leather `#9A5733` 5.3:1, coach dark green on light green 8:1.

Designer's risk note: in daylight the light theme feels like a café, not an evening at home. It may be better as a second theme for Notebook and daytime play, keeping the table dark in the evening. Stage 2 and 7 assumptions agree: dark is the only theme for play; light only outside play (Notebook, Settings) on request. Options offered: apply light everywhere · keep the table dark and use light for Notebook and Settings · make the coach graphite instead of green.
