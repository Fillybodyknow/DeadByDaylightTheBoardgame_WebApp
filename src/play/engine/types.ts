import type { PerkId } from './perks'

// Game state for the full playable version. Everything here is plain data (no classes,
// no functions) so a state can be cloned, saved to localStorage and replayed.

export type PathKind = 'sneak' | 'sprint' | 'crouch' | 'vault'
export type MoveCard = PathKind | 'wait'

export type PropCategory = 'objective' | 'survival' | 'altruism' | 'boldness'
export type PropKind = 'generator' | 'exitGate' | 'chest' | 'locker' | 'crow' | 'pallet' | 'hook' | 'totem'

// ---------- static board ----------

export interface RoomDef {
  id: string
  name: string
  /** Skill check face 0–5 for the Room Setup start roll, null when the room has none. */
  startFace: number | null
  /** Face-down prop slots printed on the room (rulebook p.5). */
  props: PropCategory[]
  /** Room card on the map image as fractions of its width/height [x, y, w, h]. */
  box: [number, number, number, number]
}

export interface PathDef {
  id: string
  a: string
  b: string
  kind: PathKind
  /** Starts with a breakable wall (distressed border, p.5). */
  wall: boolean
  /** Centre of the path icon on the map image, as fractions. */
  at: [number, number]
}

export interface BoardDef {
  id: string
  name: string
  image: string
  /** width / height of the map image */
  aspect: number
  rooms: RoomDef[]
  /** Vault paths are one-way from `a` to `b`. */
  paths: PathDef[]
}

// ---------- dynamic state ----------

export interface Prop {
  id: string
  kind: PropKind
  category: PropCategory
  /** Room it sits in; null once dropped on a path (pallet) or removed. */
  room: string | null
  /** Path a dropped pallet sits on. */
  path: string | null
  revealed: boolean
  removed: boolean
  /** Generator / exit gate progress 0–3. */
  progress: number
  /** Repaired generator, moved to the generator track (p.12). */
  done: boolean
  /** Survivor index hiding in this locker or hanging on this hook. */
  occupant: number | null
}

export type SurvivorStatus = 'board' | 'locker' | 'carried' | 'hooked'

export interface SurvivorState {
  characterId: string
  name: string
  room: string
  wounded: boolean
  /** Wounded during this round: cannot be picked up (p.15). */
  woundedThisRound: boolean
  status: SurvivorStatus
  bp: number
  /** Item id held (max 1, p.12). */
  item: string | null
  /** Sacrifice progress token still on the identity board (p.6, p.15). */
  sacrificeToken: boolean
  /** Index into `survivorHands` (players controlling 2 survivors share one hand, p.19). */
  hand: number
  /** Card placed face down in Planning. */
  planned: MoveCard | null
  plannedRevealed: boolean
  /** Took their turn this round (a card shown early by Stridor is revealed but not played). */
  acted: boolean
  /** The Doctor's Madness: skill checks use the danger die until a failure clears it. */
  madness: boolean
  /** Printed perks (Adept mode); empty for characters without implemented perks. */
  perks: PerkId[]
}

export interface KillerState {
  characterId: string
  name: string
  room: string
  bp: number
  hand: MoveCard[]
  /** Cards placed in Planning, left to right; a third one for the bonus turn. */
  planned: MoveCard[]
  /** How many planned cards have been flipped. */
  revealedCount: number
  /** Rainbow Map: every planned card is shown to the survivors. */
  plannedShown: boolean
  powerUsed: boolean
  bonusUsed: boolean
  /** Bear traps not on the board (The Trapper has 4). */
  trapsInSupply: number
  /** Planned cards shown to the survivors early (Lightborn), by index. */
  shown: number[]
  perks: PerkId[]
}

export interface PathState {
  wall: boolean
  trap: boolean
}

export type EntityPlace = { prop: string } | { path: string } | null

export interface Die {
  kind: 'skill' | 'danger'
  /** skill: 0 = skull (failure) … 5 = great success. danger: image index 0–5 (0 and 2 are great). */
  face: number
  rerolled: boolean
  /** Iron Will: this failure counts as a success (the killer still gains ▲). */
  asSuccess?: boolean
}

