// Offerings (p.19): cards a side burns before setup, each with one effect for the whole game.
// Before setup the table decides which side uses offerings: the survivors 1–2, the killer 1–2,
// or one each; a side may also take the top card of its shuffled offerings instead of choosing.
//
// The engine plays the offerings in `GameState.offerings`; `READY_OFFERINGS` are the ones it has
// rules for so far.

import { thaiName } from '../../data/thaiNames'
import type { Side } from './loadout'

export type OfferingId =
  | 'cut-coin'
  | 'ebony-memento-mori'
  | 'murky-reagent'
  | 'shrike-wreath'
  | 'torn-blueprint'
  | 'chalk-pouch'
  | 'shroud-of-union'
  | 'sweet-william-sachet'
  | 'vigos-blueprint'
  | 'white-ward'

export const OFFERING_SIDE: Record<OfferingId, Side> = {
  'cut-coin': 'killer',
  'ebony-memento-mori': 'killer',
  'murky-reagent': 'killer',
  'shrike-wreath': 'killer',
  'torn-blueprint': 'killer',
  'chalk-pouch': 'survivor',
  'shroud-of-union': 'survivor',
  'sweet-william-sachet': 'survivor',
  'vigos-blueprint': 'survivor',
  'white-ward': 'survivor',
}

const EN: Record<OfferingId, string> = {
  'cut-coin': 'Cut Coin',
  'ebony-memento-mori': 'Ebony Memento Mori',
  'murky-reagent': 'Murky Reagent',
  'shrike-wreath': 'Shrike Wreath',
  'torn-blueprint': 'Torn Blueprint',
  'chalk-pouch': 'Chalk Pouch',
  'shroud-of-union': 'Shroud of Union',
  'sweet-william-sachet': 'Sweet William Sachet',
  'vigos-blueprint': "Vigo's Blueprint",
  'white-ward': 'White Ward',
}

/** An offering's Thai name (the Thai cards'), for the log and the screens. */
export function offeringName(id: OfferingId): string {
  return thaiName(EN[id].toUpperCase()) ?? EN[id]
}

/** The offerings the engine plays: all ten in the box. */
export const READY_OFFERINGS = Object.keys(OFFERING_SIDE) as OfferingId[]

/** A side's offerings that can be played. */
export function offeringsOf(side: Side): OfferingId[] {
  return READY_OFFERINGS.filter((o) => OFFERING_SIDE[o] === side)
}

/** Which side burns offerings (p.19): nobody, the survivors, the killer, or one each. */
export type OfferingPlan = 'none' | 'survivors' | 'killer' | 'both'

/** How many offerings each side burns: `count` (1–2) for a side alone, one each for both. */
export function offeringSlots(plan: OfferingPlan, count: number): Record<Side, number> {
  const n = Math.min(2, Math.max(1, count))
  if (plan === 'survivors') return { survivor: n, killer: 0 }
  if (plan === 'killer') return { survivor: 0, killer: n }
  if (plan === 'both') return { survivor: 1, killer: 1 }
  return { survivor: 0, killer: 0 }
}

/** What is wrong with a side's pick ('' when it is playable): the right count, its own side's, no card twice. */
export function offeringProblem(side: Side, picks: OfferingId[], slots: number): string {
  if (picks.length !== slots) return `เลือก Offering ${slots} ใบ`
  if (picks.some((o) => !offeringsOf(side).includes(o))) return 'Offering นี้ใช้ไม่ได้'
  if (new Set(picks).size !== picks.length) return 'เลือก Offering ซ้ำไม่ได้'
  return ''
}

/** "a,b" as stored in a room. */
export function packOfferings(list: OfferingId[]): string {
  return list.join(',')
}

export function unpackOfferings(s: string | undefined): OfferingId[] {
  return (s ?? '').split(',').filter((x): x is OfferingId => x in OFFERING_SIDE)
}
