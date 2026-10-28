import type { PerkId } from './perks'

// Game state for the full playable version. Everything here is plain data (no classes,
// no functions) so a state can be cloned, saved to localStorage and replayed.

export type PathKind = 'sneak' | 'sprint' | 'crouch' | 'vault'
/** The Dredge's direct movement cards: one per face of the skill check die, so per start room. */
export type DirectCard = 'skull' | 'one' | 'two' | 'three' | 'four' | 'five'
export type MoveCard = PathKind | 'wait' | DirectCard

export type PropCategory = 'objective' | 'survival' | 'altruism' | 'boldness'
/** `drone`: The Skull Merchant's Drone, an objective prop of his (one per room). */
export type PropKind = 'generator' | 'exitGate' | 'chest' | 'locker' | 'crow' | 'pallet' | 'hook' | 'totem' | 'drone' | 'emp'

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
  /**
   * The path icon this pair of rooms is joined by, when one icon has lines to three rooms (a
   * fork): one PathDef per pair of rooms, all with the same `token` (the id of the first one).
   * Walls, pallets and bear traps sit on the icon, so they are shared.
   */
  token?: string
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
  /** The Artist's Dire Crow: a crow in every way, and survivors in its room plan face up first. */
  dire?: boolean
  /** A crow on The Artist's board (removed from play by him, or a Dire Crow not placed yet). */
  artist?: boolean
  /** A Drone on The Skull Merchant's board (returned to him, or taken back by his power). */
  merchant?: boolean
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
  /** Grim Embrace: ▲ on this board, each a sacrifice progress when they are hung. */
  embrace?: number
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
  /** The Trickster's Knives (0–3); missing in games saved before him. */
  knives?: number
  /** The Plague's Vile Purges: the perks they cover (one each, at most 2; a third clears them). */
  purged?: PerkId[]
  /**
   * The edit-perks mode: a perk card laid over a printed perk slot. `perks` holds the card, this
   * holds the printed perk under it; discarding the card from play puts that perk back (Guardian,
   * Inner Healing, Kinship, Situational Awareness).
   */
  covered?: Partial<Record<PerkId, PerkId>>
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
  /** The planned card played as this round's bonus turn (its index), once there is one. */
  bonusAt?: number | null
  /**
   * The Unknown: the room of each of its four minis (index = its number - 1), null while off the
   * board. One of them is "the killer" at a time, standing in `room` (its own entry here is stale):
   * `unknownAt`. On his turns it is the one whose card is played.
   */
  unknowns?: (string | null)[]
  unknownAt?: number
  /** Slipstream used this turn: when it ends, a bonus turn (no ▲) with a card of his choice. */
  slipstream?: boolean
  /** Unbound: copies of movement cards added to his hand for good. */
  extraCards?: MoveCard[]
  /** Bear traps not on the board (The Trapper has 4). */
  trapsInSupply: number
  /** Planned cards shown to the survivors early (Lightborn), by index. */
  shown: number[]
  perks: PerkId[]
  /**
   * The Twins: the room Victor stands in (null: not on the board). While a turn is taken with
   * Victor (`asVictor`), `room` and `victorRoom` are swapped, so "the Killer" is Victor.
   */
  victorRoom?: string | null
  asVictor?: boolean
}

export interface PathState {
  wall: boolean
  trap: boolean
}

/** `shadow`: Shadow Step put it there: nobody, the killer included, moves along that path. */
export type EntityPlace = { prop: string } | { path: string; shadow?: boolean } | null

