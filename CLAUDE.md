# CLAUDE.md

Working notes for this repo, for every machine and session. Details live in `README.md`
(the app, assets, theme), `src/play/README.md` (full game: scope, house rules, rulings) and
`docs/rules-th.md` (the Thai rulebook reference, with page numbers).

## The project

**ดบดล** is a web app for *Dead by Daylight: The Board Game*, with three modes:

- **Online** (`#/online`): the full game, each player on their own device, rooms on Firebase.
  2–5 players; with 2, one player holds all four survivors (the two-player deck, p.6).
- **Offline** (`#/play`): the full game on one shared device (hot-seat, hand-off curtains).
- **Tutorial** (`#/tutorial`): lessons for new players, the survivors' and the killer's.

The user writes in Thai. Reply in Thai. Everything a player sees in the game is in Thai.

## Commands

```sh
npm install
npm run dev        # http://localhost:5173 (pass --port to run a second one)
npm run build      # vue-tsc -b + vite build into dist/
npm test           # vitest run (the engine tests take ~1 min: random full games)
npx vue-tsc -b     # type-check only
```

Node 22 (as in CI). On Windows, if vitest says "no tests", the shell's working directory has a
lowercase drive letter (`d:` vs `D:`); run `npx vitest run src/play` from PowerShell.

