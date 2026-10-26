# ดบดล — เล่นเต็มเกม (full playable game)

The full game. The menu (`#/`) offers:
- **Online** (`#/online`): each player on their own device, in a room shared through Firebase.
- **Offline** (`#/play`): the whole game on one shared device (hot-seat).
- **Tutorial** (`#/tutorial`): lessons for new players.

The game uses the app's card data (`src/data`), images (`public/assets`), theme, sounds,
character sheet and roulette (`src/`), and is deployed to GitHub Pages.

```sh
npm run dev      # http://localhost:5173
npm test         # engine tests (vitest)
npm run build    # type-check + build into dist/
```

## Layout

| Path | What |
|---|---|
| `src/play/engine/types.ts` | Game state, steps, actions (plain data, JSON-safe) |
| `src/play/engine/boards.ts` | Board graphs: rooms, printed prop slots, paths, walls, coordinates |
| `src/play/engine/engine.ts` | The rules: `createGame`, `apply(state, action)`, legal-option queries |
| `src/play/engine/legal.ts` | Every legal action in a state (tests, future bots) |
| `src/play/engine/engine.test.ts` | Rule tests plus random full playthroughs |
| `src/play/game.ts` | Current game, undo history, save to localStorage |
| `src/play/components/` | Setup screen, board (with its animations), action panel, planning, status, log, and the modals: dice, banners, details, round summary, end summary |
| `src/play/fx/` | Screen effects queue (`bus.ts`) and the game's synthesised sound effects (`audio.ts`) |
| `src/play/stats.ts` | Round summaries, end-of-game stats and timeline, read from the log |
| `src/play/inspect.ts` | Details modal targets and the rules text for each prop |

The engine is a pure reducer. `state.step` is the input it waits for; handling an action may
queue tasks (`state.queue`) that run until one needs input again. The RNG seed lives in the
state, so a saved game replays exactly and undo cannot be used to re-roll dice. Log entries
carry a structured event (`ev`) beside the text; the UI animates those, and the summaries
count them, so the engine never depends on the UI.

## Online play

Each player plays on their own device. The host creates a room and shares its 4-letter code (or
the invite link). Everyone takes a seat (player 1 = killer, players 2.. = the survivor hands, p.19),
and the host starts the game.

- **The way into a game** (`OnlineRoom`, `session.ts`): Lobby (sides, ready) → the picks, a stage
  at a time → the killer starts. A stage opens when everyone has finished the one before
  (`pickStage`, derived from the room's data, so there is no stage field to drift): **characters**
  (everyone confirms; a **Banlist** stage comes before it when the room sets one) → **perks** (only when the room's mode is Bloodweb or Devout) → **map**
  (picked by whoever the setting says; drawn maps are settled at once — `boardSet`, so a map is
  never "default MacMillan" by omission). The start button waits for the map. A step bar shows
  where the room is and chips show who is done. A stage only goes forward: a player may take back
  their own confirmation while others are still to confirm (the same stage), but once everyone has
  confirmed the characters (or the bans) there is no way back — the UI has no button for it and
  `lockPicks` / `lockBans` refuse.
  The foot of the bans, characters and map stages is a sticky `StageBar` (progress dots, a line of
  words, the confirm / start button), so the button is never lost under a long grid; the
  characters stage keeps the team in a side panel (`.team-panel`) beside the pickers.
- **Trust model: friends, not strangers.** Every device runs the same engine, so the room carries
  the **moves**, not the state: each device replays them and arrives at the same game (the engine
  is a pure reducer and its RNG lives in the state, so a replay is exact — nothing in
  `engine/` reads the clock or `Math.random`). A move is a few hundred bytes where a state is
  over ten kilobytes. `engine/seats.ts` decides who may act (`actorsOf`, `mayAct`). Each move is
  written with a transaction on its own numbered slot, so two players acting at once can't
  overwrite each other: whoever loses the slot checks their action again against the new state.
  Nothing is hidden from a player who opens the dev tools.
- **Checkpoints.** Every `CHECKPOINT_EVERY` (25) moves the player who made the move writes the
  whole state to `game` and clears the moves it covers, so joining or reloading replays only a
  few. A device whose replay refuses a move keeps what it has and waits for the next checkpoint,
  which replaces everything.
- **Planning happens for everyone at once.** Each survivor player sends their own hand with
  `planHand`, and the killer sends his two cards with `planKiller` in the same step. Every plan stays
  a draft (`planDraft`, `killerDraft`) until the last one is in, survivors' or killer's, and whoever
  confirms last starts the round: with the survivors all in and the killer still choosing, a
  survivor can still change their mind. Until then a confirmed plan can be taken back and made again (`unplanHand`,
  `unplanKiller`; the "ยกเลิก — เลือกการ์ดใหม่" button in the waiting panel). Nobody learns anything new from it — the survivors' cards are face down to the killer
  either way (p.8) — it only saves the wait. On one shared device the survivors still plan first
  and the device then goes to the killer, behind the hand-off curtain.
- **The room board** (`#/online`): open rooms are listed under `roomIndex/<code>` (name, host,
  members, phase, locked), apart from the rooms, which are still only read with their code. The
  host's device keeps the listing current on every change (a host leaving the lobby hands the room
  to the member who joined first, and puts the new count on the board as it goes; a room left
  without its host, from before, is taken over the same way by that member's device), and every device in the room touches
  its `updatedAt` every 4 minutes (a heartbeat); listings quiet for 15 minutes aren't shown.
  **Clearing stale rooms:** the listing is never removed when a device disconnects — it is how a
  forgotten room is found. The last one out of a lobby deletes the whole room (data and listing),
  and whoever opens the board deletes the rooms whose listing has been quiet for 3 days
  (`sweepRooms`, `reapRoom` re-reads the time first). Rooms made before this, whose listing was
  already removed, can't be found by a device: delete `rooms/<CODE>` in the Firebase console.
  A room is created with a name (a random one on offer, 🎲) and an
  optional password: the room keeps only its SHA-256 hash with the code, and a device already in
  the room comes back without it. Friends, not strangers: the check is on the joining device.
  **The database rules must be updated** (`roomIndex`) for the board to show rooms; without
  them rooms still work by code.
- **Pings** (`src/play/pings.ts`, `PingLayer.vue`): in the game a player marks a spot on the map for
  everyone, straight away: a right-click on the map (a prop or a mini keeps its right-click, its
  details), the middle button, Q while pointing, or on a tablet a finger held still on the map
  (a long-press on a prop or a mini still shows its details). The 📍 button in the controls then
  a click, and Alt+click, work too. A ring in
  their colour pulses there with their name for 4 s; a new ping of theirs replaces it. Everyone
  sees every ping, the killer too: survivors may talk but never in secret (p.8). Each member picks a colour in the
  lobby from a fixed set (`online/pingColors.ts`, `Member.color`), never one another member holds;
  a member without one gets the first free. Spam: one ping per 1.5 s and 4 in 10 s on the device
  (the button counts down), and the database rules refuse more than one a second per member.
  Pings aren't moves: they go through `Room.ping` / `onPings` (Firebase: `rooms/<code>/pings/<id>`,
  one slot each; local: a BroadcastChannel) and are never saved or replayed.
  **The database rules must be updated** (`pings`) for pings to reach the others on Firebase; the
  sender is told when the room refuses them.
- **Chat** (`src/play/chat.ts`, `ChatPanel.vue`, `ChatDock.vue`): one channel for the whole room, in
  the lobby and the game. Everyone reads every message, the killer too (p.8); a spectator may
  write as well. In the lobby the panel sits beside the room's column on a screen 1760 px wide or
  more, otherwise behind a 💬 button in the corner. In the game a 💬 tab under the side panel's
  tab opens a drawer (Enter opens it ready to type, Escape closes it); its badge counts unread
  messages. A new message shows for 6 s as a bubble beside its sender's first tile (StatusPanel
  marks it `data-chat-seat`; the bubble is drawn by ChatDock, as the player column clips), a
  spectator's as a line beside the tab. Ready-made lines for tablets. Messages are at most 200
  characters; the room shows its latest 100. Spam: one message per 1.2 s and 5 in 10 s on the
  device, and the rules refuse more than one a second per member (`chatAt/<id>`, written with
  the message). Not moves: `Room.chat` / `onChat` (Firebase: `rooms/<code>/chat/<push id>`;
  local: a record `<code>#chat` beside the room and a BroadcastChannel), never saved with the
  game; the room's deletion takes the chat with it. **The database rules must be updated**
  (`chat`, `chatAt`) for chat to work on Firebase.
  Notices among the messages (not sent: each device reads them off the members as they change,
  from the moment it entered; none about itself): someone joined, left, was kicked (`kicked`),
  lost their connection or came back (`dropped`). The newest also shows beside the 💬 button
  for a few seconds while the chat is closed.