export interface Die {
  kind: 'skill' | 'danger'
  /** skill: 0 = skull (failure) … 5 = great success. danger: image index 0–5 (0 and 2 are great). */
  face: number
  rerolled: boolean
  /** Iron Will: this failure counts as a success (the killer still gains ▲). */
  asSuccess?: boolean
  /** Jolt: this 1 or 2 counts as a failure (the face stays as rolled; the killer gains its ▲). */
  asFailure?: boolean
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
  /** No Mither (danger die): a success keeps `target` healthy, the killer gains 1 ▲. */
  | { k: 'noMither'; s: number; target: number }
  /** Dead Hard (danger die): a success sends `target` along a path instead of onto the hook. */
  | { k: 'deadHard'; s: number; target: number }
  /** The Knight's Assassin (danger die): walking into its room, a failure wounds. */
  | { k: 'assassin'; s: number }
  /** Inner Focus: two skill dice, one of them picked as a start room (not a skill check). */
  | { k: 'innerFocus'; s: number }
  /** Breakdown (danger die): a success takes a sacrifice progress from the killer. */
  | { k: 'breakdown'; s: number }
  /** Spine Chill (danger die): a success sends them along any path. */
  | { k: 'spineChill'; s: number }
  /** Deerstalker (danger die): leaving the killer's room wounded, a failure keeps them there. */
  | { k: 'deerstalker'; s: number }

export type SurvivorInteraction =
  | { k: 'rummage'; prop: string }
  | { k: 'hide'; prop: string }
  | { k: 'crow'; prop: string }
  /** A face-up Drone of The Skull Merchant's, sent back to his board. */
  | { k: 'drone'; prop: string }
  /** Collective Stealth (Renato) / Power of Two (Thalita): interacting with that survivor instead. */
  | { k: 'partner'; target: number; perk: 'collective_stealth' | 'power_of_two' }
  | { k: 'dropPallet'; prop: string; path: string }
  | { k: 'repair'; prop: string }
  | { k: 'openGate'; prop: string }
  | { k: 'sabotage'; prop: string }
  | { k: 'cleanse'; prop: string }
  | { k: 'heal'; target: number }
  /** Calm Spirit (Jake): move a crow in your space to any room. */
  | { k: 'calmSpirit'; prop: string; room: string }
  /** Survivors can interact with Victor (The Twins) to remove him. */
  | { k: 'removeVictor' }
  /** Power Struggle (Élodie): interact with the killer to reveal their first card. */
  | { k: 'powerStruggle' }
  /** Diversion (Adam): interact with the killer to send them along `path`. */
  | { k: 'diversion'; path: string }

export type KillerInteraction =
  | { k: 'search'; prop: string }
  | { k: 'scout'; prop: string }
  | { k: 'damage'; prop: string }
  | { k: 'venerate'; prop: string }
  | { k: 'attack'; target: number }
  /** `over`: from a connected room, the survivor brought in (Insidious on Yamaoka's Haunting). */
  | { k: 'pickUp'; target: number; over?: boolean }
  /** The Trapper's power: place a bear trap, optionally taking one back from `remove`. */
  | { k: 'power'; path: string; remove?: string }
  /** The Nurse: move to a connected room through anything, even against a vault. */
  | { k: 'blink'; path: string }
  /** The Huntress: a survivor in a connected room rolls the danger die. */
  | { k: 'hatchet'; target: number }
  /** The Dredge's Reign of Darkness: a survivor here or next door, moved by a card of their hand. */
  | { k: 'reign'; target: number }
  /** The Hillbilly: discard a card to move along a free path of its colour. */
  | { k: 'chainsaw'; card: MoveCard; path: string }
  /** The Doctor: shock every survivor in this room or a connected one. */
  | { k: 'spark'; room: string }
  /** The Hag: a Phantasm Trap in her room. */
  | { k: 'phantasm' }
  /** The Wraith: move to a room not connected to hers. */
  | { k: 'bell'; room: string }
  /** The Twins: place Victor in Charlotte's room. */
  | { k: 'victor' }
  /** The Blight: discard a random card from the hand and move along its path. */
  | { k: 'rush' }
  /** Hoarder (The Twins): remove a chest in your room, gain 2 ▲. */
  | { k: 'hoard'; prop: string }
  /** Undying (The Blight): discard `card` to make interaction `i` in a room connected by its path. */
  | { k: 'undying'; card: MoveCard; i: KillerInteraction }
  /**
   * The Spirit: discard `card` (not Wait) to make interaction `i` — an attack on a healthy survivor
   * or a prop — in `room`, joined to hers by a path of that card's colour.
   */
  | { k: 'haunt'; card: MoveCard; room: string; i: KillerInteraction }
  /** The Legion: every survivor in the room is wounded; ▲ if one was already. */
  | { k: 'frenzy' }
  /** The Trickster: a Knife for every survivor in his room and the connected ones. */
  | { k: 'showstopper' }
  /** The Plague: a Vile Purge in his room and in connected room `room`. */
  | { k: 'purge'; room: string }
  /** The Clown: his Afterpiece Tonic or Antidote into `room` (his or a connected one), moved if out. */
  | { k: 'afterpiece'; which: 'tonic' | 'antidote'; room: string }
  /** The Artist's Birds of Torment: a crow (or a Dire Crow) from his board into any room. */
  | { k: 'birds'; dire: boolean; room: string }
  /** The Skull Merchant's Eyes in the Sky: a face-up Drone anywhere back to his board, or one from it face up into his room. */
  | { k: 'droneTake'; prop: string }
  /** The Unknown's Hallucination: the lowest-numbered Unknown off the board into a connected room. */
  | { k: 'hallucinate'; room: string }
  /** The Singularity's Slipstream: every card back to his hand, then a bonus turn. */
  | { k: 'slipstream' }
  | { k: 'droneDrop' }
  /** Pain Resonance: an empty hook in his room, and a survivor next door is wounded. */
  | { k: 'painResonance'; target: number }
  /** The Knight: a Guard into his room or a connected one (moved if it is out already). */
  | { k: 'guard'; guard: Guard; room: string }
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
  /** `planned`: the card set in planning (not a bonus turn's), for Cut Loose. */
  | { k: 'cardMove'; s: number; card: PathKind; planned?: boolean }
  /** `target`: the survivor he attacked or picked up, when it was one (Unrelenting). */
  | { k: 'afterKillerInteract'; turn: number; target?: number }
  | { k: 'palletBlock'; path: string; to: string }
  | { k: 'genDone'; prop?: string }
  /** Progress is about to be added to a generator (Undone may take one off). */
  | { k: 'genProgress'; prop: string; add: number; s: number }
  | { k: 'afterCardMove'; s: number; from: string; to: string; path: string }
  | { k: 'cleanupStart' }
  /**
   * `from`: where he came from (Rancor brings a wounded survivor along). Empty for a teleport.
   * `broke`: the wall on the path he took broke as he passed (Bitter Murmur).
   */
  | { k: 'killerEntered'; room: string; from?: string; path?: string; carrying?: boolean; broke?: boolean }
  /** Survivor `s` revealed `prop` (Haunted Ground). */
  | { k: 'afterReveal'; s: number; prop: string }
  /** The killer has entered `room`, before his reveal there (Darkness Revealed). */
  | { k: 'killerArrived'; room: string }
  /** The killer revealed this prop (THWACK!). */
  | { k: 'killerRevealed'; prop: string }
  /** `rescued`: the survivor taken off the hook, when there was one (Deliverance). */
  | { k: 'afterSabotage'; s: number; rescued?: number }
  /** Start / end of any survivor's turn (Open-Handed, Urban Evasion, Up the Ante). */
  | { k: 'turnBegin'; s: number }
  | { k: 'turnEnd'; s: number }
  /** The end of a survivor's bonus turn (Background Player, Blood Rush, Situational Awareness, Renewal: a house rule). */
  | { k: 'bonusEnd'; s: number }
  /** The killer broke a pallet or a wall, or damaged generator `prop` (Alert, Overcharge, Oppression). */
  | { k: 'killerBreak'; what: 'pallet' | 'wall' | 'damage'; prop?: string }
  /** End of one of the killer's turns (Coup de Grâce). */
  | { k: 'killerTurnEnd'; turn: number }
  /** A survivor is about to discard the item they just used (Built to Last). */
  | { k: 'itemUsed'; s: number; item: string }
  /** A survivor discarded an item (Appraisal). */
  | { k: 'itemDiscard'; s: number; item: string }
  /** A survivor's first interaction is done (Desperate Measures). */
  | { k: 'afterSurvivorInteract'; s: number }
  /** A survivor entering `room` is about to reveal a prop there (Visionary). */
  | { k: 'beforeReveal'; s: number; room: string }
  /** A repair roll failed (Technician). */
  | { k: 'repairFail'; s: number; prop: string }
  /** A repair roll succeeded (Claustrophobia). */
  | { k: 'repaired'; s: number; prop: string }
  | { k: 'afterRummage'; s: number; prop: string }
  /** A survivor is about to use an item (Overwhelming Presence). */
  | { k: 'preItem'; s: number }
  /** Start of one of the killer's turns, before the card is revealed (Zanshin Tactics). */
  | { k: 'killerTurnBegin'; turn: number }
  /** The killer is about to attack or pick up `target` (Red Herring). */
  /** `turn`: the killer's turn it happens on (his planned card's index; Game Afoot looks for `bonusAt`). */
  | { k: 'preKillerInteract'; target: number; pickUp?: boolean; turn?: number | null }
  /** A survivor was hung on a hook — "sacrificed" (Blood Echo, Dead Man's Switch). */
  | { k: 'afterHang'; s: number }
  /** A survivor dropped a pallet or hid in a locker (Nemesis). */
  | { k: 'afterPalletLocker'; s: number; prop: string }
  /** A survivor entered a room (For the People). */
  | { k: 'entered'; s: number; path?: string }
  /** The killer is about to interact in `room` (not a power): Residual Manifest. */
  | { k: 'killerWouldInteract'; room: string }
  /** A roll had `fails` failures; the killer gains them unless Off the Record takes one. */
  | { k: 'rollFail'; s: number; fails: number }
  /** A survivor rolled a great success (Lucky Break); `ctx`: what the roll was for (Poised). */
  | { k: 'greatRoll'; s: number; ctx?: RollContext['k'] }
  /** The killer chose `n` dice for survivor `s` to struggle free (Boil Over). */
  | { k: 'carryRoll'; s: number; n: number }
  /** Survivor `s` is about to be hung (Dead Hard). */
  | { k: 'preHang'; s: number }
  /** Survivor `s` became healthy; `by` healed them (Aftercare, We'll Make It, Renewal). */
  | { k: 'healed'; s: number; by?: number }
  /** Survivor `s` cleansed a Hex Totem (Small Game). */
  /** `gained`: the ▲ the cleanse paid (Exponential takes them back). */
  | { k: 'cleansed'; s: number; gained?: number }
  /** The killer is about to move with a card from his room along `path` (We're Gonna Live Forever). */
  | { k: 'preLeave'; to: string }
  /** Buttons rather than questions: start of a survivor's turn, their interact step, a roll. */
  | { k: 'turnStart'; s: number }
  | { k: 'interact'; s: number }
  /** The killer's interact step, before interacting (Iron Maiden). */
  | { k: 'killerInteract' }
  /** Survivor `s` is about to move into the killer's room `to` with a card (Coulrophobia). */
  | { k: 'preEnter'; s: number; to: string; path: string }
  /** Survivor `s` rolled `dice` for a skill check, before it counts (Jolt). */
  | { k: 'rolled'; s: number; ctx: RollContext['k']; dice: Die[] }
  /** Survivor `s` is about to draw an item (Plunderer's Instinct). */
  | { k: 'preDraw'; s: number }
  /** Survivor `s` is about to move with a card out of the killer's room (Deerstalker, Thrill of the Hunt). */
  | { k: 'survivorLeave'; s: number; to: string; path: string }
  /** Survivor `s` is about to interact with generator / exit gate `prop` (No Way Out). */
  | { k: 'genInteract'; s: number; prop: string }
  | { k: 'roll' }

/** What a perk was used on; only the fields that perk needs are set. */
export interface PerkChoice {
  target?: number
  path?: string
  card?: MoveCard
  index?: number
  prop?: string
  /** Ace in the Hole: the prop to swap with. Oppression: the second generator. */
  prop2?: string
  /** Fogwise: the path the wall or pallet goes to. */
  path2?: string
  /** Dragon's Grip: the second card discarded. */
  card2?: MoveCard
  /** Appraisal: keep the item gained (`keepNew`) or the one already held (`keepOld`). */
  mode?: 'bp' | 'bonus' | 'take' | 'give' | 'keepNew' | 'keepOld'
  /** Face the Darkness: the Guard placed, and its room. */
  guard?: Guard
  room?: string
}

/** The Knight's three Guards. */
export type Guard = 'carnifex' | 'assassin' | 'jailer'

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
  /** Stridor: this survivor plays their card face up before anyone else plans. */
  | { t: 'planStridor'; s: number }
  | { t: 'planSurvivors' }
  | { t: 'planKiller' }
  | { t: 'survivorMove'; s: number; card: PathKind }
  /** Inner Focus: survivor `s` picks one of the two faces rolled, the start room to go to. */
  | { t: 'innerFocus'; s: number; faces: number[] }
  /** Empathy: survivor `s` is asked to take (`give`) or hand over (`take`) a ▲ of `from`'s. */
  | { t: 'empathyAsk'; s: number; from: number; mode: 'take' | 'give' }
  /**
   * `exclude`: Technician's second interaction can't target this prop again.
   * `survivalOnly`: Desperate Measures' second interaction targets a chest or a locker.
   */
  | { t: 'survivorInteract'; s: number; canInteract: boolean; exclude?: string; survivalOnly?: boolean }
  /** `why`: the perk that gave it (Power of Two); otherwise a crow's Sprint. */
  | { t: 'bonusOffer'; s: number; why?: 'power_of_two' }
  /** Move along any path (after a rescue, p.13). */
  /** `why`: The Clown's Afterpiece Antidote, or Dead Hard / Spine Chill (a move they must make); else a rescue (p.13). */
  | { t: 'anyMove'; s: number; why?: 'antidote' | 'deadHard' | 'spineChill' | 'collective' }
  /** The Clown's Afterpiece Antidote: the killer walked in, and may move on along any path. */
  /** `why`: Darkness Revealed's move (otherwise the Afterpiece Antidote's). */
  | { t: 'killerAnyMove'; why?: 'darkness' }
  | { t: 'keepItem'; s: number; drawn: string }
  /** Plunderer's Instinct: several items drawn, one to keep. */
  | { t: 'pickItem'; s: number; drawn: string[] }
  /** Self-Aware: the perk cards drawn, one to take its place. */
  | { t: 'selfAware'; s: number; cards: PerkId[] }
  /** Machine Learning: two killer perk cards drawn, one kept (answered with a selfAware action). */
  | { t: 'machineLearning'; cards: PerkId[] }
  /**
   * `keep`: Bond rolled two dice and one must be kept. `passed`: survivors who said they
   * won't use their key on this roll (online, each key holder decides on their own device).
   */
  | { t: 'roll'; ctx: RollContext; dice: Die[]; keep?: boolean; passed?: number[] }
  /** `rush`: The Blight's power drew this card. */
  | { t: 'killerMove'; turn: number; card: PathKind; rush?: boolean }
  /**
   * `powerOnly`: Territorial Imperative's extra power use. `rush`: The Blight entered a room with
   * his power: interact there, or use it again.
   */
  /** `only`: an interaction with that survivor alone (Reign of Darkness brought them in). */
  | { t: 'killerInteract'; turn: number; canInteract: boolean; powerOnly?: boolean; rush?: boolean; only?: number }
  /** The Twins: take this turn with Charlotte or with Victor. */
  | { t: 'twinChoice'; turn: number }
  /** `free`: Slipstream's bonus turn — no ▲, and taken. */
  | { t: 'killerBonusOffer'; free?: boolean }
  | { t: 'carryDice'; s: number }
  | { t: 'carryMove'; s: number; steps: number }
  /** A survivor may discard an item to stop what the killer is doing. */
  /** `carry`: the killer is carrying survivor `s` with `steps` left (a Firecracker costs him the step). */
  /**
   * `antidote`: the move it would stop is the Afterpiece Antidote's (The Clown). `then`: the move
   * comes from a perk (Starstruck, Diversion) — with nobody reacting these tasks make it, instead
   * of `pending` being replayed.
   */
  /** `overwhelmed`: the survivor using theirs has had Overwhelming Presence's roll, and passed. */
  | { t: 'reaction'; item: 'flashlight' | 'firecracker' | 'emp'; holders: number[]; pending: Action; carry?: { s: number; steps: number }; antidote?: boolean; why?: 'darkness'; then?: Task[]; overwhelmed?: boolean }
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
  /**
   * Carter's Spark: this survivor pays 1 ▲ or takes the shock; `rest` are next.
   * `grip`: Dragon's Grip instead — pay 1 ▲ or be wounded.
   * `whispers`: Whispers instead — pay 1 ▲ or set their movement card face up.
   */
  | { t: 'sparkChoice'; s: number; rest: number[]; grip?: boolean; whispers?: boolean }
  /** A survivor walked into a Phantasm Trap: The Hag takes ▲ or teleports for `face` ▲. */
  | { t: 'phantasmChoice'; s: number; room: string; face: number }
  /** Predator: this survivor sets a new movement card. */
  | { t: 'replaceCard'; s: number }
  /** The Hillbilly's chainsaw entered a room with several healthy survivors. */
  | { t: 'pickSurvivor'; why: 'chainsaw'; options: number[] }
  /** The Deathslinger's Redeemer: survivor `s` guesses the card he discarded face down. */
  | { t: 'redeemerGuess'; s: number }
  /** Crowd Control: the survivors may pay 2 ▲ between them, or the killer sets `s`'s card. */
  /**
   * `pledge` (online): what each survivor's player puts in from their own ▲ — null while they
   * haven't said. Someone then confirms: paying at 2 ▲, refusing once everyone has said and it
   * isn't 2.
   */
  | { t: 'crowdPay'; s: number; pledge?: (number | null)[] }
  /** Weaving Spiders: the survivors in her room put in their ▲ (6 between them), then she confirms. */
  | { t: 'weavePay'; s: number; prop: string; pledge?: (number | null)[] }
  | { t: 'crowdPick'; s: number }
  /** Reign of Darkness: the killer picks a card of survivor `s`'s hand, then (if several) its path. */
  | { t: 'reignCard'; s: number }
  | { t: 'reignPath'; s: number; card: PathKind }
  /** The Plague's passive: survivor `s` covers one of their perks with a Vile Purge (`cover`), or
   * takes one off in a locker (`uncover`). */
  | { t: 'purgeChoice'; s: number; mode: 'cover' | 'uncover' }
  /** The Knight's Carnifex, at the start of cleanup: the prop it removes, then the room it goes to. */
  | { t: 'carnifexProp' }
  | { t: 'carnifexMove' }
  | { t: 'gameOver'; winner: 'survivors' | 'killer' }

/** Queued work that runs once the current step has its input. */
export type Task =
  | { k: 'survivorTurn'; s: number }
  | { k: 'survivorInteract'; s: number }
  | { k: 'endSurvivorTurn'; s: number }
  | { k: 'anyMove'; s: number; why?: 'antidote' | 'deadHard' | 'spineChill' | 'collective' }
  /** The killer entered the room with the Afterpiece Antidote. */
  | { k: 'killerAntidote' }
  /** A survivor's card move, after Coulrophobia had its chance to stop it. */
  | { k: 'survivorGo'; s: number; path: string; to: string }
  /** The killer moved by a perk (Starstruck, Diversion), once no Firecracker stopped him. */
  | { k: 'killerGo'; path: string; to: string }
  /** A hanging, after Dead Hard had its chance. */
  | { k: 'hangDo'; s: number; hook: string }
  /** The killer's card move, after We're Gonna Live Forever had its chance. */
  /**
   * A move of the killer out of his room, held while We're Gonna Live Forever is asked: `go` makes
   * it, `stop` is what follows when the perk keeps him there.
   */
  | { k: 'leave'; go: Task; stop?: Task[] }
  /** An action answered again once a question before it is settled (its step put back). */
  | { k: 'replay'; step: Step; action: Action }
  /** The killer moved by a perk (Starstruck, Diversion, Beast of Prey, Agitation). */
  | { k: 'killerMoved'; path: string; to: string }
  /** The Dredge's direct card: straight to a start room (We're Gonna Live Forever, a Firecracker may stop it). */
  | { k: 'killerDirect'; to: string; asked?: boolean }
  | { k: 'killerArrive'; to: string }
  /** The killer's interaction, once Residual Manifest has had its chance at it. */
  /** `over`: Yamaoka's Haunting's interaction in another room (no turn of its own, no Flashlight). */
  | { k: 'killerAct'; i: KillerInteraction; turn: number; over?: boolean }
  /** Darkness Revealed: the move along any path, once the room has answered his entering. */
  | { k: 'darkMove' }
  /** Reign of Darkness: the survivor moved into his room may be interacted with. */
  | { k: 'reignHit'; s: number }
  /**
   * `extra`: a turn from Devour Hope at the start of cleanup (cleanup is already queued).
   * `begun`: the start-of-turn perks were asked. `chosen`: The Twins picked who takes it.
   */
  | { k: 'killerTurn'; turn: number; extra?: boolean; begun?: boolean; chosen?: boolean }
  /** The killer's interaction, after Red Herring had its chance to redirect it. */
  | { k: 'killerDo'; i: KillerInteraction; turn: number | null }
  /** A roll's result, after Off the Record had its chance at the killer's ▲. */
  | { k: 'resolveRoll'; ctx: RollContext; dice: Die[]; fails: number }
  /** A roll held for Jolt: counted once the killer has answered (he may turn some dice into failures). */
  | { k: 'settleRoll'; ctx: RollContext; dice: Die[]; failBp?: number }
  /** An item drawn once Plunderer's Instinct has been answered; `from`: a chest or an item's draw. */
  | { k: 'drawItem'; s: number; from: 'chest' | 'draw' }
  /** A survivor's move out of the killer's room, held for Deerstalker and Thrill of the Hunt. */
  | { k: 'survivorStep'; s: number; path: string; to: string }
  /** Thrill of the Hunt: the killer follows survivor `s` along `path`, if they left. */
  | { k: 'killerFollow'; s: number; path: string; to: string }
  /** Progress added to a generator, held while Undone was asked. */
  | { k: 'addGen'; prop: string; add: number; s: number }
  | { k: 'killerInteract'; turn: number }
  /** `ended`: the end-of-turn perks were asked. */
  | { k: 'endKillerTurn'; turn: number; extra?: boolean; ended?: boolean }
  /** The Blight's power moved (or tried to): interact or go again if he entered a new room. */
  | { k: 'rushArrive'; turn: number; from: string }
  | { k: 'cleanup' }
  | { k: 'reveal'; room: string; who: number | 'killer' }
  /** Carrying: after entering a room (and revealing), hang, keep going or drop the survivor. */
  | { k: 'carryArrive'; s: number; steps: number }
  /** Ask each owner of a perk for this window, one at a time (`done`: already asked). */
  | { k: 'trigger'; w: PerkWindow; done: string[] }
  | { k: 'plan' }
  | { k: 'turnStart'; s: number }
  /** A survivor is about to move with a card (Huntress Lullaby may stop it). */
  /** `planned`: the card set in planning (not a bonus turn's), for Cut Loose. */
  | { k: 'cardMove'; s: number; card: PathKind; planned?: boolean }
  | { k: 'doMove'; s: number; card: PathKind }
  | { k: 'roll'; ctx: RollContext; n: number; kind: Die['kind'] }
  /** Go back to a step after work queued during it (an item used mid-step). */
  | { k: 'resume'; step: Step }
  | { k: 'chainsawHit'; room: string }
  /** An item use that waited for Overwhelming Presence. */
  | { k: 'itemUse'; s: number; use: ItemUse }
  /** A Flashlight or Firecracker used against the killer, after Overwhelming Presence was asked. */
  | { k: 'reactItem'; s: number; step: Extract<Step, { t: 'reaction' }> }
  /** The Hag teleported: interact once the room is revealed. */
  | { k: 'phantasmHit'; i: KillerInteraction | null }
  /** The teleport to a Phantasm Trap, once a Firecracker has not stopped it: pays, goes, interacts. */
  | { k: 'phantasmGo'; room: string; face: number; i: KillerInteraction | null }
  /** Poised: survivor `s` takes a bonus turn, then the turn goes back to `back`. */
  | { k: 'poisedTurn'; s: number }
  | { k: 'activeBack'; s: number | null }
  /** A survivor's interaction, after No Way Out had its chance to stop it. */
  | { k: 'survivorDo'; s: number; i: SurvivorInteraction }
  /** A survivor entered `room` with a Vile Purge in it (after its reveal). */
  | { k: 'purgeTake'; s: number; room: string }
  /** The Knight's Carnifex at the start of cleanup: its prop, then its move. */
  | { k: 'carnifex' }
  | { k: 'carnifexMove' }

export type Action =
  | { t: 'setupReveal'; prop: string }
  /** Stridor: the chosen survivor's card, played face up before the others plan. */
  | { t: 'planStridor'; card: MoveCard }
  | { t: 'reveal'; prop: string }
  /** One card per survivor, null for a hooked survivor (p.15). */
  | { t: 'planSurvivors'; cards: (MoveCard | null)[] }
  /**
   * Online play: one player sets the cards for the survivors of their own hand (one entry per
   * survivor, by index; only that hand's entries are read). Planning ends once every hand is in.
   */
  | { t: 'planHand'; hand: number; cards: (MoveCard | null)[] }
  | { t: 'planKiller'; cards: MoveCard[] }
  /** Online planning: take a hand's (or the killer's) confirmed cards back, while others still plan. */
  | { t: 'unplanHand'; hand: number }
  | { t: 'unplanKiller' }
  /** `left`: We're Gonna Live Forever was asked already (a replayed move). */
  | { t: 'move'; path: string; reacted?: boolean; left?: boolean }
  | { t: 'innerFocus'; face: number }
  | { t: 'empathyAnswer'; yes: boolean }
  | { t: 'stop' }
  /** Hang the carried survivor on the free hook in this room. */
  | { t: 'hang' }
  /** `emp`: the survivor he'd interact with has had their chance to discard an EMP. */
  | { t: 'interact'; i: SurvivorInteraction | KillerInteraction; reacted?: boolean; left?: boolean; emp?: boolean }
  | { t: 'endTurn' }
  | { t: 'bonus'; card: MoveCard }
  | { t: 'declineBonus' }
  /** Crowd Control: who pays (each entry 1 ▲, a survivor twice for 2); empty to refuse. */
  | { t: 'crowdPay'; pay: number[] }
  /** Crowd Control online: survivor `s` puts in `n` of their own ▲ (0: nothing). */
  | { t: 'crowdPledge'; s: number; n: number }
  | { t: 'weavePledge'; s: number; n: number }
  /** Weaving Spiders: pay what was put in (6 ▲), or [] to call it off. */
  | { t: 'weavePay'; pay: number[] }
  | { t: 'crowdPick'; card: MoveCard }
  | { t: 'reignCard'; card: MoveCard }
  /** The perk a Vile Purge covers or comes off. */
  | { t: 'purgeChoice'; perk: PerkId }
  /** The Carnifex's prop / room. */
  | { t: 'guardProp'; prop: string }
  | { t: 'guardRoom'; room: string }
  | { t: 'keepItem'; keep: 'new' | 'old' }
  | { t: 'pickItem'; item: number }
  | { t: 'selfAware'; perk: PerkId }
  | { t: 'carryDice'; n: number }
  | { t: 'reroll'; s: number; die: number }
  /** Survivor `s` won't use their key on this roll. */
  | { t: 'passRoll'; s: number }
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
  | { t: 'phantasm'; teleport: boolean; i?: KillerInteraction; left?: boolean }
  | { t: 'replace'; card: MoveCard }
  /** Redeemer: the survivor's guess at The Deathslinger's discarded card. */
  | { t: 'guess'; card: MoveCard }
  /** The Twins: take this turn with Victor (true) or Charlotte (false). */
  | { t: 'twin'; victor: boolean }
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
  /** `path` is empty for a teleport (Wailing Bell, a Phantasm Trap). `victor`: The Twins' Victor. */
  | { k: 'move'; who: number | 'killer' | 'victor'; from: string; to: string; path: string }
  | { k: 'phantasmSet'; room: string }
  /** Blighted Corruption: `card` drawn at random from `hand` (his hand before it); `stuck`: it goes nowhere. */
  | { k: 'rushDraw'; card: MoveCard; hand: MoveCard[]; stuck?: boolean }
  | { k: 'madness'; s: number; on: boolean }
  | { k: 'reveal'; prop: string; kind: PropKind; room: string }
  /** `prop` / `target`: the generator, gate, totem or locker, or the survivor healed (for the screen). */
  | { k: 'roll'; s: number; ctx: RollContext['k']; prop?: string; target?: number }
  /** `perk`: a perk wounded them (Blood Echo), or they wounded themselves (Yui, Zarina). */
  | { k: 'wound'; s: number; by: 'attack' | 'trap' | 'power' | 'perk' }
  /** The Trickster's Knife: `n` is how many they hold now (4: a sacrifice progress instead). */
  | { k: 'knife'; s: number; n: number }
  /** The Plague's Vile Purge: `n` is how many they hold now (3: cleared, and wounded). */
  | { k: 'purge'; s: number; n: number }
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
  /** Survivor `s` got an item (a chest, a Map's draw, the one kept of two): secret online. */
  | { k: 'itemGot'; s: number }
  | { k: 'bp'; who: number | 'killer'; n: number }
  | { k: 'gameOver'; winner: 'survivors' | 'killer' }
  /** A prop handled, for the sound: a survivor or the killer (`who`) at a locker, crow, hook or totem. */
  | { k: 'touch'; who: number | 'killer'; what: 'lockerIn' | 'lockerOut' | 'lockerSearch' | 'crow' | 'crowDestroy' | 'sabotage' | 'totem' }

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
  /** Survivors who healed or were healed this round, either way round (Renewal). */
  healedWith?: number[]
  /** Who interacted with each generator this round (Friendly Competition). */
  genBy?: Record<string, number[]>
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
  /** Setup: the minis' start rooms are rolled once every survivor has revealed a prop (p.6). */
  startPending?: boolean
  /** Survivors wounded or hung during the turn being played (Fast Track, Self-Preservation). */
  turnHurt?: number[]
  /** Rooms with one of The Hag's Phantasm Traps (7 tokens, one per room). */
  phantasm: string[]
  /** The Clown's Afterpiece Tonic and Antidote: the rooms they stand in (one of each). */
  afterpiece?: { tonic?: string; antidote?: string }
  /** The Knight's Guards: the rooms they stand in. `jailerGone`: no longer used (the Jailer comes back, a house rule). */
  guards?: { carnifex?: string; assassin?: string; jailer?: string }
  jailerGone?: boolean
  /** The survivor whose skill check the Jailer turned into a danger-die roll (until it resolves). */
  jailerRoll?: number | null
  /** The survivor whose turn began in a locker (Dance With Me). */
  lockerTurn?: number | null
  /** Rooms with one of The Plague's Vile Purges (10 tokens, one per room, the rest on survivors). */
  purge?: string[]
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
  /** Power Struggle: the killer can't interact after moving with their first card this round. */
  struggle?: boolean
  /** Deception: the active survivor stays put this turn and can't interact. */
  deception?: boolean
  /** Guardian: this survivor is the killer's only interaction for the turn he walked in on them. */
  guardian?: number | null
  /** Leverage: this survivor can't become healthy this round. */
  leverage?: number | null
  /** Empathy this round: who said no to whom (`from:to`), so they aren't asked again. */
  empathyNo?: string[]
  /** Dissolution: the path (its icon) with the ▲ on it, until the end of cleanup. */
  dissolution?: string | null
  /** Whether the killer has changed room during the turn being played (Insidious). */
  killerMoved?: boolean
  /** Fearmonger: this survivor can't use perks this round. */
  fearmonger?: number | null
  /** Genetic Limits: this survivor can't use perks for the rest of the round. */
  geneticLimits?: number | null
  /** Plunderer's Instinct: this survivor's next draw is three items, one kept. */
  plunder?: number | null
  /** Built to Last: this survivor's kept item can't be used again this turn. */
  itemLock?: number | null
  /** Built to Last this round: who kept which item (its offer on a later turn says why it is back). */
  kept?: { s: number; item: string }[]
  /** The Blight's power: the card it drew, while that move is being made. */
  rushCard?: PathKind | null
  rng: number
  log: LogEntry[]
  /** Online planning: cards set so far by survivor index (`planHand`), until every hand is in. */
  planDraft?: (MoveCard | null)[]
  /**
   * Online planning: the killer's two cards, set while the survivors are still planning. They are
   * played as soon as the last survivor hand is in (offline the killer plans after them instead).
   */
  killerDraft?: MoveCard[]
}
