// The looking-for-players chat (#/lfg, LfgView): the one public channel of the app, where anyone
// finds people to play with. A message may carry a room (attached in the chat, or sent from a
// lobby's 📢 ประกาศหาคน), shown as a card that joins it while it is still gathering. Nothing of it
// is part of a game.
//
// Senders go by a chat id, a random id of their own: the chat is public, and the client id is a
// seat's key in a room. Spam: one message every 3 s (the database rules too), the latest
// LFG_KEEP loaded, a day's life, and anyone can hide a sender's messages on their own device.

import { backend } from './session'
import type { LfgMessage, Side } from './transport'
import { LFG_TTL_MS } from './transport'

export type LfgNeed = NonNullable<LfgMessage['need']>

export const LFG_TEXT_MAX = 200
export const LFG_NEEDS: LfgNeed[] = ['killer', 'survivor', 'any']
/** At least this long between two messages: the rules' 3 s by the server's clock, with a margin. */
export const LFG_GAP_MS = 3300
/** Who is on the page: an entry is refreshed this often, and one older than LFG_HERE_FRESH_MS is gone. */
export const LFG_HERE_REFRESH_MS = 3 * 60_000
export const LFG_HERE_FRESH_MS = 7 * 60_000

/** Storage blocked: one id for this visit. */
let memo: string | undefined
/** This device's chat id (20 hex digits, as the rules ask). */
export function lfgId(): string {
  const KEY = 'dbdl-lfg-id'
  // the local test backend plays each player in a tab: an id per tab there
  try {
    const store = backend.name === 'local' ? sessionStorage : localStorage
    let id = store.getItem(KEY)
    if (!id) store.setItem(KEY, (id = crypto.randomUUID().replace(/-/g, '').slice(0, 20)))
    return id
  } catch {
    return (memo ??= crypto.randomUUID().replace(/-/g, '').slice(0, 20))
  }
}

const NEED_LABEL: Record<LfgNeed, string> = { killer: 'ขาดฆาตกร', survivor: 'ขาดผู้รอด', any: 'ขาดผู้เล่น' }
export const needLabel = (need: LfgNeed) => NEED_LABEL[need] ?? ''

/** In a lobby, the side to ask for: the killer while there is none (a game needs one), else survivors. */
export function lobbyLacks(members: Record<string, { side: Side | null }>): LfgNeed {
  const sides = Object.values(members).map((m) => m.side)
  if (!sides.includes('killer')) return sides.includes('survivor') ? 'killer' : 'any'
  return 'survivor'
}

let lastSent = 0
/** Milliseconds before this device may send again (0: now). */
export const lfgWait = () => Math.max(0, lastSent + LFG_GAP_MS - Date.now())

/**
 * Send a message: text, a room, or both. The database refuses undefined, so only set fields go.
 * Throws what went wrong, in Thai.
 */
export async function sendLfg(m: { name: string; text: string; room?: string; need?: LfgNeed }) {
  const text = m.text.replace(/\s+/g, ' ').trim().slice(0, LFG_TEXT_MAX)
  if (!text && !m.room) return
  if (lfgWait() > 0) throw new Error('ส่งถี่เกินไป — รอสักครู่แล้วส่งใหม่')
  lastSent = Date.now()
  try {
    await backend.sendLfg!({
      from: lfgId(),
      name: m.name.trim().slice(0, 16) || 'ผู้เล่น',
      ...(text ? { text } : {}),
      ...(m.room ? { room: m.room } : {}),
      ...(m.room && m.need ? { need: m.need } : {}),
    })
  } catch (e) {
    const msg = String((e as Error)?.message ?? e)
    throw new Error(
      /permission|PERMISSION_DENIED/i.test(msg)
        ? 'ส่งไม่ได้: ส่งถี่เกินไป หรือเซิร์ฟเวอร์ยังไม่รองรับห้องแชตนี้ — รอสักครู่แล้วลองใหม่'
        : 'ส่งไม่ได้: ตรวจการเชื่อมต่ออินเทอร์เน็ต แล้วลองใหม่',
    )
  }
}

let swept = false
/** Delete a few of the messages over a day old (once per page): no server would. */
export function sweepLfg() {
  if (swept) return
  swept = true
  // a margin for this device's clock: the rules check the age by the server's
  void backend.sweepLfg?.(Date.now() - LFG_TTL_MS - 10 * 60_000).catch(() => {})
}

// ---------- hiding a sender, on this device only ----------

const MUTED = 'dbdl-lfg-muted'
export function mutedSenders(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(MUTED) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}
export function setMuted(ids: Set<string>) {
  try {
    if (ids.size) localStorage.setItem(MUTED, JSON.stringify([...ids].slice(-200)))
    else localStorage.removeItem(MUTED)
  } catch {
    // storage blocked: hidden for this visit only
  }
}
