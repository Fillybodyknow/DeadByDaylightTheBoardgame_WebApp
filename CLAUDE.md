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
| `src/play/boardRoutes.ts` | Each path's line on the map art, icon to room (traced from the image): minis run along it |
| `src/play/components/` | Game UI: `GameScreen` (layout), `Board`, `ActionPanel`, `PerkPrompt`, `Planning`, `CardHand`, `StatusPanel` (player tiles), `ObjectiveHud` (both sides' goals, under the tiles), modals |
| `src/play/engine/loadout.ts` | Game modes Adept / Bloodweb / Devout (p.19): the perk-card deck, Bloodweb's draws, what a loadout may hold; `createGame` takes each character's `perks` |
| `src/play/engine/offerings.ts` | Offerings (p.19): ids, sides, all ten played (`READY_OFFERINGS`), how many a side burns. Room settings `offerings` / `offeringCount` / `offeringRandom`; `createGame` takes `offerings` and `drawOfferings`; effects in `engine.ts` (`hasOffering`) |
| `src/play/components/PerkLoadout.vue` | The perk loadout screen (PC game style): 3 slots, a honeycomb of perk icons with cost badges, a details box as the PC game's (a see-through head in the perk's colour; `PerkRichText` lights key words) |
| `public/assets/*/perk-icons`, `offering-icons`, `power-icons` | The icon alone, cut from each perk / offering / power card (the English ones): the diamond, hexagon or square, clear outside its outline (`perkIcon`, `offeringIcon`, `powerIcon` in `labels.ts`). Made by a script that finds each outline on its card; a new card needs its icon made too |
| `src/play/boardActions.ts` | Everything clickable on the board right now |
| `src/play/focus.ts` | Board highlights and the facts listed for a decision |
| `src/play/labels.ts` | Thai labels for actions, perk choices, windows |
| `src/play/fx/` | Sound effects (`audio.ts`) and the animation queue (`bus.ts`) |
| `src/play/tutorial/` | Tutorial mode (`#/tutorial`): chapters for both sides (`chapters.ts` the survivors', `killer.ts` the killer's) on scenes built from the engine (`scene.ts`), The Entity's guide (`GuideBox`), the runner gating the learner's actions and playing everyone else |
| `src/play/online/` | Firebase and local (multi-tab) backends, room session. The room carries **moves**, not states: each device replays them on the last checkpoint (`transport.ts`) |
| `src/boot.ts`, `src/components/BootLoading.vue` | The launcher: what the menu waits for, and the shared pictures warmed behind it |
| `src/data/` | Character, item and map data (Thai + English text, image paths) |
| `public/assets/` | Card art, maps, minis, sounds (`app/sound/game/` = game sound clips) |
| `public/sw.js`, `src/install.ts` | PWA: service worker and install button |

## Code conventions

- Vue 3 `<script setup lang="ts">`, TypeScript strict. Match the surrounding code: naming, idiom
  and comment density. Code, comments and READMEs are in English; UI strings are in Thai.