// What a pending dice roll is for; resolved once nobody re-rolls any more.
export type RollContext =
  | { k: 'repair'; s: number; prop: string }
  | { k: 'openGate'; s: number; prop: string }
  /** `retribution`: The Deathslinger's perk made it a danger-die roll; a success pays him 2 ▲. */
  | { k: 'cleanse'; s: number; prop: string; retribution?: boolean }
  | { k: 'heal'; s: number; target: number }
  | { k: 'trap'; s: number; path: string }
  | { k: 'search'; s: number; prop: string }
  | { k: 'carry'; s: number }
  /** The Huntress's hatchet (danger die). */
  | { k: 'hatchet'; s: number }
  /** Walking into The Hag's Phantasm Trap: the face decides the cost of her teleport. */
  | { k: 'phantasm'; s: number; room: string }
  /** Overwhelming Presence: a failure wastes the item being used. */
  | { k: 'overwhelm'; s: number }
  /** Botany Knowledge / Self-Care (danger die). */
  | { k: 'botany'; s: number; target: number }
  | { k: 'selfCare'; s: number }

export type SurvivorInteraction =
  | { k: 'rummage'; prop: string }
  | { k: 'hide'; prop: string }
  | { k: 'crow'; prop: string }
  | { k: 'dropPallet'; prop: string; path: string }
  | { k: 'repair'; prop: string }
  | { k: 'openGate'; prop: string }
  | { k: 'sabotage'; prop: string }
  | { k: 'cleanse'; prop: string }
  | { k: 'heal'; target: number }
  /** Calm Spirit (Jake): move a crow in your space to any room. */
  | { k: 'calmSpirit'; prop: string; room: string }

export type KillerInteraction =
  | { k: 'search'; prop: string }
  | { k: 'scout'; prop: string }
  | { k: 'damage'; prop: string }
  | { k: 'venerate'; prop: string }
  | { k: 'attack'; target: number }
  | { k: 'pickUp'; target: number }
  /** The Trapper's power: place a bear trap, optionally taking one back from `remove`. */
  | { k: 'power'; path: string; remove?: string }
  /** The Nurse: move to a connected room through anything, even against a vault. */
  | { k: 'blink'; path: string }
  /** The Huntress: a survivor in a connected room rolls the danger die. */
  | { k: 'hatchet'; target: number }
  /** The Hillbilly: discard a card to move along a free path of its colour. */
  | { k: 'chainsaw'; card: MoveCard; path: string }
  /** The Doctor: shock every survivor in this room or a connected one. */
  | { k: 'spark'; room: string }
  /** The Hag: a Phantasm Trap in her room. */
  | { k: 'phantasm' }
  /** The Wraith: move to a room not connected to hers. */
  | { k: 'bell'; room: string }
  /** The Oni: ▲ for each wounded survivor and Hex Totem in his room and connected rooms. */
  | { k: 'wrath' }
  /** The Deathslinger: secretly discard `card`; `target` guesses it or is reeled in. */
  | { k: 'redeemer'; target: number; card: MoveCard }

/** A moment when perks may be used, with what is needed to decide. */
export type PerkWindow =
  | { k: 'afterAttack'; target: number }
  | { k: 'preRoll'; ctx: RollContext }
  | { k: 'planningStart' }
  | { k: 'planningEnd' }
  | { k: 'cardMove'; s: number; card: PathKind }
  | { k: 'afterKillerInteract'; turn: number }
  | { k: 'palletBlock'; path: string; to: string }
  | { k: 'genDone' }
  | { k: 'afterCardMove'; s: number; from: string; to: string; path: string }
  | { k: 'cleanupStart' }
  | { k: 'killerEntered'; room: string }
  | { k: 'afterSabotage'; s: number }
  /** Start / end of any survivor's turn (Open-Handed, Urban Evasion, Up the Ante). */
  | { k: 'turnBegin'; s: number }
  | { k: 'turnEnd'; s: number }
  /** The killer broke a pallet or a wall, or damaged a generator (Alert, Overcharge). */
  | { k: 'killerBreak'; what: 'pallet' | 'wall' | 'damage' }
  /** A repair roll failed (Technician). */
  | { k: 'repairFail'; s: number; prop: string }
  | { k: 'afterRummage'; s: number; prop: string }
  /** A survivor is about to use an item (Overwhelming Presence). */
  | { k: 'preItem'; s: number }
  /** Start of one of the killer's turns, before the card is revealed (Zanshin Tactics). */
  | { k: 'killerTurnBegin'; turn: number }
  /** The killer is about to attack or pick up `target` (Red Herring). */
  | { k: 'preKillerInteract'; target: number }
  /** A survivor was hung on a hook — "sacrificed" (Blood Echo, Dead Man's Switch). */
  | { k: 'afterHang'; s: number }
  /** A survivor dropped a pallet or hid in a locker (Nemesis). */
  | { k: 'afterPalletLocker'; s: number; prop: string }
  /** A survivor entered a room (For the People). */
  | { k: 'entered'; s: number }
  /** A roll had `fails` failures; the killer gains them unless Off the Record takes one. */
  | { k: 'rollFail'; s: number; fails: number }
  /** A survivor rolled a great success (Lucky Break). */
  | { k: 'greatRoll'; s: number }
  /** Buttons rather than questions: start of a survivor's turn, their interact step, a roll. */
  | { k: 'turnStart'; s: number }
  | { k: 'interact'; s: number }
  | { k: 'roll' }

