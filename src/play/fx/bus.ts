// Screen-level effects queued by the game screen: the dice roll, banners and flashes.

import { reactive } from 'vue'
import type { OfferingId } from '../engine/offerings'
import type { PerkId } from '../engine/perks'
import type { Die, MoveCard, PerkOwner } from '../engine/types'

export interface DiceShow {
  id: number
  dice: Die[]
  /** "Dwight · ซ่อม Generator" */
  title: string
  /** "+2 ความคืบหน้า!" */
  outcome: string
  tone: 'good' | 'great' | 'bad'
  /** Where each die's skill-check needle lands. */
  verdicts?: SkillVerdict[]
  /** Only a great counts (danger dice, struggling free): no good zone. */
  greatOnly?: boolean
  /** "ซ่อม Generator": the action, under the skill check. */
  action?: string
  /** What the roll is on (a prop, a trap, a survivor or the killer), in the middle of the ring. */
  icon?: { src: string; round: boolean }
  /** Progress of the generator or gate, before and after this roll. */
  progress?: { before: number; after: number; max: number }
  /**
   * Dice already shown as they are (a key re-rolled another one, or the die Bond kept): their
   * needles stand where they stopped instead of sweeping again.
   */
  still?: boolean[]
}

/** One mini's start-room roll (setup step 11), read back from the room the engine put it in. */
export interface StartMini {
  /** The board's mini key: "s0".."s3" or "k". */
  key: string
  name: string
  image: string
  killer?: boolean
  player: string
  room: string
  face: number
  /** Shroud of Union: the survivors picked this room, nothing was rolled. */
  chosen?: boolean
}

export type SkillVerdict = 'great' | 'good' | 'fail'

export interface Banner {
  id: number
  title: string
  sub?: string
  tone: 'survivor' | 'killer' | 'game'
  /** Mini image shown beside the title. */
  image?: string
  /** When it was queued: a banner that waited too long is old news and is skipped. */
  at: number
}

/** A perk just used: its card is shown big in the middle of the screen. */
/** A card to show big: a perk being used, an item (`item` set), or an offering at work (`offering` set). */
export interface PerkShow {
  id: number
  perk?: PerkId
  item?: string
  offering?: OfferingId
  owner: PerkOwner
  /** What it did, from the log line ("ผลัก Meg"…). */
  detail: string
  /** Not a card at all: a player's action (ActionReveal shows these, in the same queue). */
  action?: ActionShow
  /** Not a card at all: the killer's Sacrifice Progress going up (SacrificeReveal shows these). */
  sacrifice?: { total: number; gained: number }
  /** Not a card at all: Blighted Corruption's random draw from his hand (RushReveal shows these). */
  rush?: { card: MoveCard; hand: MoveCard[]; stuck?: boolean }
}

/** A player's action, shown briefly before the board plays it out (built in casts.ts). */
export interface ActionShow {
  id: number
  owner: PerkOwner
  /** The Twins: done by Victor on a turn taken with him (his mini, not Charlotte's). */
  victor?: boolean
  /** move: a movement card; power: the killer's power; passive: a killer passive. */
  kind: 'move' | 'action' | 'power' | 'passive'
  /** "Meg ทิ้ง Pallet บนเส้นทาง" */
  title: string
  /** The rest of the log line, or where a move went. */
  sub: string
  /** A movement card, a prop or token, or the power card (cropped to its icon). */
  image?: string
  /** The survivor on the receiving end (attacked, picked up, hooked, rescued). */
  target?: number
  /** Everyone hit at once (a power that wounds a whole room): their portraits, in a row. */
  targets?: number[]
}

export const fx = reactive({
  perks: [] as PerkShow[],
  dice: [] as DiceShow[],
  banners: [] as Banner[],
  flash: null as { id: number; tone: 'red' | 'gold' | 'white' } | null,
  /** The minis' start-room rolls, on the map: `shown` of them are placed so far. */
  starts: null as { id: number; minis: StartMini[]; shown: number; face: number; landed: boolean } | null,
  /** The offerings burnt for the game (p.19), shown in a row and burnt at its start, before the minis come in. */
  offerings: null as { id: number; list: OfferingId[] } | null,
  /** The game just ended: its last beat (FinaleReveal) shows after everything queued before it. */
  finale: null as { id: number; winner: 'survivors' | 'killer' } | null,
  /** The board is animating what just happened (walks, hits, hooks): questions wait for it. */
  boardBusy: false,
})

let boardTimer: number | undefined

/** The board's animations need `ms` more: keep `boardBusy` up until then. */
export function holdBoard(ms: number) {
  if (ms <= 0) return
  fx.boardBusy = true
  clearTimeout(boardTimer)
  boardTimer = window.setTimeout(() => (fx.boardBusy = false), ms)
}

let id = 0

export function showDice(d: Omit<DiceShow, 'id'>) {
  fx.dice.push({ ...d, id: ++id })
}

export function showBanner(b: Omit<Banner, 'id' | 'at'>, opts: { replace?: boolean } = {}) {
  // A new turn makes older turn banners wrong: `replace` drops them, even the one showing.
  if (opts.replace) fx.banners.splice(0)
  // Keep the queue short: a burst of turn changes should not lag behind play.
  if (fx.banners.length >= 3) fx.banners.splice(1, 1)
  fx.banners.push({ ...b, id: ++id, at: Date.now() })
}

export function showAction(a: Omit<ActionShow, 'id'>) {
  const n = ++id
  fx.perks.push({ id: n, owner: a.owner, detail: '', action: { ...a, id: n } })
}

export function showSacrifice(total: number, gained: number) {
  fx.perks.push({ id: ++id, owner: 'killer', detail: '', sacrifice: { total, gained } })
}

export function showRush(rush: NonNullable<PerkShow['rush']>) {
  fx.perks.push({ id: ++id, owner: 'killer', detail: '', rush })
}

export function showPerk(p: Omit<PerkShow, 'id'>) {
  fx.perks.push({ ...p, id: ++id })
}

export function showStarts(minis: StartMini[]) {
  fx.starts = { id: ++id, minis, shown: 0, face: 0, landed: false }
}

export function showOfferings(list: OfferingId[]) {
  fx.offerings = { id: ++id, list: [...list] }
}

export function showFinale(winner: 'survivors' | 'killer') {
  fx.finale = { id: ++id, winner }
}

export function flash(tone: 'red' | 'gold' | 'white') {
  fx.flash = { id: ++id, tone }
}

export function clearFx() {
  fx.perks.splice(0)
  fx.dice.splice(0)
  fx.banners.splice(0)
  fx.flash = null
  fx.finale = null
  fx.starts = null
  fx.offerings = null
  fx.boardBusy = false
}
