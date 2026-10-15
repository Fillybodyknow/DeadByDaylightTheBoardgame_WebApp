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

Before saying work is done: type-check, tests and build must all pass. Report failures as they are.

## Layout

| Path | What |
|---|---|
| `src/play/engine/` | Rules engine: `engine.ts` (pure reducer), `types.ts`, `perks.ts`, `legal.ts`, `seats.ts`, `boards.ts` (board graphs, read from the map art; `boards.test.ts` checks them), tests |
| `src/play/components/` | Game UI: `GameScreen` (layout), `Board`, `ActionPanel`, `PerkPrompt`, `Planning`, `CardHand`, `StatusPanel` (player tiles), `TrackBar`, modals |
| `src/play/boardActions.ts` | Everything clickable on the board right now |
| `src/play/focus.ts` | Board highlights and the facts listed for a decision |
| `src/play/labels.ts` | Thai labels for actions, perk choices, windows |
| `src/play/fx/` | Sound effects (`audio.ts`) and the animation queue (`bus.ts`) |
| `src/play/online/` | Firebase and local (multi-tab) backends, room session |
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
- **Board first.** Every action with a place on the board (path, prop, survivor, room) is
  clickable there. Each `BoardAction` carries its `action`; the side panels hide choices the board
  already offers and show "เลือกบนแผนที่" instead.
- **Movement cards are picked from the hand** (`CardHand`): point to draw a card up (the map shows
  where it goes), click to pick (it stays up), confirm in the side panel. This covers planning,
  bonus turns, every perk that picks a card, Predator and the Redeemer guess. A player with
  several survivors switches between them with tabs. The hand floats in the bottom-right corner
  (the side panel stops above it), with no label of its own. Each card's button stays still and only the card face inside it moves, so the card
  can't bounce under the pointer.
- **Your own face-down cards can be peeked at:** click one on the player tiles to see your cards
  big in the middle of the screen (the killer sees all his planned cards); a click anywhere
  turns them face down again. Online only the owner can; on one device anyone can, as at a real
  table. Items open in a modal in the middle of the screen too.
- **Secrets.** Hidden information (planned cards, Tinkerer / Zanshin swaps, the Redeemer card) gets
  a hand-off curtain in hot-seat (`secretFor` in `GameScreen`) and is never shown to other players
  online. Online, the killer (and a spectator) sees only the back of the survivors' item cards
  (`itemsHidden` in `src/play/game.ts`); an item shows when it is used.
- Perk decisions dock beside the board (`PerkPrompt`), never over the map. Character choices
  show the character's mini.
- Layout: the tracks and controls in a bar (on top; a slim rail on the left on 16:9 and wider
  screens, where the height limits the board), the board as big as the screen allows, one row
  of player tiles under it (foldable to a strip of portraits, remembered per device), the side
  panel (320 px) on the right. Player tiles don't list perks: clicking a tile opens the
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