/** What a perk was used on; only the fields that perk needs are set. */
export interface PerkChoice {
  target?: number
  path?: string
  card?: MoveCard
  index?: number
  prop?: string
  /** Ace in the Hole: the prop to swap with. */
  prop2?: string
  mode?: 'bp' | 'bonus' | 'take' | 'give'
}

export type PerkOwner = number | 'killer'

export type ItemUse =
  | { k: 'bp' }
  | { k: 'generator'; prop: string }
  | { k: 'heal'; target: number }
  | { k: 'wall'; path: string }
  /** Map / Rainbow Map: up to 3 face-down props anywhere. */
  | { k: 'reveal'; props: string[] }
  | { k: 'draw' }
  | { k: 'showKiller' }

/** The input the game is waiting for. */
export type Step =
  /** Internal: between steps, while the task queue runs. */
  | { t: 'idle' }
  | { t: 'setupReveal'; s: number }
  /** Entering a room: pick which face-down prop (colour) to flip. */
  | { t: 'revealProp'; who: number | 'killer'; room: string }
  | { t: 'planSurvivors' }
  | { t: 'planKiller' }
  | { t: 'survivorMove'; s: number; card: PathKind }
  /** `exclude`: Technician's second interaction can't target this prop again. */
  | { t: 'survivorInteract'; s: number; canInteract: boolean; exclude?: string }
  | { t: 'bonusOffer'; s: number }
  /** Move along any path (after a rescue, p.13). */
  | { t: 'anyMove'; s: number }
  | { t: 'keepItem'; s: number; drawn: string }
  /** `keep`: Bond rolled two dice and one must be kept. */
  | { t: 'roll'; ctx: RollContext; dice: Die[]; keep?: boolean }
  | { t: 'killerMove'; turn: number; card: PathKind }
  /** `powerOnly`: Territorial Imperative's extra power use. */
  | { t: 'killerInteract'; turn: number; canInteract: boolean; powerOnly?: boolean }
  | { t: 'killerBonusOffer' }
  | { t: 'carryDice'; s: number }
  | { t: 'carryMove'; s: number; steps: number }
  /** A survivor may discard an item to stop what the killer is doing. */
  | { t: 'reaction'; item: 'flashlight' | 'firecracker'; holders: number[]; pending: Action }
  /** Use this perk now? `done` is set when the offer comes from a trigger with more to ask. */
  | {
      t: 'offer'
      perk: PerkId
      owner: PerkOwner
      w: PerkWindow
      done?: string[]
      /**
       * The owner's other perks for this same moment. Any of them may be used first, in any
       * order; passing passes on all of them (p.16, Timing).
       */
      alt?: PerkId[]
    }
  /** Start of a survivor's turn, when start-of-turn perks can be used. */
  | { t: 'turnStart'; s: number }
  /** Carter's Spark: this survivor pays 1 ▲ or takes the shock; `rest` are next. */
  | { t: 'sparkChoice'; s: number; rest: number[] }
  /** A survivor walked into a Phantasm Trap: The Hag takes ▲ or teleports for `face` ▲. */
  | { t: 'phantasmChoice'; s: number; room: string; face: number }
  /** Predator: this survivor sets a new movement card. */
  | { t: 'replaceCard'; s: number }
  /** The Hillbilly's chainsaw entered a room with several healthy survivors. */
  | { t: 'pickSurvivor'; why: 'chainsaw'; options: number[] }
  /** The Deathslinger's Redeemer: survivor `s` guesses the card he discarded face down. */
  | { t: 'redeemerGuess'; s: number }
  | { t: 'gameOver'; winner: 'survivors' | 'killer' }

