// Epithets at the end of a game ("ฉายา"): one for every player, read from the log the way the
// stats are (stats.ts). Everyone gets one and no two are the same — each epithet is scored for
// each player and the best whole set is taken.
//
// Nothing here is random and nothing is asked of the engine: online every device works the
// epithets out from the same state, so the whole room must land on the same answer. Ties keep the
// first fit found, which makes the order of the lists below the tie-breaker.

import type { GameState } from './engine/types'
import { gameStats, type KillerStats, type SurvivorStats } from './stats'

/** What a survivor did, for the epithets: their stats and a few counts only these need. */
export interface SurvivorTally extends SurvivorStats {
  /** Rooms moved into (every `move` event, not the distance walked). */
  moves: number
  /** Pallets thrown down. */
  pallets: number
  /** Bear traps stepped into. */
  traps: number
  /** Times they got into a locker. */
  lockers: number
}

/** One epithet handed out, with the line that says why. */
export interface Epithet {
  id: string
  /** The Thai name shown. */
  name: string
  /** Why they got it, in Thai. */
  note: string
}

export interface Epithets {
  /** One per survivor, by their index. */
  survivors: Epithet[]
  killer: Epithet
}

/** One epithet as it is turned over (EpithetReveal). */
export interface EpithetCard {
  epithet: Epithet
  /** The character's name, under the epithet. */
  name: string
  mini: string
  killer?: boolean
}

/** How well an epithet fits one player: `score` is comparable between epithets (see `share`). */
interface Fit {
  score: number
  note: string
}

interface Def<T> {
  id: string
  name: string
  /** How well this fits player `i` of `all`, or null when it does not fit them at all. */
  fit: (all: T[], i: number) => Fit | null
}

/** Everyone's counts for the epithets. */
export function tallies(st: GameState): { survivors: SurvivorTally[]; killer: KillerStats } {
  const base = gameStats(st)
  const survivors: SurvivorTally[] = base.survivors.map((s) => ({ ...s, moves: 0, pallets: 0, traps: 0, lockers: 0 }))
  for (const { ev } of st.log) {
    if (!ev) continue
    switch (ev.k) {
      case 'move':
        if (typeof ev.who === 'number') survivors[ev.who].moves++
        break
      case 'palletDrop':
        survivors[ev.s].pallets++
        break
      case 'trapSprung':
        survivors[ev.s].traps++
        break
      case 'touch':
        if (typeof ev.who === 'number' && ev.what === 'lockerIn') survivors[ev.who].lockers++
        break
    }
  }
  return { survivors, killer: base.killer }
}

/**
 * One count weighed against the rest of the side: the share of the team's total, and a quarter
 * more for standing alone at the top. Counts of different kinds (14 repair, 2 rescues) can't be
 * compared as they are; their shares can.
 */
function share(all: number[], i: number): number {
  const n = all[i]
  if (n <= 0) return 0
  const total = all.reduce((a, b) => a + b, 0)
  const best = Math.max(...all)
  const alone = n === best && all.filter((x) => x === best).length === 1
  return n / total + (alone ? 0.25 : 0)
}

/** An epithet for whoever did most of one thing. */
const most = (id: string, name: string, count: (s: SurvivorTally) => number, note: (n: number) => string): Def<SurvivorTally> => ({
  id,
  name,
  fit: (all, i) => {
    const score = share(all.map(count), i)
    return score > 0 ? { score, note: note(count(all[i])) } : null
  },
})

/** An epithet nobody earns: it is here so a player who did nothing worth a name still gets one. */
const spare = (id: string, name: string, note: string, score: number): Def<SurvivorTally> => ({ id, name, fit: () => ({ score, note }) })

/**
 * The survivors' epithets. The four spares at the end are worth so little that they are only ever
 * taken when nothing else fits, and there are four of them so a set can always be filled.
 */