- Comments say why, in plain sentences. Rules cite the rulebook page: `(p.14)`.
- A public asset path for CSS — a custom property a stylesheet reads as `url()` — goes through
  `cssUrl` (`i18n.ts`), never `asset`: the built base is relative, and a relative url() handed to
  a rule resolves against the bundled CSS in `assets/`, so it 404s on the deploy while working in
  dev. `asset` is right for `src` and for an inline `style` the element itself carries.
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
- **Bots** (`bot.ts`, `botMove(st, player)`): a seat the computer plays. It sees only what its
  player would: never face-down cards, hidden props or the dice to come (a choice is tried on a
  copy with a fresh dice seed). Perks are taught a killer at a time (`TAUGHT`, so far The
  Trapper's), each checked in bot games (`src/play/README.md` → Bots); the rest are declined. Offline the players step marks bots
  (`GameState.bots`) and `play/bots.ts` drives them from `GameScreen`. Online the host seats them
  in the lobby (members with `bot: true`; places that mean people skip them; a bot killer's
  character is the host's pick on its seat, `pick`, or drawn) and the host's device
  plays them (`botDriver`, `onlineBotMove`, `dispatchBot`), and a person gone a minute or more
  when the host says so (`standIn` in the room, `setStandIn`). Details and balance in
  `src/play/README.md` → Bots.

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

- **A visit opens on the launcher** (`BootLoading`, `boot.ts`): a loading page over the whole app,
  as a PC game's — the mark over the campfire's realm, a quote or a rules tip, and a bar that
  counts in the pictures the menu draws itself with (`bootAssets`); at least 1.1 s, at most 8 s, a
  tap skips. Everything waits for it, the greeting below included (`booting` in `App.vue`). Once
  it is gone, `warmShared()` fetches in the background what every trial needs whoever plays it
  (the maps, the realms behind them, the props, the dice, the movement cards, the tokens, the
  survivors' minis — about 8 MB, three at a time, into the browser's and the service worker's
  caches), so `TrialLoading` has less left to fetch. The character art (over 100 MB) is never
  warmed that way. Off at Settings → Data (`warmAssets`), and never on a metered or 2G connection.
  A character's own art (their board, their three printed perk cards, a killer's power, passive
  and tokens) is fetched the moment that character is locked in the online room's picks
  (`warmCharacter`, the watch in `OnlineRoom`), while the others are still choosing, so
  `TrialLoading` has almost nothing left to wait for. The killer's goes only to devices that may
  see the killer (his own, or `showKiller`): on a survivor's it would show in the network tab what
  the room keeps from them.
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
- **Everyone gets an epithet** (ฉายา) when the game ends (`epithets.ts`): a teasing name read from
  the log as the stats are, one each and no two alike — every epithet is scored for every player
  and the best whole set taken, with four spares at the end of the list so a set can always be
  filled. Nothing random: online each device works it out, so they must all agree. `EpithetReveal`
  turns them over one at a time before the summary (once per game, `EPITHETS_SEEN`; a click
  skips), `EndSummary` then shows each under its name, and the history keeps them (`epithets?:`).
- **The Knight's Guards say which they are on the map** (`Board`): their three pictures are alike
  at a mini's size, so each has its own colour on the inside of its ring (the killer's red stays
  outside) and its name under it (two or three in one room share a single line of names, so the
  props under them stay clear). Each mini fades back and forth between the Guard's face and its
  symbol (`GUARD_SYMBOL`, an 8 s CSS loop on the page's clock, `v-in-step`, so all change at once, a Guard placed later too; with motion reduced, the face stays). Clicking one opens the killer's details on it (`InspectTarget` `{ k: 'guard' }`),
  where all three are listed with what they do and where they stand — reachable by both sides.
  The tooltip was the only name before, which a tablet never shows and which the survivors, who
  don't see the killer's power panel, had no way to reach.
- **The offerings burn first** (`OfferingBurn`, `fx.offerings`): a game with offerings opens on
  them dealt into a row one by one, a moment to read, then all burnt together like paper, each from one of
  its corners, the edge ragged (`fx/paperBurn.ts`, a canvas), with embers; a click skips. Once per game (`OFFERINGS_SEEN`), before the start-room rolls, and
  nobody is asked anything meanwhile (`opening` in GameScreen).
- **An offering at work shows its card** as a perk's does (`PerkReveal`, fire-orange rays): the
  engine logs an `offering` event with each effect, and GameScreen queues it (`showPerk({ offering })`).
- **The start-room rolls are on the map, not in a modal** (`StartPlacement`, `fx.starts`): after the
  last prop reveal each mini's die tumbles in a strip at the panel's place and the mini drops onto
  its room (`Board`'s `hideMinis`); nobody is asked anything until all are placed. Once per game
  (`intro.ts`).
- **Every action shows before its result.** A player's action (a move with its card, an attack,
  a pallet, a locker, the killer's power, a passive) gets a short card in the middle of the
  screen first (`casts.ts` builds them from the log, `ActionReveal` shows them in the perk
  cards' queue). Perks, items and rolls have their own reveals and are left out there. At most
  three a batch (`count`), and one owner's second **move** of a batch is left to the board
  (`shownFor`, written by a move and read by one — nothing else marks an owner). Marking them
  for any card at all took the move's own card away when something else of theirs came first: a
  crow's bonus turn, whose interaction and move are one action now (`then`), showed the chase but
  never the card it was played with, and a power that hit two survivors at once swallowed the
  killer's move after it (players' reports).
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
  (`chat.ts`, `ChatPanel`, `ChatDock`). Room (lobby and picks): in the corner above the room's
  button, as the PC game's. Game: a 💬 tab under the side panel's tab opens a drawer (Enter to type), an unread
  badge, and each new message as a 6 s bubble beside the sender's tile. Never saved or replayed.
  Notices in it (joined, left, kicked, lost connection, back) come from the members' changes.
- **Voice (online):** one channel for the room, WebRTC between the devices, the room carrying only
  who is in and the connecting signals (`voice.ts`, `VoiceButton`). In the lobby everyone talks;
  from the picks on the players talk and spectators only listen (`mayTalk`). The killer hears
  everyone (p.8). Speaking turns the tile's row (or the lobby seat) green, over a wound's red. The mic is open (M toggles it) or push
  to talk (a key, V by default, or holding the 🎙️ button). Never saved or replayed.
- **Undo by vote (online):** a room setting (`undoVote`, off by default). On, ↶ ขอย้อน in the top bar takes back the player's last move of the round
  if the other side votes yes (`online/undo.ts`, `undoRules.ts`, `UndoVote`): the killer's needs
  more than half of the survivors' players, a survivor player's the killer's; 30 s, the game held
  meanwhile. The room gets the earlier state as a checkpoint (`Room.restore`). Details in
  `src/play/README.md` → House rules.
- **History (online):** an online game that ends is saved on each device (IndexedDB `dbdl-history`,
  `play/history.ts`; nothing on the server, the room clears its game on going back to the lobby):
  the players and characters, the result, the stats, the headline events and the whole log as
  this device saw it (another survivor's item got is left out: `maskLog`). The latest 50 stay.
  `#/history` (`HistoryView`, in the top bar) lists them and opens one round by
  round; Settings → Data clears them.
- **Replay (online):** a game in the history plays back on the board (▶ in the history,
  `#/replay?id=…`, `ReplayView`): every move is recorded on the device as the game is played
  (`replay.ts`, from `RoomData.trail`; the room itself drops its moves at each checkpoint), checked
  to end where the game did, and kept with its history. GameScreen shows it as a spectator
  (`replaying` in `game.ts`), with a bar at the foot: start, step back / on, play, round, ×1–×4,
  "เปิดทุกอย่าง" (items and face-down cards). Details in `src/play/README.md` → Replay.
- **The player's name is set in one place: the top bar's profile** (`ProfileButton`, `src/profile.ts`,
  `dbdl-player-name`), as a PC game's: their initial in a ring and the name; a click opens the
  profile window. No page has a name field of its own. Whatever needs a name (making or joining a
  room, an invite link, writing in the public chat) calls `withName`, which opens the profile
  first when there is none (a dialog over any other, `ModalShell`'s `over`). In a lobby your own
  name on your seat opens it too, and a rename reaches the room (`session.ts`).
- **Looking for players (online):** a public chat for everyone (`#/lfg`, หาผู้เล่น in the top bar,
  `LfgView`, `online/lfg.ts`). A message may carry a room (🏠 in the chat, or a lobby's
  📢 ประกาศหาคน), shown as a card that joins it while it gathers; beside it, who is there and the
  rooms waiting. One message every 3 s, the latest 100, a day's life; "ซ่อน" hides a sender on
  the device (no accounts, no bans). A room announced there is told on every page (`lfgNotify.ts`,
  `LfgToasts`: a corner card, a count on the top bar, a system notice in the background), not to
  a player in a room or a game; Settings → Online turns it off. Details in `src/play/README.md`.
- **Problem reports:** a game in the history can be reported to the developer (🐞, `play/report.ts`):
  the player's note, the round, the app version and the game (its whole last state too, unmasked)
  go to `reports/RP-XXXX-XXXX-XXXX` on Firebase, one a minute per device, readable only by that id
  (the list isn't). The player gets the id; open it with `#/history?report=<id>` (a "full log"
  switch unmasks it), or read it with
  `curl "$VITE_FIREBASE_DATABASE_URL/reports/<id>.json"` to look into a bug.
- **Presence (online):** a member whose connection drops leaves the lobby by itself (Firebase
  `onDisconnect`, `Room.presence`); in a game they keep their seat, marked `dropped`. Re-set after
  every reconnection (`settle` in `session.ts`). Leaving with the button from the picks on marks
  them `dropped` too, and a host who leaves hands the role on (`leaveRoom`).
- **The online room is laid out as the PC game's lobby** (`OnlineRoom`): one screen from the lobby
  to the start, **the whole screen** — the page's top bar stands down here as it does in a game
  (`roomPage` in `App.vue`), since the room already says which room it is, how to leave it and how
  to get back to the menu, and the profile opens from your own seat; the ⚙ settings button moved
  into the room's own header beside the mic, and so did the killer's seat on a survivor's screen
  ("ฆาตกร ว่าง / เพิ่มบอทฆาตกร"): floating under the room's name it covered SURVIVOR 1 on a short
  or narrow screen, since the line of figures hangs from the bottom and climbs as the screen
  shortens — `--fig-h` is capped at `100vh - 400px` so its labels stay clear of that band.
  The campfire in the side's colour, everyone on
  their places, standing (each board's portrait strip, a dark pillar until a character is picked;
  a taken seat's pillar carries its side's own card instead: a movement card (Wait aside), a
  different one per survivor seat drawn to the pillar's full height, the skill die's skull (printed
  upside down on the face, so turned round) on the killer's — the pillar's own background, centred,
  the pillar clipping what spills out at the sides; an empty one
  is the bare pillar and a +, taken with a click), this player's character big on the right, the
  perks worn in the corner, the chat above **one button** in the corner that does whatever moves
  things on for this player now (or opens the panel where there is a choice to make first). A rail on
  the left opens one panel at a time — ตัวละคร, อุปกรณ์ (power, perks, offerings), แผนที่, ห้อง — over
  a see-through slate; the rail button of the room's next step glows until opened (nothing opens by
  itself). **It moves** (all CSS, written at full length so the animation-speed setting scales it;
  `html.reduce-motion` in `style.css` stands it all down): the campfire's light swells over the
  room (`.firepulse`, 7 s, out of step with the scene's own 40 s drift in `App.vue`), a place
  fades up from below as someone arrives or its seat empties (`seat-in`; every place is keyed by
  who sits in it, so it mounts afresh), a character picked rises out of the dark with one flare of
  the side's colour from the ground (`stand-up` on `.strip`, `lit` on `.figure::after`), the ✓ of
  a ready seat pops and opens a ring (`tick-pop`, `tick-ring`), and the big figure on the right
  breathes (`breathe` on `.hero img`). The whole line builds itself left to right when the room
  turns to the picks: each place carries its spot as `--i` and waits `70ms` times it, held down
  meanwhile by `animation-fill-mode: backwards` (no `forwards`, so a hover still has its say).
  The rail's panel slides out of the rail and back into it (a `panel` Transition), a chat message
  rises into place with its sender's colour flushing through it once (`said`, `said-flush` in
  `ChatPanel`), and the one button in the corner sweeps when what it does changes — it is keyed
  by its label, so a new one plays `go-sweep` to say it is a new thing to press.
  An empty seat answers the pointer (the pillar lifts and its edge takes the side's colour),
  everyone standing takes the fire's light (`firelight` on `.strip` and `.pillar`, the same 7 s as
  `.firepulse` so the two breathe together), a speaker's green glow breathes (`speaking`; held at
  one value it said only "their mic is on"), and thin fog drifts in front of everyone (`.roomfog`,
  z-index **3** — `.scene`, which holds the figures, is 2 and comes after it in the DOM, so at 2
  the fog sat behind them; the rail is 6 and the header 4, so it stays under those).
  **Changing sides is a move, not a redraw** — each side sees its own scene across the fire, so
  the camera walks round it: the near ground (`.scene`: the line and your own figure) swings in
  from the way you came (`turn-near`), the light behind it a third as far (`.light` wrapping the
  tint and the firepulse, `turn-far` — so the side's colour is reached as `.killer .tint`, not as
  a direct child of the room: wrapping it is what took that colour away in 1.40.0), and the dark
  itself rolls through over the top
  (`.fogsweep`: not mist but The Entity's, its red low in the bank as the scene's own glow is),
  taking the room while the swap happens underneath. It stays under the rail and the header, so
  the room is never unreadable. `--turn` on the room says which way (the killer's
  view is one side of the fire, the survivors' the other); all three are keyed by the side, so
  they play on the change and nowhere else.
  The fire's light rides `.strip` and `.pillar`, never `.figure`: that one's `filter` belongs to
  hovering a seat and to `.me`. `.talking` animates it on purpose — speech outranks a hover.
  **The trial beginning makes the fire take the room** (`.flareup`): it blooms out of the campfire,
  fills the lobby and burns down to nothing, over the alarm's first beats — which are already
  sounding and already throbbing the screen red (`MatchBeat`), so this adds the light and not a
  second shake. No waiting to arrange and no state of its own: the room stays on screen for the
  alarm's 4.6 s (`OnlineView`), and every device sees the game appear on the room at the same
  moment, so the whole room gets it together. It clears itself on `animationend`.
  **The trial beginning shuts every panel of the room's** (the rail's, the settings window — which
  exposes `close` for it — and the announce dialog): the game's alarm plays over the room as it
  stands (`introStage` 'beat'), so one left open would cover the moment, and still be there on
  coming back. The room watches `session.data.game` appearing for it.
  Details in
  `src/play/README.md` → Online play.
- **Board first.** Every action with a place on the board (path, prop, survivor, room) is
  clickable there. Each `BoardAction` carries its `action`; the side panels hide choices the board
  already offers and show "เลือกบนแผนที่" instead. A perk of the interact step that does **not**
  take the interaction (Ace in the Hole, Iron Maiden: "before interacting") is asked **on its
  target** (`onTargetPerk`): a click there asks in the side panel, with the perks' cards (several
  at once to pick from, as in the edit-perks mode) and the plain action under them,
  "ไม่ใช้ Perk — …" (`targetAsk` in GameScreen, ActionPanel's `ask`, BoardAction `perk`); no window
  over the map. Its card is in the side panel as well, so a player who never clicks that target
  still learns of it. Other perks aimed on the map (the start of a turn,
  All-Shaking Thunder) are armed in the side panel first ("ใช้ [perk]", glowing until pressed;
  `perksToPick`), and only then are their targets on the map, so a path or generator clicked by
  habit stays an ordinary move or repair.
- **An interaction that buys the killer a ▲ is settled whole before any of it happens**
  (`bonusAsk` in `boardActions.ts`): chasing a crow (p.12) and Power of Two. A click on the crow
  (or on the friend) sends nothing — the panel asks for the card the bonus turn discards (from the
  hand, or by clicking a path of its colour), then the room on the map, and that click sends the
  lot as one action (`sendBonus`): the interaction with `then: { card, path }`, which the engine
  plays on (`bonusThen`), so online it is one move to the room (sent as three, the later ones were
  refused and the player asked again). A perk asked on the card first stops it there; the rest
  goes once that is answered (`bonusIntent` / `moveIntent` in GameScreen). "ยกเลิก"
  at any point costs nothing. Before this the ▲ was paid on the first click, and a card with no
  path out loses the bonus turn's interaction too (`startSurvivorMove`), so a player could buy the
  killer a ▲ for nothing — which is what happened (a player's report). Cards with no path show
  "เดินไม่ได้" on the hand. Tutorial chapter 6 teaches the new order.
- **Using a friend's perk shows their card first** (`partnerAsk` in `boardActions.ts`): Collective
  Stealth and Power of Two belong to another survivor and are set off by interacting with them, so
  a click on their mini used to use the perk on the spot — the player never read what it did, and
  it spends that friend's one use of it for the round. The click now only opens the panel: the
  perk's card with its full text and whose it is, then "ใช้ [perk]" or "ยกเลิก" (which costs
  nothing). Collective Stealth then goes; Power of Two goes on into the bonus turn's settlement
  (`bonusAsk`). Neither is a panel button any more (`sInteractions` leaves `partner` out), so the
  card can't be skipped. The card says the interacting survivor chooses ("they may interact with
  you instead"), so the owner is **not** asked to agree — if that should change it needs a ruling
  and an engine step, since online it is another player's answer.
- **A perk that takes the turn's interaction is asked before the interaction is** (`REPLACES_INTERACT`,
  `interactGate` in `boardActions.ts`): the ten whose card says "As an interaction", "Instead of
  interacting" or "When you would interact" (Balanced Landing, Calm Spirit, Kinship, No One Left
  Behind, Prove Thyself, Solidarity, Treacherous Crows, Weaving Spiders, Wicked, Windows of
  Opportunity). The side panel opens the step with "ใช้ Perk แทนการ Interact ไหม?", their cards,
  and "ไม่ใช้ Perk — Interact ตามปกติ" (`plainInteract`, reset with the step; a way back under the
  interactions). Nothing on the map takes a click until one is answered; pressing a card arms it
  and only then are its targets there (Wicked, which aims at nothing, is used at once). While the
  question is open the rooms this turn's one interaction could land in stay lit and the rest of
  the board dims (`interactRooms`, `choiceRooms` in `focus.ts`), and the same once a card is
  armed. Interacting by habit spent the turn and the perk with it, which players kept doing.
