# ดบดล — เล่นเต็มเกม (full playable game)

The full game, part of the same app as the companion (`src/`). The menu (`#/`) offers:
- **Online** (`#/online`): each player on their own device, in a room shared through Firebase.
- **Offline** (`#/play`): the whole game on one shared device (hot-seat).
- **Companion** (`#/lobby`): the helper for the physical board game.

The game reuses the companion's card data (`src/data`), images (`public/assets`), theme,
sounds, character sheet, roulette, loading screen and start-room intro. It is deployed with the
companion to GitHub Pages.

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
  `planHand`, and the killer sends his two cards with `planKiller` in the same step; they are
  kept in `killerDraft` until the last survivor hand is in, and whoever confirms last starts the
  round. Until then a confirmed plan can be taken back and made again (`unplanHand`,
  `unplanKiller`; the "ยกเลิก — เลือกการ์ดใหม่" button in the waiting panel). Nobody learns anything new from it — the survivors' cards are face down to the killer
  either way (p.8) — it only saves the wait. On one shared device the survivors still plan first
  and the device then goes to the killer, behind the hand-off curtain.
- **The room board** (`#/online`): open rooms are listed under `roomIndex/<code>` (name, host,
  members, phase, locked), apart from the rooms, which are still only read with their code. The
  host's device keeps the listing current, and Firebase takes it off when that device
  disconnects (`onDisconnect`); the last one out of a lobby takes it off too, and listings quiet
  for 6 hours aren't shown. A room is created with a name (a random one on offer, 🎲) and an
  optional password: the room keeps only its SHA-256 hash with the code, and a device already in
  the room comes back without it. Friends, not strangers: the check is on the joining device.
  **The database rules must be updated** (`roomIndex`) for the board to show rooms; without
  them rooms still work by code.
- **Room settings** (`online/settings.ts`, the lobby's ⚙ card): the host sets them before
  seating everyone, everyone sees them (with chips for what differs from the defaults), and a
  change makes everyone say ready again. Stored in the lobby node as a partial object, so older
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
    survivors may repeat a teammate's (the second gets a number after the name); the host may
    ban characters (never picked or drawn; at least 4 survivors — 1 with repeats — and 1
    killer stay).
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
  The Twins, The Blight, The Spirit, The Legion, The Trickster, The Plague, The Clown, The Knight** — with powers and passives.
- Survivors: **Dwight, Meg, Jake, Claudette, Feng Min, Ace, Nea, Yui Kimura, Zarina Kassir,
  Élodie Rakoto, Felix Richter, Adam Francis, Yun-Jin Lee, Jane Romero, Kate Denson, David King, Jeff Johansen**.
  Others are locked in the setup screen until their perks are written (`engine/perks.ts`).
- Mode **Adept**: each character plays the 3 perks printed on their board (102 perks).
- The **perk cards** of the edit-perks mode (`src/data/editPerks.json`): 94 of the 129 cards are
  the printed ones; 35 are on no board. 27 of those are in the engine (`DECK_PERKS` in
  `engine/perks.ts`), the rest are next. A card-only perk has no character and no index: its
  name, cost, text and art come from the card data (`perkCard` in `labels.ts`). A card is laid
  over one of the character's printed perk slots: `perks` holds the card and `covered` the perk
  under it (`SurvivorState`), and the four cards that discard themselves free it again. Picking
  the cards before a trial is still to come: nothing deals them yet.
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

Next: the other killers and survivors, Devout / Bloodweb perk choice, the other boards (each
needs its graph in `boards.ts`), the 2-player rule, then bots from the automated rules.

## House rules

- Hanging is the killer's choice: picking up a survivor next to a free hook, or carrying one
  into a room with a free hook while steps are left, the killer may hang them there or carry on
  (the rulebook, p.18, hangs at once). Ending the carry on a free hook still hangs.
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
  pick-up then) and a Diversion (on a survivor's turn he has no interaction to lose). Not the
  teleports (Blink, Wailing Bell, a Phantasm Trap) — and Yamaoka's Haunting doesn't move him.
- A survivor in a locker who must move leaves the locker first, even if the move then fails.

Killer powers:

- The Nurse's blink doesn't break the pallet or wall it passes, and a Firecracker can't stop it.
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

- Madness changes single-die skill checks (as above) to the danger die, not the carry roll or a
  Phantasm Trap roll. A survivor in a locker isn't in the room for Carter's Spark.
- A Phantasm Trap roll is a skill check die: keys can re-roll it, Iron Will doesn't apply, and a
  0 still gives The Hag 1 ▲. Teleporting reveals a prop like any move; attacking or picking up
  someone there is optional.
- The Wailing Bell and a Phantasm teleport can't be stopped by a Firecracker.
- Overwhelming Presence covers items used from the item menu, not key re-rolls or the
  Flashlight / Firecracker reactions.
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
- Redeemer: any card in hand can be discarded, Wait included. The survivor guesses among the 5
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
- Diversion (Adam): an interaction with the killer in his room. "Any path" means any colour; a
  wall on it the killer breaks on the way (as on any move of his), but a path with a pallet isn't
  offered. The killer reveals a prop where he arrives, as on any move.
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
  Jailer leaves the game for good. Not being searched: in a locker they are off the board (p.12). The killer still gains ▲ for the failures.
- Nowhere to Hide: asked before the search roll; it is on the danger die.
- Hubris: a survivor entering his room by any move pays 1 ▲; with none, they can't interact this
  turn if it is their turn (on someone else's turn there is no interaction to lose).
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
- Crowd Control: a survivor on the board who sets a card this planning. The survivors pay the 2 ▲
  between them (1 + 1 or 2 from one). Online every player puts in their own survivors' ▲ (or
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
- Renewal: asked at the end of a turn when the owner healed someone or was healed this round
  (`healedWith`, cleared at cleanup); a bonus turn with a card from their hand.
- Monstrous Shrine: works by itself when the killer hangs a survivor with nobody else on the
  board in that room (a survivor in a locker isn't there, p.12); +2 ▲.
- Spies from the Shadows: works by itself when a crow tile is turned over, whoever turned it
  (a survivor entering, the killer, a Map); not during setup, where perks aren't in play yet.
- Sloppy Butcher: asked before a heal roll of a survivor in the killer's space — the danger die.
- No One Escapes Death: asked at the end of a killer turn once the exit gates are powered, and
  not with the round's bonus turn used: a card from his hand goes onto his planned cards and is
  played as that bonus turn.
- A card laid over a printed perk covers it: the printed perk can't be used while the card is
  there (`covered`), and the moment the card is discarded from play it can be, that same round
  (it has used nothing). A card under one of The Plague's Vile Purges can't be used, so it can't
  discard itself either.
- Inner Healing: a button at the start of the owner's turn while wounded (not with three Knives).
  It heals them with no roll and no help, so it counts as healing themselves: Renewal and
  We'll Make It don't answer it, A Nurse's Calling does (any heal).
- Situational Awareness: asked at the end of the owner's own turn; the bonus turn is taken with
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
  healthy, and whether or not they were wounded this round.
- Whispers: at the start of planning, one survivor who still has a card to set either pays 1 ▲ or
  sets their card face up. The face-up card uses Stridor's own flow (that survivor plays first,
  everyone else plans knowing it), and there is one such slot, so Whispers is not offered when
  Stridor already took it. With no ▲ there is nothing to decide: the card goes face up.