const SURVIVOR: Def<SurvivorTally>[] = [
  { id: 'ghost', name: 'ผีไร้ร่าง', fit: (all, i) => (all[i].wounded === 0 ? { score: 1.1, note: 'ไม่บาดเจ็บเลยสักครั้งทั้งเกม' } : null) },
  { id: 'slippery', name: 'ลื่นปรื๊ด', fit: (all, i) => (all[i].escapes > 0 ? { score: 0.8 + share(all.map((s) => s.escapes), i), note: `ดิ้นหลุดจากการแบก ${all[i].escapes} ครั้ง` } : null) },
  most('mechanic', 'ช่างเครื่องมือทอง', (s) => s.repair, (n) => `ลงแต้มซ่อม ${n} แต้ม`),
  most('hero', 'วีรบุรุษจำเป็น', (s) => s.rescues, (n) => `ปลดเพื่อนจาก Hook ${n} ครั้ง`),
  most('medic', 'พยาบาลสนาม', (s) => s.heals, (n) => `รักษาเพื่อน ${n} ครั้ง`),
  most('cleanser', 'นักล้างอาถรรพ์', (s) => s.totems, (n) => `ชำระ Hex Totem ${n} อัน`),
  most('gate', 'นายประตู', (s) => s.gate, (n) => `หมุน Exit Gate ${n} แต้ม`),
  most('sandbag', 'กระสอบทรายประจำทีม', (s) => s.wounded, (n) => `บาดเจ็บ ${n} ครั้ง`),
  most('regular', 'ขาประจำตะขอ', (s) => s.hooked, (n) => `โดนแขวน ${n} ครั้ง`),
  most('pallet', 'มือทิ้งแผ่น', (s) => s.pallets, (n) => `ทิ้ง Pallet ${n} แผ่น`),
  most('heavyfoot', 'เท้าหนัก', (s) => s.traps, (n) => `เหยียบกับดักหมี ${n} ครั้ง`),
  most('locker', 'หนูตู้ล็อกเกอร์', (s) => s.lockers, (n) => `มุดล็อกเกอร์ ${n} ครั้ง`),
  most('hoarder', 'นักสะสม', (s) => s.items, (n) => `ได้ item ${n} ชิ้น`),
  most('runner', 'ขาแรง', (s) => s.moves, (n) => `ย้ายห้อง ${n} ครั้ง`),
  spare('decor', 'ไม้ประดับ', 'ยืนสวยอยู่กลางป่า', 0.04),
  spare('audience', 'ผู้ชมตัวยง', 'ดูเพื่อนเล่นอย่างใกล้ชิด', 0.03),
  spare('breeze', 'ลมพัดผ่าน', 'มาแล้วก็ไป ไม่ทิ้งร่องรอย', 0.02),
  spare('extra', 'ตัวประกอบ', 'ไม่มีช็อตเด่นในเกมนี้', 0.01),
]

/** An epithet for the killer: there is only one of him, so the counts are weighed by hand. */
const kill = (id: string, name: string, count: (k: KillerStats) => number, weight: number, note: (k: KillerStats) => string): Def<KillerStats> => ({
  id,
  name,
  fit: (all, i) => (count(all[i]) > 0 ? { score: count(all[i]) * weight, note: note(all[i]) } : null),
})

const KILLER: Def<KillerStats>[] = [
  kill('hunter', 'นักล่าเลือดเย็น', (k) => k.hits, 1, (k) => `ทำร้ายผู้รอดชีวิต ${k.hits} ครั้ง`),
  kill('collector', 'นักสะสมตะขอ', (k) => k.hooks, 1.2, (k) => `แขวนได้ ${k.hooks} ครั้ง`),
  kill('wrecker', 'ช่างรื้อถอน', (k) => k.breaks, 1.5, (k) => `ทุบ Pallet และกำแพง ${k.breaks} ครั้ง`),
  kill('gardener', 'คนสวนขยัน', (k) => k.damaged, 1.5, (k) => `ทำลายความคืบหน้า Generator ${k.damaged} ครั้ง`),
  kill('trapper', 'นายพรานกับดัก', (k) => k.trapsSprung, 2, (k) => `กับดักทำงาน ${k.trapsSprung} จาก ${k.trapsSet} อันที่วาง`),
  { id: 'empty', name: 'มือเปล่า', fit: () => ({ score: 0.5, note: 'แทบไม่ได้แตะใครเลย' }) },
]

/**
 * The best set of epithets: one each, no two alike. Every player × every epithet is scored and
 * every set searched (four survivors over eighteen epithets is a few tens of thousands of sets,
 * once, when the game ends). The first set found wins a tie, so the result never wavers.
 */
function assign<T>(defs: Def<T>[], all: T[]): Epithet[] {
  const fits = all.map((_, i) => defs.map((d) => d.fit(all, i)))
  let bestTotal = -Infinity
  let bestTake: number[] = []
  const take: number[] = []
  const walk = (p: number, total: number) => {
    if (p === all.length) {
      if (total > bestTotal) {
        bestTotal = total
        bestTake = [...take]
      }
      return
    }
    for (let d = 0; d < defs.length; d++) {
      const f = fits[p][d]
      if (!f || take.includes(d)) continue
      take.push(d)
      walk(p + 1, total + f.score)
      take.pop()
    }
  }
  walk(0, 0)
  // (the spares always fit, so a set is always found; this keeps the types honest all the same)
  return all.map((_, i) => {
    const d = bestTake[i]
    const f = d === undefined ? null : fits[i][d]
    return f ? { id: defs[d].id, name: defs[d].name, note: f.note } : { id: 'none', name: 'ผู้รอดชีวิต', note: '' }
  })
}

/** Everyone's epithet for a game that has ended. */
export function epithets(st: GameState): Epithets {
  const t = tallies(st)
  return { survivors: assign(SURVIVOR, t.survivors), killer: assign(KILLER, [t.killer])[0] }
}