- **Movement cards are picked from the hand** (`CardHand`): point to draw a card up (the map shows
  where it goes), click to pick (it stays up), confirm in the side panel. In planning and on a
  bonus turn a path out of the room on the map picks the card of its colour too (`pathPick.ts`). This covers planning,
  bonus turns, every perk that picks a card, Predator and the Redeemer guess. A player with
  several survivors switches between them with tabs. Where the hand floats is a setting
  (`handPlace`, Settings → Display):
  - **Auto** (the default): where it covers neither the map nor the panel's buttons nor the
    players, in a stretch GameScreen measures (`measureHandZone`, body variables `--hand-left`,
    `--hand-right`, `--hand-bottom`, class `hand-at-map`; `handZone` in `hands.ts`); its cards
    narrow to fit (narrow ones show the English name only). With the panel in its own column
    beside the map (a wide screen): under the panel, which stops above it (`hand-in-column`).
    With the panel floating over the map (a tablet): under the map, between the players and the
    panel. On one column (players and panel under the map): at the screen's foot, above a perk's
    sheet (and the players' row) when one is open; the page gets room at its end so the panel's
    buttons scroll clear of it.
  - **Under the map** (`map`): as Auto, but under the map on a wide screen too, between the
    players and the panel's column, with room for full-size cards; raised, they cover the map's foot.
  - **The bottom-right corner** (as it was first): over the panel's foot; the panel stops above it.

  Sunk, only the card names show; it rises while the pointer is on a card. **A hand a card is
  being asked of comes up by itself** (`prompt`, the glowing chip naming what wants it) — on a
  desktop too, where it used to lie sunk until the pointer happened to find it; a click on the
  map puts it down to see what is underneath, and the next question raises it again (`up` in
  `CardHand`). On a tablet a hand to pick from comes up by itself whether or not a card is asked
  for, so one tap picks; a tap elsewhere puts it down and a tap on it raises it again. The side panel's way on (a plan's confirm, a perk's
  confirm and "don't use") is sticky at its foot, on a strip of the panel's colour (`.way-on` round
