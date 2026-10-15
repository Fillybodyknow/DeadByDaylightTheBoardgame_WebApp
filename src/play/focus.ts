// What to point at on the board while a perk or power decision is open, and a few short facts
// to decide with: who is involved, where they are, where they would go, how far the killer is.

import { ref } from 'vue'
import { CARD_NAMES, ITEM_NAMES, PROGRESS_MAX, killerInteractions, killerMoves, isPower, pathDef, perkChoices, propsIn, roomName, survivorMoves, touchingPaths } from './engine/engine'
import { PERKS } from './engine/perks'
import type { GameState, KillerInteraction, PerkChoice, PerkOwner, RollContext } from './engine/types'

export interface Focus {
  /** Survivors to ring on the board. */
  survivors: number[]
  killer: boolean
  /** Rooms to keep lit (everything else dims a little). */
  rooms: string[]
  /** Paths someone may take, and the rooms at their ends. */
  paths: string[]
  dests: string[]
}

export interface Fact {
  who?: PerkOwner
  icon: string
  text: string
}

/** What a hovered button would do, previewed on the board. */
export const preview = ref<Partial<Focus> | null>(null)

const EMPTY: Focus = { survivors: [], killer: false, rooms: [], paths: [], dests: [] }

/** Rooms between two rooms, along any path in either direction. */
export function roomDistance(st: GameState, from: string, to: string): number {
  if (from === to) return 0
  const seen = new Set([from])
  let frontier = [from]
  for (let d = 1; frontier.length; d++) {
    const next: string[] = []
    for (const r of frontier)
      for (const p of touchingPaths(st, r)) {
        const o = p.a === r ? p.b : p.a
        if (o === to) return d
        if (!seen.has(o)) {
          seen.add(o)
          next.push(o)
        }
      }
    frontier = next
  }
  return Infinity
}

function where(st: GameState, s: number): string {
  const sv = st.survivors[s]
  const health = sv.wounded ? 'บาดเจ็บ' : 'ไม่บาดเจ็บ'
  const status = sv.status === 'locker' ? ' · ใน Locker' : sv.status === 'hooked' ? ' · บน Hook' : ''
  return `${sv.name} — ${roomName(st, sv.room)} (${health}${status})`
}

function killerFact(st: GameState, near?: number): Fact {
  const k = st.killer
  const d = near === undefined ? null : roomDistance(st, k.room, st.survivors[near].room)
  const dist = d === null ? '' : d === 0 ? ' · ห้องเดียวกัน' : ` · ห่าง ${d} ห้อง`
  return { who: 'killer', icon: '🔪', text: `${k.name} — ${roomName(st, k.room)}${dist}` }
}

const end = (st: GameState, path: string, from: string) => {
  const p = pathDef(st, path)
  return p.a === from ? p.b : p.a
}

const ROLL_WHAT: Record<RollContext['k'], (st: GameState, ctx: RollContext) => string> = {
  repair: (st, c) => `ซ่อม Generator ${progress(st, c)} — สำเร็จ +1, ยอดเยี่ยม +2`,
  openGate: (st, c) => `เปิด Exit Gate ${progress(st, c)} — สำเร็จ +1 (ครบ 3 = หนีรอด)`,
  cleanse: () => 'ชำระ Hex Totem — สำเร็จ ได้ +2 ▲',
  heal: (st, c) => `รักษา ${c.k === 'heal' ? st.survivors[c.target].name : ''}`,
  trap: () => 'Bear Trap — ล้มเหลว = บาดเจ็บ',
  search: () => 'ถูกค้น Locker — ล้มเหลว = ถูกอุ้ม',
  carry: () => 'ดิ้นหลุดจากการแบก — ได้ 5 = หลุด',
  hatchet: () => 'หลบ Hatchet — ล้มเหลว = บาดเจ็บ',
  botany: () => 'Botany Knowledge — สำเร็จ = หายบาดเจ็บ',
  selfCare: () => 'Self-Care — สำเร็จ = หายบาดเจ็บ',
  phantasm: () => 'Phantasm Trap — แต้มที่ได้ = ▲ ที่ Hag รับ หรือจ่ายเพื่อวาร์ป',
  overwhelm: () => 'Overwhelming Presence — ล้มเหลว = item เสียเปล่า',
}

