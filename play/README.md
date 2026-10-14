# ดบดล — เล่นเต็มเกม (full playable game)

A separate app from the companion in `src/`: the whole game played on one shared device
(hot-seat). It reuses the companion's card data (`src/data`), images (`public/assets`),
theme (`src/style.css`) and sound effects (`src/sound.ts`), but has its own entry page,
Vite config and build. **It is not deployed**: the GitHub Pages workflow builds only the
companion (`vite.config.ts`). The game reproduces the board game's rules and art, so keep it
private.

```sh
npm run dev:play     # http://localhost:5174
npm run test:play    # engine tests (vitest)
npm run build:play   # type-check + build into dist-play/
```

## Layout

| Path | What |
|---|---|
| `src/engine/types.ts` | Game state, steps, actions (plain data, JSON-safe) |
| `src/engine/boards.ts` | Board graphs: rooms, printed prop slots, paths, walls, coordinates |
| `src/engine/engine.ts` | The rules: `createGame`, `apply(state, action)`, legal-option queries |
| `src/engine/legal.ts` | Every legal action in a state (tests, future bots) |
| `src/engine/engine.test.ts` | Rule tests plus random full playthroughs |
| `src/game.ts` | Current game, undo history, save to localStorage |
| `src/components/` | Setup screen, board (with its animations), action panel, planning, status, log, and the modals: dice, banners, details, round summary, end summary |
| `src/fx/` | Screen effects queue (`bus.ts`) and the game's synthesised sound effects (`audio.ts`) |
| `src/stats.ts` | Round summaries, end-of-game stats and timeline, read from the log |
| `src/inspect.ts` | Details modal targets and the rules text for each prop |

The engine is a pure reducer. `state.step` is the input it waits for; handling an action may
queue tasks (`state.queue`) that run until one needs input again. The RNG seed lives in the
state, so a saved game replays exactly and undo cannot be used to re-roll dice. Log entries
carry a structured event (`ev`) beside the text; the UI animates those, and the summaries
count them, so the engine never depends on the UI.

## Scope

- Board: **MacMillan Estate** only (11 rooms, 22 paths, 4 breakable walls, all 44 props).
- Killers: **The Trapper, The Nurse, The Huntress, The Hillbilly** (the rulebook's
  automated-mode cast, p.20–23), **The Doctor, The Hag, The Wraith** — with powers and passives.
- Survivors: **Dwight, Meg, Jake, Claudette, Feng Min, Ace, Nea**. Others are locked in the
  setup screen until their perks are written (`src/engine/perks.ts`).
- Mode **Adept**: each character plays the 3 perks printed on their board (42 perks).
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
Will on a roll. Calm Spirit is an interaction with a crow. A Nurse's Calling works by itself.
Tinkerer changes a face-down card, so the device is handed to the killer first.

Next: the other killers and survivors, Devout / Bloodweb perk choice, the other boards (each
needs its graph in `boards.ts`), the 2-player rule, then bots from the automated rules.

## House rules

- Hanging is the killer's choice: picking up a survivor next to a free hook, or carrying one
  into a room with a free hook while steps are left, the killer may hang them there or carry on
  (the rulebook, p.18, hangs at once). Ending the carry on a free hook still hangs.
- The Hag's Phantasm Trap: when she doesn't teleport, she gains ▲ equal to the die (the card
  says "gain a ▲"). Teleporting still costs ▲ equal to the die.

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