a plan's confirm, `.choices` in PerkPrompt) so nothing scrolling under it shows through. It has no label of its own. Each card's button stays still and only the card face inside it moves, so the card
  can't bounce under the pointer. Online, while nothing asks for a card, the player's own hand
  rests there anyway, only to look at (`passive`; `openHands` in `hands.ts` says when a hand to
  pick from is out and takes its place).

  How the hand looks is the player's too (Settings → Display, classes on the hand that its CSS
  reads): `handLayout` (a fan, a straight row, or a stack showing each card's left half with its
  name moved there; the width fit counts each layout's spacing), `handPicked` (a picked card
  drawn up, or left sunk in the hand glowing gold), `handHover` (the pointer raises the whole hand,
  halfway, or only that card) and `handTouchRaise` (off: a tablet's first tap raises the hand,
  the second picks). The defaults are the fan, drawn up, the whole hand, on.
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

The ⚙ button (the top bar, the online room's own header, and the game's rail) opens `src/components/SettingsDialog.vue`, a PC-game
style window with tabs: Sound (volumes, mute, chase music), Display (animation speed, reduce motion,
card language, the hand of cards: where it floats, how it is laid, a picked card, the hover height,
a tablet's auto-raise), Online (turn sound, background notice, 20 s reminder), Data (clear the offline
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
  -search, sabotage, crow-touch / -destroy, totem-touch, pallet-impact) are named in `CLIPS` (`fx/audio.ts`).
  pallet-impact holds "Pallet Impact 1–13" one after another, a kick of the killer's plays one
  (`IMPACTS`). The
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
- Two branches: **`dev`** for the work, **`main`** for production. Work happens on `dev`; nothing
  on `dev` deploys (it is tried locally, `npm run dev`). A release is `dev` merged into `main`
  (fast-forward when it can be) and both pushed. Hotfixes too go through `dev`, so the two never
  part ways.
- Every push to `main` deploys to GitHub Pages (`.github/workflows/deploy.yml`), and the repo is
  public. Card art and sound clips are copyrighted material: say so before publishing new assets.
- If git has no identity on this machine, commit as the repo's existing author for that commit
  only: `git -c user.name="Sarachet Onta" -c user.email="sarachet.o+dscm@ttv-supplychain.com" commit …`.
  Don't change the git config.
- Commit messages: a short summary line, then what changed and why.