function progress(st: GameState, c: RollContext): string {
  const p = 'prop' in c ? st.props.find((x) => x.id === c.prop) : undefined
  return p ? `(${p.progress}/${PROGRESS_MAX})` : ''
}

function bpFact(st: GameState, o: PerkOwner, cost: number): Fact | null {
  if (!cost) return null
  const bp = o === 'killer' ? st.killer.bp : st.survivors[o].bp
  return { who: o, icon: '▲', text: `มี ${bp} ▲ — ใช้แล้วเหลือ ${bp - cost} ▲` }
}

/** Who and what to show for the current step's decision, if it is a perk or power choice. */
export function decisionFocus(st: GameState, powerMode = false): { focus: Focus; facts: Fact[] } | null {
  const step = st.step
  const facts: Fact[] = []
  const f: Focus = { survivors: [], killer: false, rooms: [], paths: [], dests: [] }
  const addChoices = (choices: PerkChoice[], from: string) => {
    for (const c of choices)
      if (c.path) {
        f.paths.push(c.path)
        f.dests.push(end(st, c.path, from))
      }
    for (const c of choices) if (c.target !== undefined) f.survivors.push(c.target)
  }

  if (step.t === 'offer') {
    const w = step.w
    const owner = step.owner
    if (owner === 'killer') f.killer = true
    else f.survivors.push(owner)
    const choices = perkChoices(st, step.perk, owner, w)
    switch (w.k) {
      case 'cardMove': {
        const moves = survivorMoves(st, w.s, w.card)
        f.survivors.push(w.s)
        f.paths.push(...moves.map((m) => m.path.id))
        f.dests.push(...moves.map((m) => m.to))
        facts.push({ who: w.s, icon: '📍', text: where(st, w.s) })
        facts.push({ icon: '🚶', text: `ถ้าไม่ขวาง: ${CARD_NAMES[w.card]} ไป ${moves.map((m) => roomName(st, m.to)).join(' หรือ ')}` })
        facts.push(killerFact(st, w.s))
        facts.push({ who: 'killer', icon: '🃏', text: `การ์ดในมือ ${st.killer.hand.map((c) => CARD_NAMES[c]).join(', ')} — ใช้แล้วเหลือ ${st.killer.hand.length - 1} ใบ` })
        break
      }
      case 'afterAttack':
        f.survivors.push(w.target)
        f.killer = true
        facts.push({ who: w.target, icon: '🩸', text: where(st, w.target) })
        addChoices(choices, step.perk === 'agitation' ? st.killer.room : st.survivors[w.target].room)
        break
      case 'preRoll': {
        const s = w.ctx.s
        f.survivors.push(s)
        facts.push({ who: s, icon: '🎲', text: `${st.survivors[s].name}: ${ROLL_WHAT[w.ctx.k](st, w.ctx)}` })
        facts.push({ who: s, icon: '📍', text: where(st, s) })
        if (owner === 'killer') facts.push(killerFact(st, s))
        break
      }
      case 'planningStart':
      case 'planningEnd':
        f.killer = true
        facts.push(killerFact(st))
        addChoices(choices, st.killer.room)
        for (const c of choices) if (c.target !== undefined) facts.push({ who: c.target, icon: '🩸', text: where(st, c.target) })
        break
      case 'afterCardMove':
        f.survivors.push(w.s)
        f.rooms.push(w.from, w.to)
        facts.push({ who: w.s, icon: '🚶', text: `${st.survivors[w.s].name} เดิน ${roomName(st, w.from)} → ${roomName(st, w.to)}` })
        facts.push(killerFact(st, w.s))
        addChoices(choices, typeof owner === 'number' ? st.survivors[owner].room : st.killer.room)
        break
      case 'killerEntered':
        f.killer = true
        f.rooms.push(w.room)
        facts.push(killerFact(st, typeof owner === 'number' ? owner : undefined))
        break
      case 'palletBlock':
        f.killer = true
        f.paths.push(w.path)
        f.dests.push(w.to)
        facts.push({ who: 'killer', icon: '🪵', text: `Pallet ขวางทางไป ${roomName(st, w.to)} — ไม่ใช้ = ทำลายแล้วอยู่ที่เดิม เสีย Interact` })
        break
      case 'afterKillerInteract':
        f.killer = true
        facts.push(killerFact(st))
        break
      case 'afterSabotage':
      case 'cleanupStart':
        if (typeof owner === 'number') facts.push({ who: owner, icon: '📍', text: where(st, owner) })
        facts.push(killerFact(st, typeof owner === 'number' ? owner : undefined))
        break
      case 'genDone':
        f.killer = true
        facts.push({ who: 'killer', icon: '🃏', text: `การ์ดที่วางไว้: ${st.killer.planned.map((c, i) => (i < st.killer.revealedCount ? `${CARD_NAMES[c]} (เล่นแล้ว)` : CARD_NAMES[c])).join(', ')}` })
        break
      case 'turnBegin':
      case 'turnEnd': {
        // whose turn it is, first: these perks are asked on other survivors' turns too
        const sv = st.survivors[w.s]
        f.survivors.push(w.s)
        facts.push({
          who: w.s,
          icon: '⏱',
          text: `ตาของ ${sv.name} (ผู้เล่น ${st.handPlayers[sv.hand]})${w.k === 'turnBegin' ? ' — ยังไม่เปิดการ์ดเดิน' : ' — กำลังจะจบเทิร์น'}`,
        })
        facts.push({ who: w.s, icon: '📍', text: where(st, w.s) })
        facts.push(killerFact(st, w.s))
        if (step.perk === 'urban_evasion') {
          for (const c of choices) if (c.path) f.paths.push(c.path)
          f.rooms.push(sv.room)
          facts.push({ icon: '🧱', text: `กำแพงที่เอาออกจะกลับมาเมื่อจบเทิร์นของ ${sv.name}` })
        }
        if (step.perk === 'open_handed')
          facts.push({ who: 'killer', icon: '🃏', text: `การ์ดฆาตกร: ${st.killer.planned.map((c, i) => (i < st.killer.revealedCount || st.killer.shown.includes(i) ? CARD_NAMES[c] : '?')).join(', ')}` })
        break
      }
      case 'killerBreak':
        f.killer = true
        if (typeof owner === 'number') {
          facts.push({ who: owner, icon: '📍', text: where(st, owner) })
          addChoices(choices, st.survivors[owner].room)
        } else for (const c of choices) if (c.target !== undefined) facts.push({ who: c.target, icon: '🎯', text: where(st, c.target) })
        facts.push(killerFact(st, typeof owner === 'number' ? owner : undefined))
        break
      case 'repairFail':
      case 'afterRummage':
        f.survivors.push(w.s)
        facts.push({ who: w.s, icon: '📍', text: where(st, w.s) })
        facts.push(killerFact(st, w.s))
        break
      case 'preItem':
        f.survivors.push(w.s)
        facts.push({ who: w.s, icon: '🎒', text: `${where(st, w.s)} · ถือ ${st.survivors[w.s].item ? ITEM_NAMES[st.survivors[w.s].item!] : '-'}` })
        facts.push(killerFact(st, w.s))
        break
      case 'killerTurnBegin':
        f.killer = true
        facts.push({ who: 'killer', icon: '🃏', text: `การ์ดที่วางไว้: ${st.killer.planned.map((c, i) => (i < w.turn ? `${CARD_NAMES[c]} (เล่นแล้ว)` : CARD_NAMES[c])).join(', ')}` })
        facts.push(killerFact(st))
        break
      case 'preKillerInteract':
        f.killer = true
        f.survivors.push(w.target)
        f.rooms.push(st.survivors[w.target].room)
        facts.push({ who: w.target, icon: '🔪', text: `${st.killer.name} กำลังจะทำร้าย ${where(st, w.target)}` })
        break
      case 'killerTurnEnd':
        f.killer = true
        facts.push({ who: 'killer', icon: '🃏', text: `การ์ดที่เพิ่งเล่น: ${CARD_NAMES[st.killer.planned[w.turn]]}` })
        facts.push(killerFact(st))
        break
      case 'beforeReveal':
        f.survivors.push(w.s)
        f.rooms.push(w.room)
        facts.push({ who: w.s, icon: '🔍', text: `${st.survivors[w.s].name} เข้า ${roomName(st, w.room)} — ไม่ใช้ = เปิด prop ในห้องนี้` })
        for (const c of choices) if (c.prop) f.dests.push(st.props.find((p) => p.id === c.prop)!.room!)
        break
      case 'afterHang':
      case 'afterPalletLocker':
      case 'entered':
      case 'rollFail':
      case 'greatRoll':
      case 'itemUsed':
      case 'itemDiscard':
      case 'afterSurvivorInteract':
        f.survivors.push(w.s)
        facts.push({ who: w.s, icon: '📍', text: where(st, w.s) })
        facts.push(killerFact(st, w.s))
        for (const c of choices) if (c.target !== undefined) facts.push({ who: c.target, icon: '🎯', text: where(st, c.target) })
        for (const c of choices) if (c.prop) f.rooms.push(st.props.find((p) => p.id === c.prop)!.room!)
        addChoices(choices, st.killer.room)
        break
    }
    const cost = bpFact(st, owner, PERKS[step.perk].cost)
    if (cost) facts.push(cost)
    return { focus: dedupe(f), facts }
  }

  if (step.t === 'sparkChoice') {
    f.survivors.push(step.s)
    f.killer = true
    const sv = st.survivors[step.s]
    facts.push({ who: step.s, icon: '📍', text: where(st, step.s) })
    facts.push({ who: step.s, icon: '▲', text: `มี ${sv.bp} ▲ · ${sv.madness ? 'มี Madness แล้ว — ไม่จ่าย = บาดเจ็บ' : 'ยังไม่มี Madness — ไม่จ่าย = ติด Madness'}` })
    return { focus: dedupe(f), facts }
  }

  if (step.t === 'phantasmChoice') {
    f.killer = true
    f.dests.push(step.room)
    f.survivors.push(step.s)
    facts.push(killerFact(st, step.s))
    facts.push({ who: 'killer', icon: '▲', text: `มี ${st.killer.bp} ▲ · ไม่วาร์ป = +${step.face} ▲ · วาร์ป = −${step.face} ▲` })
    for (const t of st.survivors.keys())
      if (st.survivors[t].status === 'board' && st.survivors[t].room === step.room) facts.push({ who: t, icon: '👻', text: where(st, t) })
    return { focus: dedupe(f), facts }
  }

  if (step.t === 'replaceCard') {
    f.survivors.push(step.s)
    facts.push({ who: step.s, icon: '📍', text: where(st, step.s) })
    return { focus: dedupe(f), facts }
  }

  if (step.t === 'redeemerGuess') {
    f.survivors.push(step.s)
    f.killer = true
    f.dests.push(st.killer.room)
    facts.push({ who: step.s, icon: '📍', text: where(st, step.s) })
    facts.push(killerFact(st, step.s))
    facts.push({ who: 'killer', icon: '🃏', text: `การ์ดในมือฆาตกรเหลือ ${st.killer.hand.length} ใบ (ทิ้งไป 1 ใบแบบคว่ำ)` })
    return { focus: dedupe(f), facts }
  }

  if (step.t === 'turnStart') {
    const s = step.s
    f.survivors.push(s)
    facts.push({ who: s, icon: '📍', text: where(st, s) })
    facts.push(killerFact(st, s))
    for (const t of st.survivors.keys()) if (t !== s && st.survivors[t].wounded && st.survivors[t].room === st.survivors[s].room) f.survivors.push(t)
    return { focus: dedupe(f), facts }
  }

  if (step.t === 'roll') {
    const s = step.ctx.s
    f.survivors.push(s)
    facts.push({ who: s, icon: '🎲', text: `${st.survivors[s].name}: ${ROLL_WHAT[step.ctx.k](st, step.ctx)}` })
    return { focus: dedupe(f), facts }
  }

  if (step.t === 'killerInteract' && powerMode) {
    f.killer = true
    const powers = killerInteractions(st).filter(isPower)
    for (const i of powers) addPower(st, f, i)
    facts.push(killerFact(st))
    for (const s of new Set(powers.flatMap((i) => (i.k === 'hatchet' ? [i.target] : []))))
      facts.push({ who: s, icon: '🎯', text: `${where(st, s)} · ห่าง ${roomDistance(st, st.killer.room, st.survivors[s].room)} ห้อง` })
    for (const r of new Set(f.dests)) {
      const here = st.survivors.flatMap((sv) => (sv.status === 'board' && sv.room === r ? [sv.name] : []))
      const gens = propsIn(st, r).filter((p) => p.kind === 'generator' && p.revealed && p.progress > 0)
      const bits = [here.length ? `มี ${here.join(', ')}` : 'ไม่มีใคร', gens.length ? `Generator ${gens.map((g) => `${g.progress}/3`).join(', ')}` : '']
      facts.push({ icon: '🚪', text: `${roomName(st, r)}: ${bits.filter(Boolean).join(' · ')}` })
    }
    return { focus: dedupe(f), facts }
  }
  return null
}