/** Queued work that runs once the current step has its input. */
export type Task =
  | { k: 'survivorTurn'; s: number }
  | { k: 'survivorInteract'; s: number }
  | { k: 'endSurvivorTurn'; s: number }
  | { k: 'anyMove'; s: number }
  /**
   * `extra`: a turn from Devour Hope at the start of cleanup (cleanup is already queued).
   * `begun`: the start-of-turn perks were asked.
   */
  | { k: 'killerTurn'; turn: number; extra?: boolean; begun?: boolean }
  /** The killer's interaction, after Red Herring had its chance to redirect it. */
  | { k: 'killerDo'; i: KillerInteraction; turn: number | null }
  /** A roll's result, after Off the Record had its chance at the killer's ▲. */
  | { k: 'resolveRoll'; ctx: RollContext; dice: Die[]; fails: number }
  | { k: 'killerInteract'; turn: number }
  | { k: 'endKillerTurn'; turn: number; extra?: boolean }
  | { k: 'cleanup' }
  | { k: 'reveal'; room: string; who: number | 'killer' }
  /** Carrying: after entering a room (and revealing), hang, keep going or drop the survivor. */
  | { k: 'carryArrive'; s: number; steps: number }
  /** Ask each owner of a perk for this window, one at a time (`done`: already asked). */
  | { k: 'trigger'; w: PerkWindow; done: string[] }
  | { k: 'plan' }
  | { k: 'turnStart'; s: number }
  /** A survivor is about to move with a card (Huntress Lullaby may stop it). */
  | { k: 'cardMove'; s: number; card: PathKind }
  | { k: 'doMove'; s: number; card: PathKind }
  | { k: 'roll'; ctx: RollContext; n: number; kind: Die['kind'] }
  /** Go back to a step after work queued during it (an item used mid-step). */
  | { k: 'resume'; step: Step }
  | { k: 'chainsawHit'; room: string }
  /** An item use that waited for Overwhelming Presence. */
  | { k: 'itemUse'; s: number; use: ItemUse }
  /** The Hag teleported: interact once the room is revealed. */
  | { k: 'phantasmHit'; i: KillerInteraction | null }

export type Action =
  | { t: 'setupReveal'; prop: string }
  | { t: 'reveal'; prop: string }
  /** One card per survivor, null for a hooked survivor (p.15). */
  | { t: 'planSurvivors'; cards: (MoveCard | null)[] }
  /**
   * Online play: one player sets the cards for the survivors of their own hand (one entry per
   * survivor, by index; only that hand's entries are read). Planning ends once every hand is in.
   */
  | { t: 'planHand'; hand: number; cards: (MoveCard | null)[] }
  | { t: 'planKiller'; cards: MoveCard[] }
  | { t: 'move'; path: string; reacted?: boolean }
  | { t: 'stop' }
  /** Hang the carried survivor on the free hook in this room. */
  | { t: 'hang' }
  | { t: 'interact'; i: SurvivorInteraction | KillerInteraction; reacted?: boolean }
  | { t: 'endTurn' }
  | { t: 'bonus'; card: MoveCard }
  | { t: 'declineBonus' }
  | { t: 'keepItem'; keep: 'new' | 'old' }
  | { t: 'carryDice'; n: number }
  | { t: 'reroll'; s: number; die: number }
  /** `die`: the die kept, when Bond rolled two. */
  | { t: 'acceptRoll'; die?: number }
  /** Use (or decline) a perk. `quiet`: don't ask again this round. */
  | { t: 'perk'; perk: PerkId; use: boolean; choice?: PerkChoice; quiet?: boolean }
  /** Done with the start-of-turn perks: move. */
  | { t: 'continue' }
  | { t: 'pick'; s: number }
  /** Carter's Spark: pay 1 ▲, or take Madness / the wound. */
  | { t: 'spark'; pay: boolean }
  /** Phantasm Trap: gain 1 ▲, or teleport (paying the face) and maybe interact. */
  | { t: 'phantasm'; teleport: boolean; i?: KillerInteraction }
  | { t: 'replace'; card: MoveCard }
  /** Redeemer: the survivor's guess at The Deathslinger's discarded card. */
  | { t: 'guess'; card: MoveCard }
  | { t: 'react'; s: number | null }
  | { t: 'useItem'; s: number; use: ItemUse }

