// Round summaries, end-of-game stats and the timeline, read from the events in the log.

import { roomName } from './engine/engine'
import type { GameEvent, GameState, LogEntry } from './engine/types'

export interface SurvivorStats {
  repair: number
  gensDone: number
  heals: number
  rescues: number
  totems: number
  wounded: number
  hooked: number
  escapes: number
  items: number
  bp: number
  gate: number
}

export interface KillerStats {
  hits: number
  pickUps: number
  hooks: number
  trapsSet: number
  trapsSprung: number
  damaged: number
  breaks: number
  bp: number
}

const events = (log: LogEntry[]) => log.flatMap((e) => (e.ev ? [{ round: e.round, ev: e.ev }] : []))

export function gameStats(st: GameState, round?: number) {
  const survivors: SurvivorStats[] = st.survivors.map(() => ({
    repair: 0,
    gensDone: 0,
    heals: 0,
    rescues: 0,
    totems: 0,
    wounded: 0,
    hooked: 0,
    escapes: 0,
    items: 0,
    bp: 0,
    gate: 0,
  }))
  const killer: KillerStats = { hits: 0, pickUps: 0, hooks: 0, trapsSet: 0, trapsSprung: 0, damaged: 0, breaks: 0, bp: 0 }
  let lastRepairer: number | null = null
  for (const { round: r, ev } of events(st.log)) {
    if (round !== undefined && r !== round) continue
    switch (ev.k) {
      case 'repair':
        survivors[ev.s].repair += ev.add
        lastRepairer = ev.s
        break
      case 'genDone':
        if (lastRepairer !== null) survivors[lastRepairer].gensDone++
        break
      case 'heal':
        survivors[ev.by].heals++
        break
      case 'rescue':
        survivors[ev.by].rescues++
        break
      case 'cleanse':
        survivors[ev.s].totems++
        break
      case 'wound':
        survivors[ev.s].wounded++
        if (ev.by === 'attack') killer.hits++
        break
      case 'hook':
        survivors[ev.s].hooked++
        killer.hooks++
        break
      case 'pickUp':
        killer.pickUps++
        break
      case 'carryEscape':
        survivors[ev.s].escapes++
        break
      case 'item':
        survivors[ev.s].items++
        break
      case 'gate':
        survivors[ev.s].gate++
        break
      case 'bp':
        if (ev.who === 'killer') killer.bp += ev.n
        else survivors[ev.who].bp += ev.n
        break
      case 'trapSet':
        killer.trapsSet++
        break
      case 'trapSprung':
        killer.trapsSprung++
        break
      case 'damage':
        killer.damaged++
        break
      case 'palletBreak':
      case 'wallBreak':
        killer.breaks++
        break
    }
  }
  return { survivors, killer }
}

export interface RoundSummary {
  round: number
  sacrificeBefore: number
  sacrificeAfter: number
  repairs: number
  gensDone: number
  gatesPowered: boolean
  lines: { text: string; tone: 'killer' | 'survivor' | 'game' }[]
}

/** What happened in one round, for the cleanup summary. */
export function roundSummary(st: GameState, round: number): RoundSummary {
  const evs = events(st.log)
  const before = [...evs].reverse().find((e) => e.round < round && e.ev.k === 'sacrifice')
  const inRound = evs.filter((e) => e.round === round).map((e) => e.ev)
  const sacrifices = inRound.filter((e): e is Extract<GameEvent, { k: 'sacrifice' }> => e.k === 'sacrifice')
  const sacrificeBefore = before && before.ev.k === 'sacrifice' ? before.ev.total : 0
  const name = (s: number) => st.survivors[s].name
  const lines: RoundSummary['lines'] = []
  for (const ev of inRound) {
    const line = describe(st, ev, name)
    if (line) lines.push(line)
  }
  return {
    round,
    sacrificeBefore,
    sacrificeAfter: sacrifices.length ? sacrifices[sacrifices.length - 1].total : sacrificeBefore,
    repairs: inRound.reduce((n, e) => n + (e.k === 'repair' ? e.add : 0), 0),
    gensDone: inRound.filter((e) => e.k === 'genDone').length,
    gatesPowered: inRound.some((e) => e.k === 'gatesPowered'),
    lines,
  }
}

/** The headline events of a round or the game, in words. */
function describe(st: GameState, ev: GameEvent, name: (s: number) => string): RoundSummary['lines'][number] | null {
  switch (ev.k) {
    case 'wound':
      return { text: `${name(ev.s)} บาดเจ็บ${ev.by === 'trap' ? ' (Bear Trap)' : ''}`, tone: 'killer' }
    case 'hook':
      return { text: `${name(ev.s)} ถูกแขวนบน Hook`, tone: 'killer' }
    case 'rescue':
      return { text: `${name(ev.by)} ช่วย ${name(ev.s)} ลงจาก Hook`, tone: 'survivor' }
    case 'heal':
      return { text: `${name(ev.by)} รักษา ${name(ev.s)}`, tone: 'survivor' }
    case 'carryEscape':
      return { text: `${name(ev.s)} หลุดจากการแบก`, tone: 'survivor' }
    case 'genDone':
      return { text: `ซ่อม Generator ที่ ${roomName(st, ev.room)} เสร็จ`, tone: 'survivor' }
    case 'gatesPowered':
      return { text: 'Exit Gate มีไฟแล้ว!', tone: 'game' }
    case 'cleanse':
      return { text: `${name(ev.s)} ชำระ Hex Totem`, tone: 'survivor' }
    case 'damage':
      return { text: `${st.killer.name} ทำลายความคืบหน้า Generator`, tone: 'killer' }
    case 'gameOver':
      return { text: ev.winner === 'survivors' ? 'ประตูเปิด — ผู้รอดชีวิตหนีรอด' : 'Sacrifice ครบ 8 — ฆาตกรชนะ', tone: 'game' }
    default:
      return null
  }
}

export interface TimelineItem {
  round: number
  text: string
  tone: 'killer' | 'survivor' | 'game'
}

/** The whole game's headline events, for the end screen. */
export function timeline(st: GameState): TimelineItem[] {
  const name = (s: number) => st.survivors[s].name
  return events(st.log).flatMap(({ round, ev }) => {
    if (ev.k === 'wound' || ev.k === 'heal' || ev.k === 'damage' || ev.k === 'cleanse') return []
    const line = describe(st, ev, name)
    return line ? [{ round, ...line }] : []
  })
}

