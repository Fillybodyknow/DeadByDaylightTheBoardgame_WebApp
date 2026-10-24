// The words around a perk card (PerkCard), the same in every panel: the line over usable cards,
// and what a pressed card asks for next.

import type { PerkChoice } from './engine/types'

/** Over usable perk cards. */
export const PERK_LEAD = '⚡ Perk ที่ใช้ได้ตอนนี้ — กดการ์ดเพื่อใช้'

const BACK = ' — กดการ์ดอีกครั้งเพื่อยกเลิก'

/** On a card that can be used now. */
export const READY_HINT = '👆 กดการ์ดเพื่อใช้'
/** On a card pressed, when nothing more is said about where its choices are. */
export const PICKED_HINT = `🎯 เลือกเป้าหมายบนแผนที่${BACK}`

/**
 * A pressed card's hint: where its choices are now — a card from the hand, a target on the map,
 * or buttons under it. `onBoard` says whether a choice is clicked on the map. `how` replaces the
 * where for perks picked in two clicks (a swap, someone then a path).
 */
export function pickedHint(choices: PerkChoice[], onBoard: (c: PerkChoice) => boolean, how?: string): string {
  if (how) return `🎯 ${how}${BACK}`
  if (choices.some((c) => c.card)) return `👇 เลือกการ์ดจากมือด้านล่าง${BACK}`
  if (choices.some(onBoard)) return `🎯 เลือกเป้าหมายบนแผนที่${BACK}`
  return `👇 เลือกด้านล่าง${BACK}`
}
