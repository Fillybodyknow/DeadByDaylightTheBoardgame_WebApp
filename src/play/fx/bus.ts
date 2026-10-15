// Screen-level effects queued by the game screen: the dice roll, banners and flashes.

import { reactive } from 'vue'
import type { PerkId } from '../engine/perks'
import type { Die, PerkOwner } from '../engine/types'

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
/** A card to show big: a perk being used, or an item (`item` set, `perk` absent). */
export interface PerkShow {
  id: number
  perk?: PerkId
  item?: string
  owner: PerkOwner
  /** What it did, from the log line ("ผลัก Meg"…). */
  detail: string
}

export const fx = reactive({
  perks: [] as PerkShow[],
  dice: [] as DiceShow[],
  banners: [] as Banner[],
  flash: null as { id: number; tone: 'red' | 'gold' | 'white' } | null,
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

export function showPerk(p: Omit<PerkShow, 'id'>) {
  fx.perks.push({ ...p, id: ++id })
}

export function flash(tone: 'red' | 'gold' | 'white') {
  fx.flash = { id: ++id, tone }
}

export function clearFx() {
  fx.perks.splice(0)
  fx.dice.splice(0)
  fx.banners.splice(0)
  fx.flash = null
  fx.boardBusy = false
}
