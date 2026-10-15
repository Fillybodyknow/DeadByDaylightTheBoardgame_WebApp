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

- **Trust model: friends, not strangers.** Every device runs the same engine and writes the new
  state itself. `engine/seats.ts` decides who may act (`actorsOf`, `mayAct`). Writes are
  transactions, so two players acting at once can't overwrite each other: the second action is
  checked again against the new state. Nothing is hidden from a player who opens the dev tools.
- **Planning:** each survivor player sends their own hand with `planHand`. The cards are
  revealed once every hand is in, and then the killer plans.
- **Backends** (`online/`):
  - `firebase.ts` is the Realtime Database. Its URL goes in the project root's `.env.local`
    (git-ignored) as `VITE_FIREBASE_DATABASE_URL`; the deploy reads it from the repo's Actions
    variables `VITE_FIREBASE_DATABASE_URL` and `VITE_FIREBASE_PROJECT_ID`. The game is stored as a JSON string, because
    the database drops nulls.
  - Small writes (`logArchive.ts`): the log is over 90% of a late game's state, so each move
    writes the game without the log of finished rounds (~12 KB instead of up to ~130 KB). Each
    finished round's log is written once to `rooms/<CODE>/log/r<N>`, and every device puts the
    full log back together. A round leaves the written state only once its archive is in the room.
  - `local.ts` is used when no URL is set. It syncs tabs of one browser (IndexedDB +
    BroadcastChannel), with one seat per tab, for testing alone.
- **Rules:** `database.rules.json` (project root) limits access to `rooms/<CODE>` (`lobby`, `game`,
  `log`). Paste it into the Firebase console under Realtime Database → Rules (the default
  test-mode rules expire). With older rules that lack `log`, games still work but write the
  whole log on every move.
- The top bar shows "กำลังซิงก์…" while this device's moves take long to reach the room, and
  "การเชื่อมต่อหลุด" while it is disconnected (`SyncBadge.vue`).
- Undo is off online. The host's ออก ends the game for everyone and returns to the room. Other
  players leave and can rejoin with the same code; the seat is kept per device.
- `?test` in the URL exposes the game to automated multi-player tests (`window.__dbdl`).

## Scope

- Board: **MacMillan Estate** only (11 rooms, 22 paths, 4 breakable walls, all 44 props).
- Killers: **The Trapper, The Nurse, The Huntress, The Hillbilly** (the rulebook's
  automated-mode cast, p.20–23), **The Doctor, The Hag, The Wraith, The Oni, The Deathslinger**
  — with powers and passives.
- Survivors: **Dwight, Meg, Jake, Claudette, Feng Min, Ace, Nea, Yui Kimura, Zarina Kassir**.
  Others are locked in the setup screen until their perks are written (`engine/perks.ts`).
- Mode **Adept**: each character plays the 3 perks printed on their board (54 perks).
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
- The Hag's Phantasm Trap: when she doesn't teleport, she gains ▲ equal to the die (the card
  says "gain a ▲"). Teleporting still costs ▲ equal to the die.
- After a rescue, the rescuer and the rescued survivor may each stay in the room instead of
  moving along a path (the rulebook, p.13, has them move).

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
- Firecracker stopping the killer counts as a failed move: the killer stays and loses that
  turn's interaction. Flashlight uses up the killer's interaction for that turn.
- A survivor in a locker who must move leaves the locker first, even if the move then fails.

Killer powers:

- The Nurse's blink doesn't break the pallet or wall it passes, and a Firecracker can't stop it.
- The Huntress's hatchet reaches survivors in connected rooms only, not in her own room.
- The Hillbilly's chainsaw wounds one healthy survivor in the room it enters; with several, the
  killer picks. Quick & Quiet happens on entering, so Meg can hide before the cut.

Perks:

- Unnerving Presence, Thanatophobia and Bond change single-die skill checks (repair, exit gate,
  cleanse, heal, locker search), not the carry roll or danger-die rolls.
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
- Stridor's survivor plays their card face up as soon as the survivors have planned.

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
