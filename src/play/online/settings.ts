// Room settings: what the host sets in the lobby before seating everyone. Stored in the room
// (lobby node) as a partial object; anything missing takes its default, so rooms made before
// a setting existed play as they always did.

import { killers, survivors } from '../../data'
import { PLAYABLE_KILLERS, PRINTED_PERKS } from '../engine/perks'
import { KILLER_BP, SURVIVOR_BP } from '../engine/engine'

export interface RoomSettings {
  /** Seconds a player has for a decision; 0 for no limit. */
  timer: number
  /**
   * Who picks the board: the killer (`secret`: without the survivors seeing it until the game
   * starts), the host, or nobody (drawn when the picks open).
   */
  map: 'killer' | 'secret' | 'host' | 'random'
  /** Survivors see which killer is picked (by default only the killer's own screen shows it). */
  showKiller: boolean
  /** Survivors may pick a survivor a teammate already took. */
  dupes: boolean
  /** Characters are drawn for everyone when the picks open; players only confirm. */
  random: boolean
  /** Characters nobody may play. */
  bans: string[]
  /** Starting ▲, to balance a table with new players (the rulebook's are 2 and 4, p.6). */
  survivorBp: number
  killerBp: number
}

export const DEFAULT_SETTINGS: RoomSettings = {
  timer: 0,
  map: 'killer',
  showKiller: false,
  dupes: false,
  random: false,
  bans: [],
  survivorBp: SURVIVOR_BP.start,
  killerBp: KILLER_BP.start,
}

export const TIMER_CHOICES = [0, 60, 90, 120]
export const SURVIVOR_BP_RANGE = [0, 4] as const
export const KILLER_BP_RANGE = [2, 6] as const

/** The room's settings with every default filled in (the database drops empty lists). */
export function settingsOf(stored: Partial<RoomSettings> | undefined): RoomSettings {
  return { ...DEFAULT_SETTINGS, ...stored, bans: stored?.bans ?? [] }
}

/** Characters the full game can play, by side. */
export const playableSurvivors = () => survivors.filter((c) => (PRINTED_PERKS[c.id]?.length ?? 0) > 0)
export const playableKillers = () => killers.filter((c) => PLAYABLE_KILLERS.includes(c.id))

/** What differs from the defaults, as short chips for the lobby ("⏱ 90 วิ"). */
export function settingsChips(s: RoomSettings): string[] {
  const out: string[] = []
  if (s.timer) out.push(`⏱ ${s.timer} วิ/ตา`)
  if (s.map === 'secret') out.push('🗺 แผนที่ลับ')
  if (s.map === 'host') out.push('🗺 หัวห้องเลือกแผนที่')
  if (s.map === 'random') out.push('🗺 สุ่มแผนที่')
  if (s.random) out.push('🎲 สุ่มตัวละคร')
  if (s.showKiller) out.push('👁 เห็นฆาตกรที่เลือก')
  if (s.dupes) out.push('👯 Survivor ซ้ำได้')
  if (s.bans.length) out.push(`🚫 แบน ${s.bans.length} ตัว`)
  if (s.survivorBp !== DEFAULT_SETTINGS.survivorBp || s.killerBp !== DEFAULT_SETTINGS.killerBp) out.push(`▲ เริ่ม ${s.survivorBp} / ${s.killerBp}`)
  return out
}