Online play in dev needs `.env.local` at the root (git-ignored; the deploy reads the same two
values from the repo's Actions variables). Without it, online rooms use the local backend, which
only syncs tabs of one browser:

```
VITE_FIREBASE_DATABASE_URL=https://dbd-engine-default-rtdb.asia-southeast1.firebasedatabase.app
VITE_FIREBASE_PROJECT_ID=dbd-engine
```

The app's version is `package.json`'s `version` (major.minor.patch: patch for fixes, minor for
features, major for changes that break saved games or rooms). The build adds the commit and date
(`vite.config.ts`), and `src/version.ts` shows them on the menu. Bump it with a release, and add
its entry to `src/changelog.ts` (Thai, one line per change a player would notice): the "มีอะไรใหม่"
panel opens once on a device that last ran an older version, and the build publishes `version.json`
so open tabs offer a reload when a newer build is out (`src/update.ts`).

Before saying work is done: type-check, tests and build must all pass. Report failures as they are.

## Layout

| Path | What |
|---|---|
| `src/play/engine/` | Rules engine: `engine.ts` (pure reducer), `types.ts`, `perks.ts`, `legal.ts`, `seats.ts`, `boards.ts` (board graphs, read from the map art; `boards.test.ts` checks them), tests |
| `src/play/components/` | Game UI: `GameScreen` (layout), `Board`, `ActionPanel`, `PerkPrompt`, `Planning`, `CardHand`, `StatusPanel` (player tiles), `ObjectiveHud` (both sides' goals, under the tiles), modals |
| `src/play/engine/loadout.ts` | Game modes Adept / Bloodweb / Devout (p.19): the perk-card deck, Bloodweb's draws, what a loadout may hold; `createGame` takes each character's `perks` |
| `src/play/components/PerkLoadout.vue` | The perk loadout screen (PC game style): 3 slots, a honeycomb of perk cards with cost badges, a details box (`PerkRichText` lights key words) |
| `src/play/boardActions.ts` | Everything clickable on the board right now |
| `src/play/focus.ts` | Board highlights and the facts listed for a decision |
| `src/play/labels.ts` | Thai labels for actions, perk choices, windows |
| `src/play/fx/` | Sound effects (`audio.ts`) and the animation queue (`bus.ts`) |
| `src/play/tutorial/` | Tutorial mode (`#/tutorial`): chapters for both sides (`chapters.ts` the survivors', `killer.ts` the killer's) on scenes built from the engine (`scene.ts`), The Entity's guide (`GuideBox`), the runner gating the learner's actions and playing everyone else |
| `src/play/online/` | Firebase and local (multi-tab) backends, room session. The room carries **moves**, not states: each device replays them on the last checkpoint (`transport.ts`) |
| `src/data/` | Character, item and map data (Thai + English text, image paths) |
| `public/assets/` | Card art, maps, minis, sounds (`app/sound/game/` = game sound clips) |
| `public/sw.js`, `src/install.ts` | PWA: service worker and install button |

## Code conventions

- Vue 3 `<script setup lang="ts">`, TypeScript strict. Match the surrounding code: naming, idiom
  and comment density. Code, comments and READMEs are in English; UI strings are in Thai.
- Comments say why, in plain sentences. Rules cite the rulebook page: `(p.14)`.
- Files use CRLF (git `core.autocrlf`). Editing tools keep it; scripts must too.
- No new dependencies without a reason worth stating.

## The engine (`src/play/engine`)

- `apply(state, action)` is a pure reducer: it `structuredClone`s and never mutates its input.
  The RNG (mulberry32) lives in the state, so games replay exactly.
- `state.step` is the input being waited for. Handling an action may queue `Task`s; `run()` works
  through them until one calls `wait(step)`. Illegal input throws `IllegalAction` (`fail()`).
- Log entries carry a structured `ev` (`GameEvent`). Animations, sounds, summaries and stats read
  these events, never the log text.
- Perks: `PerkWindow`s are moments. `trigger(st, window)` asks each owner in turn (survivors in
  turn order, then the killer, p.16). `perkChoices` lists the legal uses, `usePerk` applies one.
  Perks in the owner's own step are buttons (`perkButtons`). Once per round, paid in ▲.
- `GameState.version` is 3. Saved games and online rooms hold old states: add new fields as
  optional (`field?:`), or bump the version together with the check in `src/play/game.ts`.
- When the rulebook is unclear, pick a ruling, write it in `src/play/README.md` (Rulings), and
  tell the user. House rules (the user's own changes to the rules) go under House rules there.

### Perks on boards, perk cards, and the game modes

- Two kinds of perk (the user's ruling, details in `src/play/README.md` → Rulings):
  - **Printed on a board:** purple = a board's first perk, the character's own, with no card;
    green = perks 2–3. Every board has its own, so they block nobody.
  - **Perk cards (gold), one of each:** every green perk, plus the 35 perks on no board
    (`deck(...)` in `perks.ts`, `DECK_PERKS`). A card is with one character at most. So two
    characters may play the same perk: one printed on their board, the other from its card.
- A card is laid over a printed slot. `covered` (card → the printed perk under it) frees that
  perk again when the card discards itself (`discardPerkCard`).
- Modes are the room setting `mode` online, or the players step offline. Adept is the printed
  perks. In Bloodweb and Devout, once every character is locked in, each player sets 3 perks:
  - online, on their own screen;
  - offline, one player at a time behind a hand-off card.

  Bloodweb deals from the seed `perkSeed`, so every device draws the same cards.
- Online, the lobby node holds `loadouts` ("a,b,c" per character key), `perksDone` and
  `perkSeed`. `lobbyOf` in `online/firebase.ts` writes only the fields it lists: a new lobby
  field must be added there, or it is silently dropped.
- A new character's green perks join the card deck by themselves once their perks are in
  `perks.ts`. Their purple perk stays theirs alone.

### Adding a character

1. `perks.ts`: the 3 perks (`PerkId`, `def(...)` with the Thai "when" text); killers also go in
   `PLAYABLE_KILLERS`. Survivors without perks stay locked in the picker. Their Thai names (and the
   power's) go in `src/data/thaiNames.ts`, and on their Thai perk card images (see Perk names).
2. `engine.ts`: `perkChoices` + `usePerk` cases, new windows with `trigger(...)` where they
   happen, and for killers `powerOptions` + `usePower` (and `isPower`).
3. New steps or actions: `types.ts`, `handle()`, `legal.ts` (every step needs legal actions),
   `seats.ts` (`stepOwner`, who acts online).
4. UI: `labels.ts` (`perkChoiceLabel`, `windowLabel`, `killerInteractionLabel`), `focus.ts`
   (highlights and facts), `boardActions.ts` (board targets), and `PerkPrompt` / `ActionPanel`
   for anything new.
5. Tests: add the character to `ALL_SURVIVORS` / `ALL_KILLERS` in `perks.test.ts` (the random
   games must use every perk), update the perk count, and add targeted tests for each new rule.
6. Rulings in `src/play/README.md`, and the scope list there.

## UI rules the user asked for

- **A first visit is greeted by The Entity** (`EntityWelcome`, `welcome.ts`, `dbdl-welcomed`): on the
  menu only (not an invite link), it asks whether the player is new; a new one gets five pages of
  the world over the realms, then picks a side and lands in its first tutorial chapter
  (`#/tutorial?start=<id>`). "No" or skipping lets go; Settings → Data shows it again.
- **Results never run ahead of animations.** `GameScreen` holds the view on the old state while
  dice, perk cards and board animations play. Pending rolls show their dice first.
- **Every rise of the Sacrifice track shows** (`SacrificeReveal` (a ring of 8 cells, new ones filling gold), in the perk cards' queue, from the `sacrifice` event when the total goes up; Breakdown lowering it shows nothing). The eighth is the finale's instead. A rise that comes with a hanging waits for the board to play the hanging first (`afterBoard` in GameScreen; the view moves on, the side panel waits until the reveal is done); so does the finale of a hanging that fills the track, and the summary waits for it.
- **The game's last beat shows before the summary:** Sacrifice filling up or the exit gate
  opening (`FinaleReveal`, `fx.finale`, queued on the `gameOver` event after the cards and rolls
  before it); the screen holds the old state until it is done.
- **The start-room rolls are on the map, not in a modal** (`StartPlacement`, `fx.starts`): after the
  last prop reveal each mini's die tumbles in a strip at the panel's place and the mini drops onto
  its room (`Board`'s `hideMinis`); nobody is asked anything until all are placed. Once per game
  (`intro.ts`).
- **Every action shows before its result.** A player's action (a move with its card, an attack,
  a pallet, a locker, the killer's power, a passive) gets a short card in the middle of the
  screen first (`casts.ts` builds them from the log, `ActionReveal` shows them in the perk
  cards' queue). Perks, items and rolls have their own reveals and are left out there.
- **Online, the player being waited on is told** (`notifyTurn` in `GameScreen`): the skill-check
  warning and a chime, a banner saying what is asked, the side panel glowing, and with the tab in
  the background a blinking title and a system notification. While it stays their turn a gold
  pill at the top and a gold screen edge say so, and every 20 s without a move it rings again.
- **Pings (online):** a right-click on the map (not on a prop or a mini: those show details), the
  middle button, Q while pointing, a long-press on a tablet, the 📍 button or Alt+click marks a spot on the map with a pulsing ring in the
  player's colour, picked in the lobby from a fixed set, one per member (`pings.ts`, `PingLayer`,
  `online/pingColors.ts`). Everyone sees it, the killer too (no secret talk, p.8); spam is limited on the device and by
  the database rules. Not part of the game: never saved or replayed.
- **Chat (online):** one channel for the room, the killer reads it too (p.8), spectators may write
  (`chat.ts`, `ChatPanel`, `ChatDock`). Lobby: a panel beside the room on wide screens, a 💬 button
  otherwise. Game: a 💬 tab under the side panel's tab opens a drawer (Enter to type), an unread
  badge, and each new message as a 6 s bubble beside the sender's tile. Never saved or replayed.
  Notices in it (joined, left, kicked, lost connection, back) come from the members' changes.
- **Voice (online):** one channel for the room, WebRTC between the devices, the room carrying only
  who is in and the connecting signals (`voice.ts`, `VoiceButton`). In the lobby everyone talks;
  from the picks on the players talk and spectators only listen (`mayTalk`). The killer hears
  everyone (p.8). Speaking turns the tile's row (or the lobby seat) green, over a wound's red. The mic is open (M toggles it) or push
  to talk (a key, V by default, or holding the 🎙️ button). Never saved or replayed.
- **History (online):** an online game that ends is saved on each device (IndexedDB `dbdl-history`,
  `play/history.ts`; nothing on the server, the room clears its game on going back to the lobby):
  the players and characters, the result, the stats, the headline events and the whole log as
  this device saw it (another survivor's item got is left out: `maskLog`). The latest 50 stay.
  `#/history` (`HistoryView`, in the top bar) lists them and opens one round by
  round; Settings → Data clears them.
- **Problem reports:** a game in the history can be reported to the developer (🐞, `play/report.ts`):
  the player's note, the round, the app version and the game (its whole last state too, unmasked)
  go to `reports/RP-XXXX-XXXX-XXXX` on Firebase, one a minute per device, readable only by that id
  (the list isn't). The player gets the id; open it with `#/history?report=<id>` (a "full log"
  switch unmasks it), or read it with
  `curl "$VITE_FIREBASE_DATABASE_URL/reports/<id>.json"` to look into a bug.
- **Presence (online):** a member whose connection drops leaves the lobby by itself (Firebase
  `onDisconnect`, `Room.presence`); in a game they keep their seat, marked `dropped`. Re-set after
  every reconnection (`settle` in `session.ts`).
- **Board first.** Every action with a place on the board (path, prop, survivor, room) is
  clickable there. Each `BoardAction` carries its `action`; the side panels hide choices the board
  already offers and show "เลือกบนแผนที่" instead. The exception is a survivor's perk aimed on the
  map: it is armed in the side panel first ("ใช้ [perk]", glowing until pressed; `perksToPick`),
  and only then are its targets on the map, so a path or generator clicked by habit stays an
  ordinary move or repair.
- **Movement cards are picked from the hand** (`CardHand`): point to draw a card up (the map shows
  where it goes), click to pick (it stays up), confirm in the side panel. In planning and on a
  bonus turn a path out of the room on the map picks the card of its colour too (`pathPick.ts`). This covers planning,
  bonus turns, every perk that picks a card, Predator and the Redeemer guess. A player with
  several survivors switches between them with tabs. The hand floats in the bottom-right corner,
  sunk so only the card names show (the side panel stops above them), and rises while the pointer is on a card (or when
  a perk asks for one; on a tablet a tap raises it, the next tap picks and a tap elsewhere puts it down). It has no label of its own. Each card's button stays still and only the card face inside it moves, so the card
  can't bounce under the pointer. Online, while nothing asks for a card, the player's own hand
  rests there anyway, only to look at (`passive`; `openHands` in `hands.ts` says when a hand to
  pick from is out and takes its place).
- **Your own face-down cards can be peeked at:** click one on the player tiles to see your cards
  big in the middle of the screen (the killer sees all his planned cards); a click anywhere
  turns them face down again. Online only the owner can; on one device anyone can, as at a real
  table. Items open in a modal in the middle of the screen too.
- **Secrets.** Hidden information (planned cards, Tinkerer / Zanshin swaps, the Redeemer card) gets
  a hand-off curtain in hot-seat (`secretFor` in `GameScreen`) and is never shown to other players
  online. Online, a survivor's item shows only to its holder; everyone else (the killer, a
  spectator, the other survivors) sees the back of the card (`itemHidden` in
  `src/play/game.ts`, a house rule); an item shows when it is used.
- **Every perk shows as one card** (`PerkCard`), wherever it is (an offer, the start of a turn, the
  interact step, a roll): picture, name, cost, text and a hint. Usable now = it glows ("ready"),
  pressed = "picked" (pressed again to put back), the others "dim"; "static" only explains, its uses
  as buttons under it. The words around it are in `perkHints.ts` (`PERK_LEAD`, `pickedHint`) for
  every panel. "Don't use" is never the loudest button. Offers and the start of a turn are decided
  only in `PerkPrompt`; ActionPanel just points there.
- Perk decisions (`PerkPrompt`) are part of the side panel on wide screens: teleported into
  `#side-dock`, they take the panel's place while open and fold with it (narrow screens: a sheet
  along the bottom). Character choices
  show the character's mini.
- Layout: the round, phase and controls in a bar on top (on 16:9 and wider screens, where the
  height limits the board, there is no bar: they are teleported into the player column, the
  round on top and the controls under the item slot), the board as big as the screen allows, the
  players in a column on its left in the PC game's HUD style (bare rows of portrait, name and
  state, at the foot of the column; a row under the map on narrow screens) with both sides'
  goals under them (`ObjectiveHud`: sacrifices, generators left, then the exit gate) and, under
  those, the slot of whoever plays now (their item, or the killer's power; a click uses it), the side
  panel (320 px) on the right. The side panel folds into one tab on the right edge (always in the same place)
  (the panel's fold is remembered per device, and the board takes its width); the panel's tab
  glows when a new decision comes. On screens narrower than 16:9 (a tablet) the map takes the
  whole row and the panel floats over its right edge. A survivor's tile shows their hand's four movement
  cards small, the ones face up this round (played or discarded) crossed out, so the killer knows
  what is left, as at the table; a card still face down in planning shows as unused. Player tiles don't list perks: clicking a tile opens the
  character details, with the perks and whether they were used this round. There is no game
  log on screen. Pointing at a revealed prop enlarges it.
- **Perk names are Thai** (the PC game's Thai names, `src/data/thaiNames.ts`): `PERKS[p].name` is the
  Thai name and `PERKS[p].en` the English one, shown small beside it on perk cards and details;
  `powerName` and the Guards are Thai too, and Thai UI strings name perks in Thai. The Thai card
  images (`perks-th`) had their English name painted over with the Thai one (Kanit 600, white).
- **Perk text is lit the same everywhere** (`src/perkHighlight.ts`, shown by `src/components/PerkRichText`):
  the game's panels, the card pages and the Thai perk card images (drawn from the same rules). Terms,
  English names and numbers in bold white, props in their category's colour, failure / wounded red,
  success / healthy green, great success gold. A new place showing a perk's text uses PerkRichText.
- Fixed overlays inside a `.card` must `<Teleport to="body">`: `.card` has `backdrop-filter`,
  which traps `position: fixed` children.
- The full game runs on computers and tablets only. Phones get a notice (`src/play/device.ts`:
  a screen whose short side is under 700 px). The card and rules pages still work on phones.

## Checking the UI in a browser

Use `playwright-core` with the installed Edge
(`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`) against the dev server. Keep
scripts in the scratchpad, not the repo. To set up a scene, open `#/play`, then in the page:
`await import('/src/play/engine/engine.ts')` (and `legal.ts`), build a state with `createGame`,
edit it, `localStorage.setItem('dbdl-play-game', JSON.stringify(st))`, and reload. Look at the
screenshots before reporting. For online play, `?test` in the URL exposes `window.__dbdl` and the
local backend syncs browser tabs.

## Settings

The ⚙ button (top bar and the game's rail) opens `src/components/SettingsDialog.vue`, a PC-game
style window with tabs: Sound (volumes, mute, chase music), Display (animation speed, reduce motion,
card language), Online (turn sound, background notice, 20 s reminder), Data (clear the offline
game, reset the tutorial, reset settings). Settings live in `src/settings.ts` (`dbdl-settings`).

- **Animation speed:** a JS timer of an animation is written `anim(ms)`; CSS animations and
  transitions that end are played at the same rate by `settings.ts` (endless ones keep their pace),
  so write CSS durations at full length. Reading time (TrialLoading's minimum), sound clips
  (MatchBeat) and online timers are not animations: leave them unscaled.
- **Reduce motion:** read `reducedMotion` (the device's preference or the setting), never
  `matchMedia` directly; `html.reduce-motion` stops CSS motion page-wide (`style.css`).

## Sounds and PWA

- Game sounds: `src/play/fx/audio.ts`. Recorded clips in `public/assets/app/sound/game/`, with the
  synthesised sound as fallback. They follow the mute toggle in `src/sound.ts`.
- The clips cut from the "Common Sound Effects — Dead by Daylight" video (vault, pallet-run, equip,
  unequip, lobby-join / -leave, char-pick / -confirm / -unconfirm, match-ready, locker-open / -close /
  -search, sabotage, crow-touch / -destroy, totem-touch) are named in `CLIPS` (`fx/audio.ts`). The
  board's sounds come from the `touch` game event (a prop handled: Board's `play`) and from the
  path a mini walks (`pathSound`); the room's from OnlineRoom. A game starting: `MatchBeat` plays
  match-ready over the page as it was (laid out as that page: `introStage` in `intro.ts` keeps App
  from the game's layout), with a heartbeat (`fxSound.heartbeat`) and the screen throbbing red on it, for its
  4.6 s; then `TrialLoading` is the loading page (bw-refresh, a quote or rules tip, a bar that fills as
  the game's pictures load — `gameAssets` in `intro.ts` lists them; at least 2.6 s (6.5 s online), at most 20 s; it leaves by
  rushing into black, and `TrialFade` opens the board out of it),
  then the game. The loading page's portraits fill the screen: the strip on the left of each character's board
  (`boardTh`, 0.255 of its width: 0.334 high-to-wide for a killer's 2400×1833 board, 0.421 for a
  survivor's 2400×1615 with the "ITEM CARD" label under it cropped off), the killer, a gap with
  VS in it, then the four survivors, each scaled to cover its share of the screen. The video has no sound of its own for unequip, sabotage, or
  the killer at a totem, so those borrow the nearest one (unequip is Equip reversed).
- Volume: `volumes` in `src/sound.ts` (master, music, sfx; 0–1, remembered per device), set in
  the settings window's Sound tab. Music (ambient and chase) scales by master × music, every effect (both `sound.ts` and
  `fx/audio.ts`) by master × sfx through a gain node.
- Every sound file is **OGG (Vorbis)**, so loops have no gap (MP3 pads both ends). Chase music
  lives in `app/sound/theme/chase/<killer>/<theme>/layer<N>.ogg`, one 26.84 s loop per layer.
- **Chase music** (`setChase` in `src/sound.ts`, decided in `GameScreen`): the killer standing on
  someone plays his theme — layer 2 on a healthy survivor, 3 once wounded, 4 while carried. Every
  layer is the same loop with more on top, so a switch keeps the playback position. The ambient
  track ducks under it, a chase plays for at least 6 s, and online only the killer and that
  survivor's player hear it.
- `public/sw.js` registers only in production builds. Bump `VERSION` there when the caching
  rules change. Test install and offline with `npx vite preview` (Edge's installability check
  fails in incognito, so use a persistent profile).

## Git and deploy

- Commit and push only when the user asks. Don't commit `dist/` or `dist-play/` (build output).
- Every push to `main` deploys to GitHub Pages (`.github/workflows/deploy.yml`), and the repo is
  public. Card art and sound clips are copyrighted material: say so before publishing new assets.
- If git has no identity on this machine, commit as the repo's existing author for that commit
  only: `git -c user.name="Sarachet Onta" -c user.email="sarachet.o+dscm@ttv-supplychain.com" commit …`.
  Don't change the git config.
- Commit messages: a short summary line, then what changed and why.
