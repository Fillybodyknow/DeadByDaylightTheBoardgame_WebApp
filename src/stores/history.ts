import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { GameMode } from './lobby'

// Finished games, kept on this device. The board game is won as a side (p.11): the exit gate
// opening wins it for every survivor, 8 sacrifice progress wins it for the killer.

export type Winner = 'survivors' | 'killer'

export interface GameRecord {
  id: string
  /** ISO date-time the game was recorded. */
  at: string
  mode: GameMode
  mapId: string
  killerId: string
  survivorIds: string[]
  winner: Winner
}

const KEY = 'dbd-companion-history'

function load(): GameRecord[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as GameRecord[]) : []
  } catch {
    return []
  }
}

export interface Tally {
  id: string
  games: number
  wins: number
}

function tally(records: GameRecord[], key: (r: GameRecord) => string[], won: (r: GameRecord) => boolean): Tally[] {
  const m = new Map<string, Tally>()
  for (const r of records)
    for (const id of key(r)) {
      const t = m.get(id) ?? { id, games: 0, wins: 0 }
      t.games++
      if (won(r)) t.wins++
      m.set(id, t)
    }
  return [...m.values()].sort((a, b) => b.games - a.games || b.wins - a.wins)
}

export const useHistoryStore = defineStore('history', () => {
  const records = ref<GameRecord[]>(load())

  watch(
    records,
    (v) => {
      try {
        localStorage.setItem(KEY, JSON.stringify(v))
      } catch {
        // storage unavailable: history won't persist
      }
    },
    { deep: true },
  )

  function add(r: Omit<GameRecord, 'id' | 'at'>): GameRecord {
    const rec = { ...r, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString() }
    records.value = [rec, ...records.value]
    return rec
  }

  function remove(id: string) {
    records.value = records.value.filter((r) => r.id !== id)
  }

  function clear() {
    records.value = []
  }

  const survivorWins = computed(() => records.value.filter((r) => r.winner === 'survivors').length)
  const killerWins = computed(() => records.value.filter((r) => r.winner === 'killer').length)
  const byKiller = computed(() => tally(records.value, (r) => [r.killerId], (r) => r.winner === 'killer'))
  const bySurvivor = computed(() => tally(records.value, (r) => r.survivorIds, (r) => r.winner === 'survivors'))
  const byMap = computed(() => tally(records.value, (r) => [r.mapId], (r) => r.winner === 'survivors'))

  return { records, add, remove, clear, survivorWins, killerWins, byKiller, bySurvivor, byMap }
})