export interface LogEntry {
  round: number
  /** Empty for entries that only carry an event (not shown in the log). */
  text: string
  /** Who it is about, for colouring: survivor index, 'killer' or 'game'. */
  who: number | 'killer' | 'game'
  dice?: Die[]
  /** What happened, for animations, round summaries and end-of-game stats. */
  ev?: GameEvent
}

/** Something that happened, in structured form (the UI animates these). */
export type GameEvent =
  | { k: 'round'; round: number }
  /** `path` is empty for a teleport (Wailing Bell, a Phantasm Trap). */
  | { k: 'move'; who: number | 'killer'; from: string; to: string; path: string }
  | { k: 'phantasmSet'; room: string }
  | { k: 'madness'; s: number; on: boolean }
  | { k: 'reveal'; prop: string; kind: PropKind; room: string }
  /** `prop` / `target`: the generator, gate, totem or locker, or the survivor healed (for the screen). */
  | { k: 'roll'; s: number; ctx: RollContext['k']; prop?: string; target?: number }
  /** `perk`: a perk wounded them (Blood Echo), or they wounded themselves (Yui, Zarina). */
  | { k: 'wound'; s: number; by: 'attack' | 'trap' | 'power' | 'perk' }
  | { k: 'perk'; who: PerkOwner; perk: PerkId }
  | { k: 'heal'; s: number; by: number }
  | { k: 'pickUp'; s: number }
  | { k: 'carryEscape'; s: number }
  | { k: 'hook'; s: number; prop: string }
  | { k: 'rescue'; s: number; by: number }
  | { k: 'sacrifice'; total: number }
  | { k: 'repair'; s: number; prop: string; add: number; progress: number }
  | { k: 'genDone'; prop: string; room: string }
  | { k: 'gatesPowered' }
  | { k: 'gate'; s: number; progress: number }
  | { k: 'damage'; prop: string }
  | { k: 'cleanse'; s: number }
  | { k: 'trapSet'; path: string }
  | { k: 'trapSprung'; s: number; path: string }
  | { k: 'palletDrop'; s: number; path: string }
  | { k: 'palletBreak'; path: string }
  | { k: 'wallBreak'; path: string }
  | { k: 'item'; s: number; item: string }
  | { k: 'bp'; who: number | 'killer'; n: number }
  | { k: 'gameOver'; winner: 'survivors' | 'killer' }

export interface GameState {
  version: 3
  board: string
  round: number
  phase: 'setup' | 'planning' | 'survivors' | 'killer' | 'cleanup' | 'over'
  step: Step
  queue: Task[]
  survivors: SurvivorState[]
  /** Movement cards still in each survivor hand this round. */
  survivorHands: MoveCard[][]
  /** Player number (1-based, killer = 1) controlling each hand. */
  handPlayers: number[]
  killer: KillerState
  props: Prop[]
  paths: Record<string, PathState>
  entity: EntityPlace
  sacrifice: number
  firstPlayer: number
  itemDeck: string[]
  /** Survivor whose turn it is (also during their bonus turn). */
  activeSurvivor: number | null
  /** The current turn may still interact (a failed or blocked move loses it, p.8, p.14). */
  canInteract: boolean
  /** Perks used this round, as "<owner>:<perk>" (owner "k" or the survivor index). */
  perksUsed: string[]
  /** Perks whose owner said "don't ask again this round". */
  perksMuted: string[]
  /** Huntress Lullaby stopped the next card move. */
  moveBlocked: boolean
  /**
   * Changes to the next skill check: danger die instead (Unnerving / Thanatophobia), two dice
   * keep one (Bond), Retribution (danger die; a success pays the killer).
   */
  rollMods: { danger: boolean; keep: boolean; retribution?: boolean }
  /** Stridor: this survivor's planned card is played face up. */
  stridor: number | null
  /** Rooms with one of The Hag's Phantasm Traps (7 tokens, one per room). */
  phantasm: string[]
  /** The Third Seal: survivors' cards of this kind don't move them this round. */
  sealedCard: PathKind | null
  /** Urban Evasion: this wall is out of play until the current survivor turn ends. */
  evadedWall: string | null
  /** Overwhelming Presence failed: the item being used is wasted. */
  itemBlocked: boolean
  /**
   * Redeemer: the card The Deathslinger discarded face down, until the survivor's guess.
   * Secret: the screens hide it from the survivors.
   */
  redeemer?: MoveCard | null
  rng: number
  log: LogEntry[]
  /** Online planning: cards set so far by survivor index (`planHand`), until every hand is in. */
  planDraft?: (MoveCard | null)[]
}