- **Presence** (`Room.presence`, `settle` in `session.ts`): Firebase's `onDisconnect` on the lobby
  node. In the lobby a dropped connection (a closed tab, a lost network) takes the member out and
  marks them in `dropped`, so a closed tab never keeps a place; from the picks on it only marks
  them (their seat waits for them). The server forgets it once it has run: the device sets it
  again after every reconnection, clears its own `dropped` mark, and if it was taken out of the
  lobby, goes straight back in (only a member in `kicked` is sent to the entry page). Leaving
  with the button cancels it. The local backend stands in with `pagehide` (best effort).
  Back in the lobby after a game, members still marked `dropped` are let go (by any device there),
  are never handed the host role, and don't keep the room alive: the last member left who is
  connected leaving deletes it.
- **Kicking:** in the lobby the host has a ✕ on every other seat and bench chip. The kicked
  device's id goes into `lobby.kicked`: it is sent back to the entry page with a notice, and
  `join` / `joinRoom` refuse it (also with the password). Everyone un-readies, as the table changed.
- **Room settings** (`online/settings.ts`, the lobby's ⚙ card): the host sets them before
  seating everyone, everyone sees them (with chips for what differs from the defaults). A change
  doesn't reset anyone's ready (the user's call: the host sets several in a row); the others'
  settings card glows and says what changed for a few seconds. Stored in the lobby node as a partial object, so older
  rooms play with the defaults.
  - **Turn timer** (none / 60 / 90 / 120 s): counted on each device from when a decision shows
    (after its animations). At zero the player's own device answers what can be passed over
    (`online/timeout.ts`: no to a perk, an item or a bonus turn, a roll taken as rolled, nothing
    put in for Crowd Control); a move, an interaction or a plan stays theirs and the room is
    told they are over time. A device that is closed answers nothing.
  - **Map**: picked by the killer (default), by the killer in secret (the survivors learn it
    when the game starts), by the host, or drawn when the picks open.
  - **The killer's pick**: hidden from the survivors (default) or shown to them as it is made.
    Either way it is in the room's data (friends, not strangers).
  - **Characters**: picked, or drawn for everyone when the picks open (players only confirm);
    survivors may repeat a teammate's (the second gets a number after the name).
  - **Banlist** (off by default; 1–3 characters per side): a stage before the characters. Each
    side bans characters of the *other* side — the survivors together ban killers (one shared
    list: whoever changes it, every survivor confirms again), the killer bans survivors — up
    to the set number, leaving at least 4 survivors (1 with repeats) and 1 killer. A side's
    list is hidden from the other until everyone has confirmed, then it is public: banned
    characters are never picked or drawn (with random characters the draw happens after the
    bans). Once everyone confirmed, the bans are final. Stored as `banPicks` and `bansLocked`
    in the lobby node (`lobbyOf` lists them). The host's old per-room ban list is gone.
  - **Starting ▲**: survivors 0–4, the killer 2–6 (the rulebook's 2 and 4 by default, p.6).
- **Backends** (`online/`):
  - `firebase.ts` is the Realtime Database. Its URL goes in the project root's `.env.local`
    (git-ignored) as `VITE_FIREBASE_DATABASE_URL`; the deploy reads it from the repo's Actions
    variables `VITE_FIREBASE_DATABASE_URL` and `VITE_FIREBASE_PROJECT_ID`. The game is stored as a JSON string, because
    the database drops nulls.
  - Small writes (`logArchive.ts`): the log is over 90% of a late game's state, so a checkpoint
    leaves out the log of finished rounds (~13 KB instead of up to ~130 KB). Each finished
    round's log is written once to `rooms/<CODE>/log/r<N>`, and every device puts the full log
    back together. A round leaves a checkpoint only once its archive is in the room.
  - Measured on whole random games: sending the state on every move cost ~40 MB a game (the free
    plan's 10 GB is then ~250 games); sending moves with a checkpoint every 25 costs ~1.5 MB
    (~6,700 games). `src/play/engine/online.test.ts` checks that a device replaying from a
    checkpoint lands on exactly the host's game.
  - `local.ts` is used when no URL is set. It syncs tabs of one browser (IndexedDB +
    BroadcastChannel), with one seat per tab, for testing alone.
- **Rules:** `database.rules.json` (project root) limits access to `rooms/<CODE>` (`lobby`, `game`,
  `moves`, `log`). Paste it into the Firebase console under Realtime Database → Rules (the default
  test-mode rules expire). **The rules must be updated before this version is used**: without
  `moves`, no move can be written and a game can't be played. Without `log`, games still work but
  every checkpoint carries the whole log.
- **A roll others can change** (a friend's key, a friend's Iron Will) waits on everyone who could:
  each of them gets the roll on their own device, to help or pass (`passRoll`), and the roller
  accepts the result once they have all answered (`rollHelpers`; `actorsOf` lists them all).
- The top bar shows "กำลังซิงก์…" while this device's moves take long to reach the room, and
  "การเชื่อมต่อหลุด" while it is disconnected (`SyncBadge.vue`).
- Undo is off online. The host's ออก ends the game for everyone and returns to the room. Other
  players leave and can rejoin with the same code; the seat is kept per device.
- `?test` in the URL exposes the game to automated multi-player tests (`window.__dbdl`).

## Tutorial

`#/tutorial` (a card on the menu): both sides taught a chapter at a time on the real board, The
Entity speaking (`src/play/tutorial/`). The list has a tab per side (remembered per device,
`dbdl-tutorial-side`), each numbered on its own.

- **A chapter** (`chapters.ts`) is a scene and its steps. The scene (`scene.ts`) is a real game on
  MacMillan Estate laid out by hand: rooms, props face up or down, cards planned, the step to
  start at; a roll the lesson needs is rigged by trying seeds (`rigged`). The learner plays survivor
  0 (Dwight); the tutorial plays everyone else, the plainest move after a short pause
  (`policy.ts`), and holds them still while The Entity explains.
- **The killer's side** (`killer.ts`, chapters marked `side: 'killer'`): the learner plays The
  Hillbilly (his Chainsaw is the power taught) and the tutorial plays the four survivors. To keep
  them still while a lesson needs them in place, they plan cards with no path from their room
  (p.8: they stay and lose the interaction).
- **A step** says something (`**key words**` lit, pictures beside) and may point at something
  (`spot`: a room, prop, path icon or any element). A step with a `task` asks for something on the
  board: only the actions it allows go through (`tutorial.allow` in `game.ts`; anything else gets
  its hint), and it ends when `done` holds. A step without one waits for "ถัดไป", the screen dimmed
  round the spot. While dice, perk cards or the board are still playing, the guide waits.
- The tutorial's game is never saved (the hot-seat save stays as it was), has no undo and no hand-off
  curtains. Chapters finished are remembered per device (`dbdl-tutorial-done`).
- `tutorial.test.ts` plays every chapter through as a learner doing what each step asks.
- A step may also set a **new scene** as it begins (`setup`: the lesson moves on in time, e.g. to
  the next round) or ask a **question** (`quiz`: only the right answer goes on; a wrong one is told
  why). A scene change starts the game screen afresh (`run.scene` is its key).
- A chapter may play the others its own way (`auto`): chapter 7's killer hunts the learner (into
  their room, attack, pick up, carry to the hook).
- The chapters: 1 the goal, 2 movement cards, 3 revealing props, 4 repairing and the skill check,
  5 survival props (chest, locker, pallet), 6 crows, bonus turns and ▲ (a Hex Totem cleansed),
  7 the killer arriving (wounded, carried, hung), 8 helping others (healing, a rescue), 9 escaping
  (the fourth generator, the exit gate), 10 rules to know (a quiz). The killer's side is to come.

## Scope

- Boards: **MacMillan Estate** (11 rooms, 22 paths), **Autohaven Wreckers** (10 rooms, 19 path
  icons, two of them forks), **Ormond** (10 rooms, 22 paths), **Crotus Prenn Asylum** (10 rooms,
  18 path icons, one fork), **Withered Isle** (11 rooms, 24 paths) and **Forsaken Boneyard** (9 rooms,
  21 path icons, one of them joining four rooms) — each with 4 breakable walls and all 44 props.
  The last two use AI-generated images of the maps (`*-AI-Gen.webp`), not the printed art. Offline the board is
  picked before the trial; online the killer picks it and everyone else sees his choice on a card
  above their character picker (which is long enough to hide anything under it).
- Killers: **The Trapper, The Nurse, The Huntress, The Hillbilly** (the rulebook's
  automated-mode cast, p.20–23), **The Doctor, The Hag, The Wraith, The Oni, The Deathslinger,
  The Twins, The Blight, The Spirit, The Legion, The Trickster, The Plague, The Clown, The Knight, The Dredge, The Artist, The Skull Merchant, The Unknown, The Singularity** — with powers and passives.
- Survivors: **Dwight, Meg, Jake, Claudette, Feng Min, Ace, Nea, Yui Kimura, Zarina Kassir,
  Élodie Rakoto, Felix Richter, Adam Francis, Yun-Jin Lee, Jane Romero, Kate Denson, David King, Jeff Johansen, Jonah Vasquez, Haddie Kaur, Mikaela Reid, Vittorio Toscano, Renato Lyra, Thalita Lyra, Sable Ward, Gabriel Soma**.
  Others are locked in the setup screen until their perks are written (`engine/perks.ts`).
- Mode **Adept**: each character plays the 3 perks printed on their board (141 perks).
- The **perk cards** of the edit-perks mode (`src/data/editPerks.json`): 94 of the 129 cards are
  the printed ones; 35 are on no board. All 35 are in the engine (`DECK_PERKS` in
  `engine/perks.ts`). A card-only perk has no character and no index: its
  name, cost, text and art come from the card data (`perkCard` in `labels.ts`). A card is laid
  over one of the character's printed perk slots: `perks` holds the card and `covered` the perk
  under it (`SurvivorState`), and the four cards that discard themselves free it again.
- Modes **Bloodweb** and **Devout** (p.19), online (room setting `mode`) and offline (the players
  step): once every character is picked, each player sets their 3 perks on a loadout screen in the
  PC game's style (`PerkLoadout.vue`; offline one player at a time behind a hand-off card). The
  rules live in `engine/loadout.ts`; `createGame` takes each character's `perks`.
- 3–5 players. With 3–4 players one player controls two survivors sharing one hand (p.19).
  The 2-player deck rule is not in yet.
- Full round structure: planning with hand-off screens, survivor turns, killer turns and the
  4 ▲ bonus turn, crow bonus turns, cleanup.
- Every survivor and killer interaction, carrying to a hook (1–4 dice), rescues, lockers,
  pallets, walls, exit gates, both win conditions.
- All 10 items, including key re-rolls and the Flashlight / Firecracker reactions.

### How perks are used

A perk is used once per round and costs its ▲ (p.16); a survivor in a locker or on a hook can't
use perks (p.12, p.15). Perks with a trigger are **offered** when it happens (`trigger` tasks ask
each owner in turn: survivors in turn order, then the killer, p.16); the owner can also say "don't
ask again this round". A few are **buttons** in the owner's own step: Self-Care, Empathy and Botany
Knowledge at the start of the turn, Prove Thyself and Botany Knowledge before interacting, Iron
Will on a roll, Breakout at the start of the turn. Calm Spirit is an interaction with a crow. A
Nurse's Calling works by itself. Tinkerer, Zanshin Tactics and the Redeemer's discard are secret
cards, so the device is handed to the killer first.

When several perks trigger at the same moment (p.16, Timing), owners are asked in order: the
survivors by turn order, then the killer, who decides after seeing theirs. When one owner has
several perks for that moment, they are offered together (`alt` on the `offer` step). The owner
uses any of them first, the rest are asked again if they still apply, and pass passes on all
of them. Example: The Trapper's Brutal Strength and Agitation after an attack.

A survivor's perk aimed at something on the map (a path, a prop, a survivor, a room) is **armed
first** in the side panel (`perksToPick` in `boardActions.ts`): its targets show on the map only
after "ใช้ [perk]" is pressed, offered or as a button, even when it is the only one. Sprint
Burst's paths and For the People's generator look just like an ordinary move or repair, and
players clicking them by habit used the perk by mistake. Usable perks glow and pulse until one is
armed. The killer's offers still put their targets on the map at once.

Next: the other killers and survivors, Devout / Bloodweb perk choice, the other boards (each
needs its graph in `boards.ts`), the 2-player rule, then bots from the automated rules.

## House rules

- Wicked (Sable) pays its ▲ only to the survivors on the board: not to one on a hook, carried or in a
  locker (the user's call; the card says "each Survivor").
- Background Player, Blood Rush (Renato), Situational Awareness and Renewal are asked at the end of
  a bonus turn too (from a crow, a perk, or one of these), not only of the survivor phase's turn
  (the user's call): the owner's own for the first three, anyone's for Renewal. Each is still
  once a round.
- The Knight's Jailer, after a failed roll in its room (the survivor wounded), goes back onto his
  board instead of out of play (the user's call): his power or Face the Darkness may place it
  again, in his room or a connected one, as the other Guards.
- Picking up a survivor in a room with a free (revealed, unoccupied) hook hangs them there at
  once, as the rulebook does (p.18): the killer can't carry them away and there are no struggle
  dice. (Dead Hard may still answer the hanging.) Elsewhere they are carried; carrying one into a
  room with a free hook while steps are left is the killer's choice — hang there or carry on —
  and ending the carry on a free hook hangs. (Before 1.4.1 the killer could also choose to carry
  on from the pick-up itself.)
- A survivor being carried may use their own key to re-roll a die of their roll to struggle
  free (the key says "at any time"). No other item, and no key on anyone else's roll, while carried.
- A Firecracker also stops the killer while he carries someone: he can't enter that room and
  loses the step (it counts as one step taken). With no steps left and no free hook where he
  stands, the carried survivor escapes there (p.15). (The card says "at any time"; the rulebook
  doesn't say either way.)
- After a rescue, the rescuer and the rescued survivor may each stay in the room instead of
  moving along a path (the rulebook, p.13, has them move).
- Online, a survivor's item shows only on its holder's screen (`itemHidden` in `game.ts`): the
  killer, a spectator and the other survivors' players see the back of the item card. An item
  shows to everyone when it is used, and a friend's key shows when it is offered for a re-roll.
  On one shared device everything is in sight anyway.

## Rulings

The rulebook leaves these open (see the ⚠️ notes in `docs/rules-th.md`). The engine does:

- Danger die: image faces 0 and 2 are the great successes, the other four are failures.
- A failure gives the killer 1 ▲ **per failed die** (p.15 example), counted after re-rolls.
- Exit gate: any success adds 1; a great success adds no extra.
- "Move along any path" (rescue) and carrying: any colour, but vault paths stay one-way and
  breakable walls block. Carrying also cannot cross pallets.
- A hook with the Entity token on it is not an "unoccupied hook" for hanging.
- Survivors keep their wound after a rescue or after escaping a carry.
- A survivor who is rescued mid-round placed no card in Planning, so they get no turn that round.
- Revealing a prop (entering a room, setup, Map / Rainbow Map): the player clicks the face-down
  tile, so they choose its colour (category). Which prop of that colour it is was fixed by the
  setup shuffle. With only one colour left face down in the room it flips automatically.
- A fork (one path icon with lines to three rooms) joins every pair of those rooms with that
  card; its wall, pallet or bear trap sits on the icon and blocks all of them.
- Crotus Prenn's Receiving Desk holds O, B, S, A (as the user confirmed; the printed icons read
  as two survival props, one more than the tiles allow).
- Withered Isle's Pasture holds O, S, S, A: its third icon is drawn oddly on the AI image, and
  survival is the only reading that matches the tiles (12 survival, 12 altruism).
- Forsaken Boneyard's middle sprint icon has lines to four rooms (Twisted Tree, North Library,
  Eyrie Balcony East, South Library): like a fork, it joins every pair of them with one icon.
- Firecracker stopping the killer counts as a failed move: the killer stays and loses that
  turn's interaction. Flashlight uses up the killer's interaction for that turn.
- A Firecracker stops any move of the killer into its holder's room ("prevent the Killer from
  moving into your space"): his card moves, carrying, the Afterpiece Antidote's move, the
  Hillbilly's chainsaw (asked before it runs: the card stays in his hand), Starstruck's move (no
  pick-up then), a Diversion (on a survivor's turn he has no interaction to lose), walking on
  after Enduring breaks a pallet, and the teleports: the Nurse's blink, the Wraith's Wailing Bell
  and the Hag's teleport to a Phantasm Trap (the user's ruling: a Firecracker stops him in every
  case). A power is stopped before it is spent — the blink or the bell stays unused, and the Hag
  doesn't pay the ▲. Yamaoka's Haunting doesn't move him; the Twins' swap to Victor isn't a move
  into a room (Victor is already there).
- A survivor in a locker who must move leaves the locker first, even if the move then fails.

Killer powers:

- The Nurse's blink doesn't break the pallet or wall it passes. A Firecracker in the room he blinks to stops it.
- The Huntress's hatchet reaches survivors in connected rooms only, not in her own room.
- The Hillbilly's chainsaw wounds one healthy survivor in the room it enters; with several, the
  killer picks. Quick & Quiet happens on entering, so Meg can hide before the cut.

Perks:

- Unnerving Presence, Thanatophobia and Bond change single-die skill checks (repair, exit gate,
  cleanse, heal, locker search), not the carry roll or danger-die rolls.
- A survivor in a locker is off the board for perks (p.12), so **no** perk reaches them, even for
  the roll of the locker being searched: Unnerving Presence, Thanatophobia, Bond, Off the Record
  and Lucky Break all skip them, whether or not the card names a space. Searching the locker is
  the killer's way to them.
- Bond with a danger die: two danger dice, keep one. When two dice are rolled and one kept, the
  killer gains 1 ▲ if either failed (p.18).
- Iron Will works on any survivor roll in range, danger dice included (a bear trap, a hatchet),
  but not on the carry roll. Every failed die counts as a success.
- Huntress Lullaby also stops bonus-turn moves (they are made with a movement card).
- Leader follows moves made with a movement card, not "any path" moves. Sprint Burst's "any
  other path" is any path but the one just taken.
- Brutal Strength can push a survivor through a pallet or wall, breaking it; the survivor
  reveals a prop and bear traps trigger as usual.
- Agitation and Beast of Prey: any path without a pallet; walls break.
- Prove Thyself: the other survivor (same or connected room) interacts in their own room.
- Adrenaline is offered at the start of cleanup, before sacrifice progression.
- Empathy works with any survivor not on a hook ("willing" is left to the players).
- Saboteur comes after the rescue moves. Tinkerer only swaps cards not yet played.
- Stridor's survivor plays their card face up on their own, in a step of its own before anyone
  else plans ("before you or any other Survivor"): the other survivors and the killer then choose
  knowing it. They set no second card in the planning step that follows. A survivor hiding in a
  locker can't be chosen: a locker is off the board for perks (p.12).

The Doctor, The Hag, The Wraith:

- Madness changes single-die skill checks (as above) to the danger die, not the carry roll, a
  Phantasm Trap roll or the roll of a survivor searched in a locker (Level 99's answer on their
  Discord: Madness "only affects skill checks, not all rolls"); that roll doesn't end Madness either. A survivor in a locker isn't in the room for Carter's Spark.
- A Phantasm Trap roll is a skill check die: keys can re-roll it, Iron Will doesn't apply, and a
  0 still gives The Hag 1 ▲. Teleporting reveals a prop like any move; attacking or picking up
  someone there is optional.
- Overwhelming Presence covers items used from the item menu and the Flashlight / Firecracker
  used against the killer (the user's call: they are items used), not key re-rolls. A Flashlight or
  Firecracker lost to it stops nothing; another survivor holding one may still use theirs.
- The Third Seal discards a path card (not Wait). Devour Hope's extra turn counts as the round's
  bonus turn. Shadowborn's third card is face down; no bonus turn that round.
- Predator: the discarded card is gone for the round; the survivor picks the new one in secret.
- Monitor & Abuse and Bloodhound work by themselves.

Feng Min, Ace, Nea:

- Lithe: a pallet on the path taken, or a revealed pallet standing in the room left.
- Technician: the second interaction can't target the same generator.
- Ace in the Hole swaps props of one category between your room and a connected one (different
  kinds, at least one face up), before interacting; it doesn't use the interaction.
- Urban Evasion's wall comes back when that survivor's turn ends; no pallet can be dropped on
  that path in the meantime.

The Oni, The Deathslinger, Yui Kimura, Zarina Kassir:

- "Sacrifice a Survivor" (Blood Echo, Dead Man's Switch) is hanging them on a hook (p.15).
- Yamaoka's Wrath counts wounded survivors on the board (not in a locker) and revealed Hex
  Totems; it is only offered when it gains at least 1 ▲.
- Redeemer: the survivor is reeled in by the normal movement rules: not against a one-way (vault)
  path from their room to his (the designer's ruling). Any card in hand can be discarded, Wait included. The survivor guesses among the 5
  card types. A wrong guess moves them into his room and he picks them up. Like any pick-up,
  not a survivor wounded this round (p.15), so they can't be targeted. A right guess: nothing
  else happens; the card stays discarded.
- Zanshin Tactics swaps a card not yet played; the old card is discarded unseen.
- Nemesis: a locker removed with a survivor inside lets them out into the room.
- Gearhead: the second interaction may be any interaction or the power (if unused).
- Retribution: "a success" is the cleanse succeeding; the totem is cleansed and the killer
  gains 2 ▲.
- Red Herring changes an attack or a pick-up (not a power, not a locker search) into damaging a
  revealed generator in that room. It counts as damage (Overcharge, Gearhead, Alert).
- Off the Record takes 1 ▲ of the killer's, even when the roll had several failed dice.
- Lucky Break: any survivor's great success (the die kept; any die of the carry roll).
- Yui's and Zarina's self-wounds count as wounded this round (no pick-up this round, p.15).

The Twins, The Blight, Élodie Rakoto, Felix Richter:

- Victor is a second killer mini. At the start of each killer turn with Victor on the board, the
  killer picks who takes it. On Victor's turn he is "the Killer" for everything (moves,
  interactions, perks, items, Quick & Quiet); otherwise Charlotte is. Blood Bond is used on
  Charlotte's turns only.
- Victor never carries: his pick-up of a wounded survivor, or finding one in a locker, gains 1 ▲
  instead and the survivor stays (in the locker).
- Removing Victor is a survivor interaction in his room. He stays on the board between rounds.
- Coup de Grâce: at the end of any killer turn (not with the round's bonus turn used), the card
  just played is played again at once as the bonus turn; then the next planned card, if any.
- Oppression: one or two other revealed generators with progress lose 1 each.
- The Blight's power: a random card from the hand is discarded and he moves along its path (he
  picks which path of that colour; walls break, a pallet stops him). Entering a new room, he may
  interact there or use the power again (as long as cards are left). No path: the power ends.
- Dragon's Grip: one or two path cards (not Wait); healthy survivors in rooms joined to the
  damaged generator's room by a path of those colours pay 1 ▲ or are wounded (in turn order).
- Yamaoka's Haunting (The Spirit): her power, used instead of interacting; the discarded card's
  colour picks the path, and over it a healthy survivor is attacked or a prop interacted with as
  if she stood there (Red Herring, Brutal Strength… still answer it). Nothing on the path matters
  (she doesn't go there). A Flashlight can't stop it: it is her power, not an interaction in
  the holder's room.
- Rancor: when the killer enters a room — carrying someone too — one wounded survivor from the
  room he left comes along, and reveals a prop there as on any move.
- Haunted Ground: after a survivor reveals a prop (not during setup), swap it with a revealed
  prop of the same colour in another room. Besides the card's exceptions, exit gates with
  progress stay put, and a prop isn't swapped with another of its own kind (nothing would change).
- Spirit Fury: any pallet the killer breaks, also one broken with Enduring.
- Diversion (Adam): an interaction with the killer in his room. "Any path" means any colour, but
  by the normal movement rules: not against a one-way (vault) path (the designer's ruling, through
  Level 99). A wall on it the killer breaks on the way (as on any move of his), but a path with a
  pallet isn't offered. The killer reveals a prop where he arrives, as on any move.
- Autodidact: one die of a success (not a great one already, nor a failure Iron Will counts as
  a success) becomes a great success, on any roll of a survivor in Adam's room or a connected
  one — struggling free from a carry too (one great success frees them). Not on a Phantasm roll.
- Deliverance: after Adam takes someone off a hook, or someone takes him off one; placing the
  Entity on an empty hook isn't a rescue. Adam picks which of the two wounded is healed.
- Feral Frenzy (The Legion): his power, offered with a survivor on the board in his room (one hidden
  in a locker or on a hook isn't there to wound). It isn't an attack, so Flashlights and attack
  perks don't answer it.
- Mad Grit: carrying someone, on entering a room with another healthy survivor on the board.
- Discordance: a survivor entering a room (by any move) where another survivor is on the board;
  ▲ for each survivor on the board in that room, the one entering too, and 1 if the killer is
  there.
- Iron Maiden: before interacting (a button in his interact step; then he still interacts), an
  empty revealed locker and an empty revealed hook in another room swap places, anywhere.
- Guards (The Knight): one Carnifex, one Assassin, one Jailer; the power (or Face the Darkness at
  the start of his turn) puts any of them into his room or a connected one, moving it if it is
  out (on the map a room offers them in a small menu with each one's picture). Several may share
  a room. Carnifex: after the cleanup-start perks, it removes a revealed survival or altruism prop
  in its room (not an occupied locker; the killer picks among several), then moves to a connected
  room of his choice. Assassin: anyone entering its room by their own move (not carried) rolls the
  danger die after the reveal; a failure wounds. Jailer: every skill check (repair, gate, totem,
  heal) by a survivor on the board in its room is on the danger die; a failure wounds them and the
  Jailer leaves the board (back to his, see House rules). Not being searched: in a locker they are off the board (p.12). The killer still gains ▲ for the failures.
- Nowhere to Hide: asked before the search roll; it is on the danger die.
- Hubris: a survivor entering his room by any move pays 1 ▲; with none, they can't interact this
  turn if it is their turn (on someone else's turn there is no interaction to lose).
- The Artist's passive: three Dire Crows start on his board (props of their own, a crow in every
  way: survivors and he interact with them as crows, Calm Spirit moves them). A crow he removes from
  play (scouting it, Pop Goes the Weasel, Septic Touch) goes onto his board; one a survivor's perk
  removes doesn't. At the start of planning, every survivor on the board in a room with a Dire Crow
  sets their card face up first (as Stridor's, one after another; Stridor's survivor first); in a
  locker they are off the board (p.12) and plan as usual.
- Birds of Torment (his power): a crow or a Dire Crow from his board into any room, face up. Then,
  with a crow of any kind face up in his room (the one just placed too), he gains 1 ▲. With nothing
  on his board, the power can't be used.
- Grim Embrace: asked after a survivor takes someone off a hook (once a round, 3 ▲, as any perk).
  The ▲ stay on the rescuer's board until they are hung: each is then a sacrifice progress.
- Pain Resonance: his interaction, with an empty revealed hook in his room (no Entity on it); a
  healthy survivor on the board in a connected room is wounded (clicked on the map). Paid 3 ▲.
- Pentimento: by itself, +2 ▲ after any successful cleanse; once a round.
- The Unknown's passive: four minis (numbered 1–4); setup is made with The Unknown 1 alone (its start
  room rolled as any killer's). He plans **one card per Unknown on the board**, card 1 for Unknown
  1, card 2 for Unknown 2… (so one card a round until Hallucination adds one); each card is played
  by its own Unknown, from where it stands (`unknowns`, `unknownAt`: the one playing stands in
  the killer's `room`, as Victor does for The Twins). Between his turns Unknown 1 stands for him.
  He takes **no killer bonus turn** (the round starts with it spent, so no perk gives him one).
- Every Unknown is "the Killer" (the user's call: always): whatever a survivor asks of the
  killer's room (Overzealous, Quick Gambit, Hubris, Distortion, Power Struggle, Diversion, the
  terror radius and the chase music) counts any of them. A survivor's perk that sends the killer
  somewhere (Diversion, Quick Gambit) sends the Unknown in that room.
- Hallucination (his power): the lowest-numbered Unknown not on the board into a room connected
  to the one playing; it has a card of its own from the next round. With all four out, the power
  can't be used.
- Unbound: asked at the start of planning; a card he holds only one of gets a second copy, kept
  for good (`extraCards`, added to his hand every round).
- Undone: asked (the user's call) before progress goes onto a generator in a room with any
  Unknown, from any source; one less is added (it can be 0). The repair's own windows come after.
- Unforeseen: asked when a generator is completed; the killer goes straight to its room (The
  Unknown: the one of his choice), as Phantasm Trap's teleport does.
- The Singularity's passive: he plans **3 cards** and takes 3 turns, and never pays 4 ▲ for a bonus
  turn (Slipstream is his only one, and one a round at most, p.10). After setup a face-down EMP
  (a survival prop) goes into every room, and the kinds of that room's face-down survival props are
  dealt among them again (as the Drones). An EMP is revealed as any prop; nobody interacts with it.
- EMP: when he would attack or pick up a survivor on the board in a room with a face-up EMP, that
  survivor is asked (as a Flashlight is) whether to discard it; discarded, he loses the interaction
  of that turn. Kept, a Flashlight in the room may still be used. Only his interactions with a
  survivor (attack, pick-up) are stopped, not a prop or his power.
- Slipstream (his power, instead of interacting, once a round): every card he has set, revealed or
  not, goes back to his hand; the turns still set are lost. As that turn ends he takes a bonus turn
  with any card of his hand (no ▲, and not declined: "take a bonus turn"); it is his last turn of
  the round. Not with a bonus turn already taken that round.
- Machine Learning: asked when a generator is completed. Two killer perk cards are drawn from the
  deck (every green killer perk and the killer cards on no board, p.19) that he doesn't have; he
  keeps one as a perk more, usable at once (its own once a round), the other is discarded.
- Genetic Limits: asked at the end of planning; a survivor whose sacrifice progress token is still on
  their board (they haven't been hooked yet) can't use perks for the rest of the round.
- Forced Hesitation: asked at the end of planning while Wait is still in his hand (not set). Wait
  is discarded, a survivor on the board loses the card they set (discarded), and interacts at once
  in their room (they may not). With no card they have no turn of their own that round.
- The Skull Merchant's passive: after setup (once the start rooms are rolled), a face-down Drone goes
  into every room, and the kinds of that room's face-down objective props are dealt among them again
  (the shuffle). A Drone is revealed as any prop. A skill check rolled by a survivor on the board in a
  room with a face-up Drone (repair, open, cleanse, heal; not someone searched in a locker, who is off
  the board, p.12): a success pays him 1 ▲, a failure wounds; either way one Drone there turns face
  down (to be revealed again when someone comes in). A survivor's interaction sends a face-up Drone in
  their room to his board.
- Eyes in the Sky (his power): a face-up Drone in any room back to his board, or one from his board
  face up into his room. With neither, the power can't be used.
- Game Afoot: asked before an attack on a healthy survivor in his room on his bonus turn (the card
  of any bonus turn: paid, No One Escapes Death, Coup de Grâce, Shadowborn, Devour Hope); they are
  picked up instead.
- Leverage: asked at the start of planning; the survivor chosen can't become healthy until the next
  round (heals, perks and items that would heal them do nothing).
- THWACK!: asked after he reveals a survival or altruism prop himself (moving into its room, or by a
  power or perk that reveals); it is removed, unless someone is in it or on it.
- The Dredge's passive: his hand is six direct movement cards (skull, 1–5: the numbered cards of
  the box), one per start-room face, and no Wait. A card takes him straight to the room with that
  start face (no path: walls, pallets and traps don't matter), then he interacts. The card of the
  room he is in already can't move him, so, as any card but Wait that can't move, he loses the
  interaction (p.10). We're Gonna Live Forever and a Firecracker in the room ahead stop it, as his
  other moves. His bonus turn plays one of them too.
- Reign of Darkness (his power): a survivor on the board in his room or a connected one, holding a
  card that can move them. He sees their whole hand (said in the panel) and discards one of the
  cards that move them; they move along its path (he picks the path when it has several), as a
  move of theirs: Dissolution, traps and the reveal there all apply. Brought into his room, he may
  then attack or pick up that survivor only (not a prop, not the power again).
- Darkness Revealed: asked as he enters a room with an empty, revealed locker, before his reveal
  there. The locker is turned face down (it is a face-down prop again), he reveals nothing, and
  moves along any path (not over a pallet), or stays, before interacting.
- Dissolution: at the start of planning, on a path's icon with nothing else on it (no wall, pallet,
  trap or Entity); the Bloodpoint token shows there. Any survivor moving along it is wounded (any
  move: a card, a perk, the rescue move, Reign of Darkness). It goes at the end of cleanup.
- Septic Touch: after a survivor reveals a prop that isn't yellow (not a generator or exit gate) in
  his room or a connected one; not an occupied hook or locker. The prop leaves the board.
- Afterpiece (The Clown): one Tonic and one Antidote; the power puts either into his room or a
  connected one, moving it if it is out already. On the board a room offers both, as a small menu.
  Tonic: survivors on the board in its room when the cards are set (planning, Predator) set theirs
  face up. Antidote: whoever enters its room by their own move (a card, a perk, the rescue move;
  the killer by any move or teleport, not while carrying or in the middle of an interaction) may
  move on along any path — the killer's not over a pallet — or stay; the board's own room says stay.
  A Firecracker in the room ahead stops the killer's Antidote move as it stops a card move (he's
  left where he is and loses the turn's interaction).
- Coulrophobia: asked when a survivor's card move would take them into his room (perk moves and the
  rescue move aren't asked); used, they stay and can't interact this turn.
- Bamboozle: the Entity on a path's icon (a fork is one; not on a wall or under a pallet) until
  cleanup. Survivors can't pass it, as a wall; he passes freely, carrying too, and it stays.
- Pop Goes the Weasel: after an attack (wounding) or a hanging; a revealed crow, chest or empty
  locker in a room connected to his.
- Vile Purge (The Plague): his room and a connected one, each only if it has none (10 tokens:
  on the board and on survivors). A survivor entering a room with one by any move of their own
  (a perk's too; not carried) takes it after the room's reveal and covers a perk of their choice
  (it can't be used: `perkReady`). The third clears them all and wounds; already wounded, a
  sacrifice progress instead. Hiding in a locker (any way) takes one off — they choose which perk
  it frees — into their room, or back to the box if the room has one.
- Corrupt Intervention: the Entity on a revealed generator, gone at cleanup like any Entity.
  A prop under the Entity can't be interacted with by anyone (items, such as a toolbox, still
  work on it: they aren't interactions).
- Dark Devotion / Infectious Fright move a survivor along any path a survivor may take; on the
  board the survivor is picked first, then the path (as Breakout). Infectious Fright: from a
  connected room only, after an attack (attacks are only on healthy survivors).
- The Trickster's Knives: a survivor's ▲ maximum is 6 − 2 per Knife; ▲ above it are lost the
  moment the Knife comes (and stay lost when the Knives go). The third Knife wounds (nothing more
  if already wounded); a fourth is a sacrifice progress for him instead. With three, no heal of
  any kind is offered. "Interacts with a locker" is hiding in one, by any means (Quick & Quiet,
  Self-Preservation too): the Knives go as they hide.
- Showstopper: everyone on the board (not in a locker, hooked or carried) in his room and the
  connected ones, whatever stands on the path between.
- No Way Out: asked before any interaction with a generator or an exit gate (Fast Track's too)
  by a survivor with fewer ▲ than him; the interaction is lost. "Fewer" is checked as the moment
  comes, before he pays: 3 ▲ against 2 may use it (and he is left with 2).
- Crowd Control: a survivor on the board who sets a card this planning. The survivors on the board
  pay the 2 ▲ between them (1 + 1 or 2 from one); one in a locker, on a hook or carried doesn't
  (the user's call). Online every player puts in their own survivors' ▲ (or
  nothing), each screen showing the tally. Nothing goes through by itself: the chosen survivor's
  player confirms, paying at 2 ▲ or refusing once everyone has said and it is short; until then
  anyone may change what they put in. Refused (or not 2 ▲ among them), the killer picks from that
  survivor's hand and the card is set face up, as Stridor's is.
- Starstruck: when he would pick someone up, he moves along a path from his room (not through a
  pallet; a wall breaks, as on his other moves) and picks up another survivor on the board there,
  wounded or not, wounded this round or not. The move reveals the room and sets off what an
  entry does, but not Head On (it isn't his turn's move). Someone who hides as he comes in
  (Quick & Quiet) is not picked up.
- Fast Track / Self-Preservation (Yun-Jin): "the turn" is any turn, a survivor's or one of the
  killer's; at its end, if another survivor was wounded (by anything, a perk of their own too) or
  hung on a hook during it, she may repair a generator / hide in a locker in her room — an
  interaction out of her own turn. Both may be offered at the same moment; each once a round.
- Breakdown (Jeff): after a rescue Jeff made, or one that took him off the hook (asked after both
  rescue moves). A success takes 1 sacrifice progress from the track; not asked with none on it.
- Aftercare: after anyone becomes healthy by any means (a heal, a perk, Deliverance); the Entity
  goes onto an empty revealed hook anywhere, picked on the map (it moves there if it was out).
- Distortion: after Jeff moves into the killer's room on his own turn (a bonus turn too) by any
  move — a card, a perk (Sprint Burst, Breakout…), the rescue move; once a round, so it doesn't
  answer its own move — along any path but the one he came by, before interacting.
- Potential Energy (Vittorio): a button at the start of his turn. A revealed generator in a
  connected room with progress loses 1; one in his room (not repaired, no Entity on it) gains 1,
  and may be repaired by it (Hope, Adrenaline… answer as any repair). Clicked on the map: the
  generator next door (a menu when his room has two).
- Fogwise: a button at the start of his turn. A wall or a pallet on a path (icon) of his room goes
  to another path of his room with nothing on it. Clicked on the map: the path it leaves, then the
  path it goes to (the free paths of his room light up). With only one wall or pallet to
  move, its free paths light up straight away.
- Quick Gambit: asked when he would leave the killer's room by any move along a path; the killer
  follows along it after him, as Thrill of the Hunt (a pallet there: he breaks it and stays). Not
  while carrying someone, and only once per move (with Thrill of the Hunt too).
- Collective Stealth (Renato) and Power of Two (Thalita): an interaction of another survivor on the
  board in their room (clicked on Renato's or Thalita's mini, beside healing them), in place of any
  other. The perk is theirs: once a round, and they must be on the board (not in a locker). Collective
  Stealth: Renato moves along any path, then the survivor who interacted does; as after a rescue
  (a house rule there), each may stay instead. Power of Two: the killer gains 1 ▲, then that survivor
  takes a bonus turn (a card from their hand, as a crow's Sprint), or passes it up.
- Background Player: asked at the end of Renato's own turn while someone is on a hook (being
  sacrificed, p.15). Blood Rush: asked at the end of his turn with no sacrifice progress token on
  his board (one used up by a hook); the token goes back on it, so his next hook adds to the track.
  Either bonus turn is a card from his hand. Both are asked at the end of any of his turns, bonus
  turns too (see House rules); each is still once a round.
- Friendly Competition: asked after Thalita's own repair (success or failure) of a generator another
  survivor repaired this round (any of their attempts, before hers), while it is still unfinished.
- Cut Loose: asked when Thalita's card set in planning turns out to be Vault, as she is about to move
  (not a bonus turn's Vault). Only the colours with a path she can take are offered.
- Scavenger (Gabriel): a button at the start of his turn while he holds an item; the item is
  discarded (not used: nothing that follows an item used is asked) and a face-up generator in his
  room gains 1. It is not a repair: no skill check, no perks that follow a repair.
- Troubleshooter: asked after any move of his into a room (a bonus turn or a perk's too); he moves
  on along another path (any colour, not back the way he came) into a room with a face-up
  generator, revealing a prop there as any move does.
- Made for This: asked when the killer is about to pick him up from the board (before any carry
  dice); the sacrifice track gains 1 instead (it can fill it and win the
  killer the game) and the pick-up is gone. Not when a search of his locker fails: that is no
  pick-up the killer chooses.
- Wicked (Sable): a button in place of her interaction. Every survivor on the board gains 1 ▲ (up to
  their maximum; see House rules), then the killer gains a sacrifice progress, which can fill the
  track and win him the game.
- Strength in Shadows: a button at the start of Sable's turn. The survivor chosen is on the board,
  anywhere (herself too), wounded, and has no sacrifice progress left on their board (it went to the
  track on their first hook). The token goes back on their board, so their next hook adds to the
  track again; a survivor who can't be healed (Leverage, 3 Knives) is no choice.
- Weaving Spiders: a button in place of her interaction. "All Survivors in your space may
  collectively pay": the survivors on the board in her room, Sable included, pay 6 ▲ between them.
  She picks the generator first; then, as for Crowd Control, each of them puts in their own ▲ (on
  their own device online; `weavePay`), and she pays once it comes to 6 or calls it off. Called off,
  nothing is paid, the perk is not used, and she is back to her interaction. Any face-up generator on the board, unfinished, gains 3 ("up to 3": what
  it still needs, if less). This is not a repair: no skill check, and perks that follow a repair
  are not asked. Then the killer gains a sacrifice progress.
- Empathy: "a willing Survivor": the other survivor is asked (on their own device online) and
  answers yes or no. Only a yes uses the perk; after a no, Claudette may ask someone else, but
  not the same survivor again that round.
- Circle of Healing (Mikaela): after a cleanse of her own succeeds, a wounded survivor on the board (not
  in a locker, hung or carried: off the board, p.12) becomes healthy, picked on the map; the cleanse's ▲ are
  taken back from her.
- Shadow Step: after a move of hers along a path (any move with a path; Inner Focus has none), the
  Entity goes onto that path's icon (taken from wherever it was: there is one). "Players cannot move
  along that path": the killer neither, unlike Bamboozle's. It goes at cleanup, as the Entity does.
- Clairvoyance: at the start of planning, any face-down prop on the board, clicked on the map; it
  is her reveal (Haunted Ground, Septic Touch may answer it).
- Exponential (Jonah): after a cleanse of his own succeeds, with someone on a hook. Jonah picks who
  (their hook, on the map) and the path; the cleanse's ▲ are taken back from him. Off the hook
  without a sabotage: no Entity goes on the hook, and Deliverance, Kindred, Breakdown aren't asked.
- Overcome: by itself at the end of Jonah's own turn (not a bonus turn), when he is wounded; once a
  round, as every perk.
- Corrective Action: a button on any roll of a survivor in Jonah's room or a connected one, as
  Autodidact: a skill die showing "4" becomes a great success (the danger die has no 4).
- Overzealous (Haddie): by itself, whenever she walks into the killer's room by any move of hers
  (a card, a perk, Inner Focus); once a round, as every perk.
- Residual Manifest: asked before any interaction of the killer in her room (a prop or a survivor),
  before a Flashlight is; also Yamaoka's Haunting's, which interacts in her room from the next one
  (the user's ruling; the power is spent all the same). Not a power of his that isn't an interaction. Her item is
  discarded (Appraisal may take it) and the interaction is lost, as a Flashlight's.
- Inner Focus: asked as she would move with her card (not once another perk has changed the move,
  so Deception and Huntress Lullaby aren't asked after it). Two skill dice, read only as start
  rooms: not a skill check, so a skull pays the killer nothing and no perk changes them. She goes
  straight to the start room picked (no path: Dissolution and traps don't apply, and Deerstalker
  and Thrill of the Hunt aren't asked), then interacts as normal; the room she is in already: she
  stays and still interacts.
- No Mither (David): asked when the killer is about to attack a healthy survivor in David's room
  (David himself too; Yamaoka's Haunting reaches into his room too). David rolls the danger die;
  on a success the attack doesn't land and the killer gains 1 ▲ (his interaction is spent).
- Dead Hard: asked when another survivor in David's room is about to be hung (any hanging,
  picked up or carried there). On a success they come off the killer's shoulder in his room and
  must move along any path (no staying put: the board offers no "stay").
- We're Gonna Live Forever: asked before any move of the killer out of David's room: a card
  move (the Blight's rush, Victor's too), carrying (the step is lost, as with a Firecracker),
  the Antidote's move, a moving power (chainsaw, blink, Wailing Bell: not used, he may still
  interact), a Phantasm Trap teleport (nothing paid) and a perk's move (Starstruck, Diversion,
  Beast of Prey, Agitation). Asked before a Firecracker. He stays and still interacts there.
- Windows of Opportunity (Kate): her interaction for the turn (a perk card in her interact step,
  picked first), with a survival or altruism prop in a connected room: rummage a chest, chase
  a crow, drop a pallet (on a free path of that room), or hide in an empty locker — then she
  moves into that room first (revealing it, as any move does). Desperate Measures may follow.
- Boil Over: asked once the killer has chosen the dice, when the survivor picked up is Kate (she
  may answer while carried) or was in her room; never when he chose 4 already.
- Dance With Me: after her card move on a turn (a bonus turn too) that began with her in a
  locker, along any path but the one she just took, before interacting.
- Poised (Jane): a great success on a skill check (repair, gate, totem, heal) during a survivor's
  turn, by any survivor on the board with a card in hand. Jane pays; the roller then picks the card
  (or lets the turn go). The bonus turn comes after the interaction that rolled, before the
  turn's end-of-turn perks, and the interrupted turn carries on after it.
- Solidarity: the ordinary heal (a skill check), on a wounded survivor on the board in a room
  connected to Jane's, in place of her interaction for the turn (a perk card in her
  interact step, picked first, then the survivor).
- Head On: when the killer enters Jane's room during his turn (not carrying: he has interacted
  already), an empty revealed locker there is removed and he cannot interact (power included)
  for the rest of that turn. Jane must be on the board (in a locker, perks don't reach her).
- Smash Hit: any pallet the killer breaks (Enduring's too), any wall he moves through (Diversion's
  too), any generator he damages (with progress or not).
- Undying: the killer's interaction for the turn, with a prop in a room joined to his by a path
  of the discarded card's colour (either direction). It is an ordinary interaction over there, so
  damaging a generator with it still sets off Overcharge, Gearhead, Oppression, Dragon's Grip and
  Alert.
- Blood Favour works by itself at the start of cleanup ("sacrificed" = on a hook).
- Power Struggle needs the killer (Charlotte) in Élodie's room, before the killer's first card.
- Appraisal: any discard of another survivor's item (used, re-rolled, chosen away, wasted); with
  an item already, Élodie keeps the new one. Built to Last is asked before Appraisal.
- Deception is offered before a move made with a card on her own turn, bonus turns included.
- Desperate Measures: the second interaction is with a chest or a locker in her room; not after
  hiding (in a locker she is off the board).
- Visionary: when entering a room with a face-down prop, Felix may reveal one in a connected room
  instead (colour by colour, as usual).
- Built to Last: after using an item (key re-rolls and Flashlight / Firecracker too). Not for
  items whose use draws a new one (Map's draw, Commodious Toolbox).
  "Not again this turn" is the turn it was used in only: each of the killer's cards is a turn of
  its own (p.10), so a Flashlight kept on his first turn stops him again on his second. The offer
  says so then, as the user asked (it read as a bug).

Perk cards on no character's board (the edit-perks mode, `DECK_PERKS`):

- Hope: works by itself when a generator is finished (the fifth one too), for every survivor who
  owns it. It is free but still once a round, so only the first generator finished each round pays.
- Kindred: works by itself after a sabotage. The rescuer and the rescued survivor each gain 1 ▲,
  paid by whichever of the two owns the card ("both of you and the other Survivor"). Putting the
  Entity on an empty hook pays the one who did it alone.
- Small Game: asked after cleansing a Hex Totem succeeds; the killer loses 2 ▲ (to a minimum
  of 0, as perks never take him below it).
- This Is Not Happening: asked before any single-die skill check of the owner's (repair, gate,
  cleanse, heal, locker search) — the danger die instead, as Thanatophobia does. Not offered when
  the roll is already on the danger die.
- Resilience: asked at the start of cleanup when the owner was wounded this round, for a bonus
  turn with a card from their own hand (as Adrenaline's).
- We'll Make It: asked after the owner's heal of another survivor succeeds; that survivor takes
  the bonus turn, with a card from their own hand, and the owner pays.
- Renewal: asked at the end of a turn (a bonus turn's too, see House rules) when the owner healed
  someone or was healed this round
  (`healedWith`, cleared at cleanup); a bonus turn with a card from their hand.
- Monstrous Shrine: works by itself when the killer hangs a survivor with nobody else on the
  board in that room (a survivor in a locker isn't there, p.12); +2 ▲.
- Spies from the Shadows: works by itself when a crow tile is turned over, whoever turned it
  (a survivor entering, the killer, a Map); not during setup, where perks aren't in play yet.
- Sloppy Butcher: asked before a heal roll of a survivor in the killer's space — the danger die.
- No One Escapes Death: asked at the end of a killer turn once the exit gates are powered, and
  not with the round's bonus turn used: a card from his hand is played as that bonus turn right
  away ("at the end of your turn"), so after his first card it comes before his second, as Coup de
  Grâce's does. The rulebook's own bonus turn, paid in ▲, stays at the end of his second (p.10).
- A card laid over a printed perk covers it: the printed perk can't be used while the card is
  there (`covered`), and the moment the card is discarded from play it can be, that same round
  (it has used nothing). A card under one of The Plague's Vile Purges can't be used, so it can't
  discard itself either.
- Inner Healing: a button at the start of the owner's turn while wounded (not with three Knives).
  It heals them with no roll and no help, so it counts as healing themselves: Renewal and
  We'll Make It don't answer it, A Nurse's Calling does (any heal).
- Situational Awareness: asked at the end of the owner's own turn (a bonus turn's too, see House
  rules); the bonus turn is taken with
  a card from their hand, as every survivor bonus turn is.
- Kinship: a button in place of the owner's interaction for the turn, on another survivor on the
  board in their room or a connected one who still has a card in hand. "After this one" is the
  end of this turn, after its end-of-turn perks; the friend picks their own card (or lets it go),
  and the turn ends after them.
- Guardian: asked when the killer enters the owner's room on his turn and still has his
  interaction (not while carrying someone, and not a second time in the same turn). For the rest
  of that turn his only options are attacking or picking up that survivor: no power, no prop, no
  walking on with the Blight's rush. Wounded this round (so no pick-up) or already wounded (so no
  attack), he is left with nothing to do that turn — which is the point of the card.
- Dark Sense: "a space with no props" is a room with nothing left to interact with (`propsIn`:
  every prop there removed or finished), entered by any move on their own turn; then one more move
  along any path but the one they came by, before interacting — as Distortion's.
- Déjà Vu: when he damages a generator in another room, she repairs one in her own room at once,
  an ordinary skill check out of her turn (as Fast Track's interaction is).
- Premonition: when he walks in, before his interaction, she chases a revealed crow in her room:
  the usual crow interaction, so the killer gains 1 ▲ and she gets a bonus turn from it.
- Spine Chill: when he walks in (not a teleport of hers; any entry of his), the danger die. On a
  success she must move along any path — no staying put, as with Dead Hard.
- Lightweight: at the end of planning, before the first turn, a card (not Wait) is discarded and
  played as a move of its own. Only the move: no interaction, and it is not the round's bonus turn.
- Bitter Murmur: after he moves along a vault path (the one-way ones) or through a wall that broke
  as he passed, one more move along any path without a pallet, before he interacts.
- Claustrophobia: after a repair roll succeeds, the Entity goes onto any path's icon and survivors
  can't pass it, exactly as Bamboozle's does (he passes freely, and it goes at cleanup). There is
  one Entity token, so it moves if it was somewhere else.
- Distressing: after a survivor moves into a room with a revealed empty locker, they hide in it —
  the killer chooses which locker when there are several. A survivor in a locker is off the board
  (p.12), so this takes them out of their own turn.
- Unrelenting: after he attacks or picks up a survivor, the same again on another survivor on the
  board in his room: an attack if they are healthy, a pick-up if they are wounded (not one wounded
  this round, p.15).
- Iron Grasp: his button on the struggle roll, before it settles: every skill-check die of that
  roll is rolled again (once a round, so once per struggle).
- Insidious: when he would attack a healthy survivor and has not changed room this turn
  (`killerMoved`, which every move of his sets, teleports included), he picks them up instead —
  healthy, and whether or not they were wounded this round. It works with Yamaoka's Haunting too:
  she hasn't moved, so the attack over a path becomes a pick-up, and the survivor is brought into
  her room, as every pick-up brings them into the killer's.
- Whispers: at the start of planning, one survivor who still has a card to set either pays 1 ▲ or
  sets their card face up. The face-up card uses Stridor's own flow (that survivor plays first,
  everyone else plans knowing it), and there is one such slot, so Whispers is not offered when
  Stridor already took it. With no ▲ there is nothing to decide: the card goes face up.
- Jolt: asked when a skill check (repair, exit gate, cleanse, heal, search) settles with a skill
  die showing 1 or 2 — after re-rolls, Iron Will and Bond are done, before the roll counts. Using
  it, each such die keeps its face but counts as a failure: the roll fails, and he gains 1 ▲ per
  die as for any failure. Danger dice don't count (their faces aren't numbers 1–5), nor do the struggle and the
  Phantasm roll, which aren't skill checks.
- Plunderer's Instinct: asked whenever its owner would draw one item — a chest, the Map's draw,
  the Commodious Toolbox. They draw three (as many as the deck has left), keep one and discard
  the rest; holding an item already, the one kept then goes against it as usual (p.12).
- Fearmonger: at the start of planning, a survivor on the board in his room or a room joined to
  it. Until cleanup that survivor's perks can't be used: not asked, no buttons, nothing automatic.
  Survivors are asked before the killer at that moment (p.16), so their own start-of-planning
  perks come first.
- Slippery Meat: asked at the start of planning of a survivor on a hook (its only perk that works
  on the hook). It is the sabotage of their own hook: the Entity goes on the hook and they are off
  it, in the same room — no move along a path, no ▲ for a rescue, no rescue perks. They then set a
  card and play their turn as usual.
- Self-Aware: a button at the start of its owner's turn. There is no perk deck in the game, so the
  four cards are drawn from every survivor perk that no survivor has (on a board or laid over
  one); the card picked takes Self-Aware's place (over the same printed perk, if it was laid over
  one) and can be used from this round on; the rest go back out of the game.
- Deerstalker and Thrill of the Hunt: "leaves your space" is any move of a survivor out of his
  room — a movement card, a perk (Sprint Burst, Dead Hard, Spine Chill…), the move after a rescue,
  a teammate's No One Left Behind, and his own pushes and drags too (Brutal Strength, Dark
  Devotion, Infectious Fright: they still leave his room). Deerstalker: a wounded survivor rolls
  the danger die before moving; a failure keeps them in the room, and on their own turn they can't
  interact for the rest of it (on someone else's turn there is no interaction of theirs to lose).
  Thrill of the Hunt: after they move he moves along the same path into the same room (which may
  wake perks that watch him enter), not while carrying someone. A pallet on that path stops him as
  on any move of his (p.14): he breaks it and stays, losing his interaction only if it is his own
  turn. With both, the die comes first if he wants: if it keeps them in the room, he stays too.
- Bloodweb and Devout (p.19): two kinds of perk (the user's ruling). The perks printed on the
  character boards — purple (the character's own) and green (shareable) — are every board's own
  and block nobody. The perk cards in the box (gold) are one of each: every green perk and the 35
  on no board (a purple perk has no card). Only cards are laid over a board, and a card is in one
  character's hands at most; so two characters may play the same perk, one from their board and
  the other from its card (Zarina keeps Off the Record, Meg takes the Off the Record card). Devout
  picks from the side's cards, but the ones of the character's own board; Bloodweb deals 5 each
  from one shuffled deck per side, a card of a perk on the drawer's own board discarded and
  another drawn. Either way a loadout is 3 different perks, the cards laid over the printed perks
  dropped (in slot order). Perks are set after every character is locked in (Bloodweb deals from
  all of them); reopening a character clears every loadout. A card someone sets shows as taken to
  the rest of their side at once (first come); Devout's picks are otherwise hidden until the game
  starts.
- No One Left Behind: its owner's interaction, in a room with a revealed exit gate (powered or
  not). One survivor of their choice — themselves included — moves along any one path, as after a
  rescue: any colour, one way on a vault, never through a wall or the Entity.