/** Where one power use points, for the board. */
export function addPower(st: GameState, f: Focus, i: KillerInteraction) {
  const room = st.killer.room
  if (i.k === 'hatchet') f.survivors.push(i.target)
  if (i.k === 'spark' || i.k === 'bell') f.dests.push(i.room)
  if (i.k === 'phantasm') f.rooms.push(room)
  // Yamaoka's Wrath counts this room and the connected ones.
  if (i.k === 'wrath') f.rooms.push(room, ...touchingPaths(st, room).map((p) => (p.a === room ? p.b : p.a)))
  if (i.k === 'redeemer') f.survivors.push(i.target)
  if (i.k === 'power' || i.k === 'blink' || i.k === 'chainsaw') {
    f.paths.push(i.path)
    f.dests.push(end(st, i.path, room))
  }
}

/** The focus of a single choice button, for hovering it. */
export function choicePreview(st: GameState, c: PerkChoice, from: string, owner?: PerkOwner): Partial<Focus> {
  const out: Partial<Focus> = {}
  // A movement card: where it could take its player from here.
  if (c.card && c.card !== 'wait' && owner !== undefined) {
    const moves = owner === 'killer' ? killerMoves(st, c.card) : survivorMoves(st, owner, c.card)
    out.paths = moves.map((m) => m.path.id)
    out.dests = moves.map((m) => m.to)
  }
  if (c.path) {
    out.paths = [c.path]
    out.dests = [end(st, c.path, from)]
  }
  if (c.target !== undefined) out.survivors = [c.target]
  return out
}

export function powerPreview(st: GameState, i: KillerInteraction): Partial<Focus> {
  const f: Focus = { ...EMPTY, survivors: [], paths: [], dests: [] }
  addPower(st, f, i)
  if ('target' in i) f.survivors.push(i.target)
  return f
}

function dedupe(f: Focus): Focus {
  return {
    survivors: [...new Set(f.survivors)],
    killer: f.killer,
    rooms: [...new Set(f.rooms)],
    paths: [...new Set(f.paths)],
    dests: [...new Set(f.dests)],
  }
}
