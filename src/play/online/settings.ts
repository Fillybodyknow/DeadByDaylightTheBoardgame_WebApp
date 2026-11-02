// Room settings: what the host sets in the lobby before seating everyone. Stored in the room
// (lobby node) as a partial object; anything missing takes its default, so rooms made before
// a setting existed play as they always did.

import { killers, survivors } from '../../data'
import { PLAYABLE_KILLERS, PRINTED_PERKS } from '../engine/perks'
import { KILLER_BP, SURVIVOR_BP } from '../engine/engine'
import type { GameMode } from '../engine/loadout'
import type { OfferingPlan } from '../engine/offerings'

export interface RoomSettings {
  /** p.19: Adept (printed perks), Bloodweb (5 cards drawn, up to 3 laid over), Devout (3 picked). */
  mode: GameMode
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
  /**
   * Banlist: before the characters, each side bans characters of the other side (the survivors
   * together bans killers, the killer bans survivors), `banCount` at most each; revealed once
   * both sides have confirmed.
   */
  banlist: boolean
  banCount: number
  /** Starting ▲, to balance a table with new players (the rulebook's are 2 and 4, p.6). */
  survivorBp: number
  killerBp: number
  /** Offerings (p.19): which side burns them, how many for a side alone (1–2), and whether they are drawn. */
  offerings: OfferingPlan
  offeringCount: number
  offeringRandom: boolean
}

export const DEFAULT_SETTINGS: RoomSettings = {
  mode: 'adept',
  timer: 0,
  map: 'killer',
  showKiller: false,
  dupes: false,
  random: false,
  banlist: false,
  banCount: 2,
  survivorBp: SURVIVOR_BP.start,
  killerBp: KILLER_BP.start,
  offerings: 'none',
  offeringCount: 1,
  offeringRandom: false,
}

/** Ready-made settings for the host to start from (RoomSettingsCard), each whole. */
export const SETTINGS_PRESETS: { id: string; label: string; sub: string; settings: RoomSettings }[] = [
  { id: 'rulebook', label: 'ตามเล่ม', sub: 'กติกาตามเล่มทั้งหมด', settings: DEFAULT_SETTINGS },
  { id: 'new', label: 'มือใหม่', sub: 'Survivor ได้ ▲ เพิ่ม เห็นฆาตกร ไม่จำกัดเวลา', settings: { ...DEFAULT_SETTINGS, survivorBp: 3, showKiller: true } },
  { id: 'versus', label: 'แข่งขัน', sub: 'Banlist เวลา 90 วิ แผนที่ลับ Offering ฝั่งละ 1', settings: { ...DEFAULT_SETTINGS, banlist: true, banCount: 2, timer: 90, map: 'secret', offerings: 'both' } },
  { id: 'party', label: 'ปาร์ตี้ / สุ่ม', sub: 'สุ่มตัวละครและแผนที่ Bloodweb เวลา 60 วิ', settings: { ...DEFAULT_SETTINGS, random: true, dupes: true, map: 'random', mode: 'bloodweb', timer: 60 } },
]

/** Settings as they play: a choice that does nothing as things are (the ban count with no Banlist) at its default. */
function effective(s: RoomSettings): RoomSettings {
  const d = DEFAULT_SETTINGS
  return {
    ...s,
    banCount: s.banlist ? s.banCount : d.banCount,
    offeringCount: s.offerings === 'survivors' || s.offerings === 'killer' ? s.offeringCount : d.offeringCount,
    offeringRandom: s.offerings !== 'none' ? s.offeringRandom : d.offeringRandom,
  }
}

/** Whether `a` and `b` play the same in these settings (all of them by default). */
export function sameSettings(a: RoomSettings, b: RoomSettings, keys = Object.keys(DEFAULT_SETTINGS) as (keyof RoomSettings)[]): boolean {
  const ea = effective(a)
  const eb = effective(b)
  return keys.every((k) => ea[k] === eb[k])
}

/** The ready-made settings these are, if any. */
export const presetOf = (s: RoomSettings) => SETTINGS_PRESETS.find((p) => sameSettings(p.settings, s)) ?? null

export const TIMER_CHOICES = [0, 60, 90, 120]
export const BAN_COUNT_RANGE = [1, 3] as const
export const SURVIVOR_BP_RANGE = [0, 4] as const
export const KILLER_BP_RANGE = [2, 6] as const

/** The room's settings with every default filled in (a host's old `bans` list is no longer used). */
export function settingsOf(stored: (Partial<RoomSettings> & { bans?: unknown }) | undefined): RoomSettings {
  const { bans: _old, ...rest } = stored ?? {}
  return { ...DEFAULT_SETTINGS, ...rest }
}

/** Characters the full game can play, by side. */
export const playableSurvivors = () => survivors.filter((c) => (PRINTED_PERKS[c.id]?.length ?? 0) > 0)
export const playableKillers = () => killers.filter((c) => PLAYABLE_KILLERS.includes(c.id))

/** What differs from the defaults, as short chips for the lobby ("⏱ 90 วิ"). */
export function settingsChips(s: RoomSettings): string[] {
  const out: string[] = []
  if (s.mode === 'bloodweb') out.push('🕸 Bloodweb')
  if (s.mode === 'devout') out.push('🙏 Devout')
  if (s.timer) out.push(`⏱ ${s.timer} วิ/ตา`)
  if (s.map === 'secret') out.push('🗺 แผนที่ลับ')
  if (s.map === 'host') out.push('🗺 หัวห้องเลือกแผนที่')
  if (s.map === 'random') out.push('🗺 สุ่มแผนที่')
  if (s.random) out.push('🎲 สุ่มตัวละคร')
  if (s.showKiller) out.push('👁 เห็นฆาตกรที่เลือก')
  if (s.dupes) out.push('👯 Survivor ซ้ำได้')
  if (s.banlist) out.push(`🚫 Banlist ${s.banCount} ตัว/ฝั่ง`)
  if (s.offerings !== 'none') {
    const who = s.offerings === 'both' ? 'ฝั่งละ 1' : `${s.offerings === 'killer' ? 'Killer' : 'Survivor'} ${s.offeringCount} ใบ`
    out.push(`🔥 Offering ${who}${s.offeringRandom ? ' (สุ่ม)' : ''}`)
  }
  if (s.survivorBp !== DEFAULT_SETTINGS.survivorBp || s.killerBp !== DEFAULT_SETTINGS.killerBp) out.push(`▲ เริ่ม ${s.survivorBp} / ${s.killerBp}`)
  return out
}
