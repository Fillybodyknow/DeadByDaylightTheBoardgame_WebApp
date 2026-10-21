# CLAUDE.md

Working notes for this repo, for every machine and session. Details live in `README.md`
(companion app), `src/play/README.md` (full game: scope, house rules, rulings) and
`docs/rules-th.md` (the Thai rulebook reference, with page numbers).

## The project

**ดบดล** is a web app for *Dead by Daylight: The Board Game*, with three modes:

- **Online** (`#/online`): the full game, each player on their own device, rooms on Firebase.
- **Offline** (`#/play`): the full game on one shared device (hot-seat, hand-off curtains).
- **Companion** (`#/lobby` …): a helper for the physical board game (setup, Thai card text).

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
   `PLAYABLE_KILLERS`. Survivors without perks stay locked in the picker.
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

- **Results never run ahead of animations.** `GameScreen` holds the view on the old state while
  dice, perk cards and board animations play. Pending rolls show their dice first.
- **Every rise of the Sacrifice track shows** (`SacrificeReveal` (a ring of 8 cells, new ones filling gold), in the perk cards' queue, from the `sacrifice` event when the total goes up; Breakdown lowering it shows nothing). The eighth is the finale's instead.
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
- **Board first.** Every action with a place on the board (path, prop, survivor, room) is
  clickable there. Each `BoardAction` carries its `action`; the side panels hide choices the board
  already offers and show "เลือกบนแผนที่" instead.
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
  whole row and the panel floats over its right edge. Player tiles don't list perks: clicking a tile opens the
  character details, with the perks and whether they were used this round. There is no game
  log on screen. Pointing at a revealed prop enlarges it.
- Fixed overlays inside a `.card` must `<Teleport to="body">`: `.card` has `backdrop-filter`,
  which traps `position: fixed` children.
- The full game runs on computers and tablets only. Phones get a notice (`src/play/device.ts`:
  a screen whose short side is under 700 px). The companion still works on phones.

## Checking the UI in a browser

Use `playwright-core` with the installed Edge
(`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`) against the dev server. Keep
scripts in the scratchpad, not the repo. To set up a scene, open `#/play`, then in the page:
`await import('/src/play/engine/engine.ts')` (and `legal.ts`), build a state with `createGame`,
edit it, `localStorage.setItem('dbdl-play-game', JSON.stringify(st))`, and reload. Look at the
screenshots before reporting. For online play, `?test` in the URL exposes `window.__dbdl` and the
local backend syncs browser tabs.

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
- Volume: `volumes` in `src/sound.ts` (master, music, sfx; 0–1, remembered per device), set from
  the sound button's panel (`src/components/SoundSettings.vue`, in the top bar and the game's
  rail). Music (ambient and chase) scales by master × music, every effect (both `sound.ts` and
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
