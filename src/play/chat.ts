// Chat: online, everyone in the room talks in one channel, the lobby and the game alike. Everyone
// reads every message, the killer too: survivors may talk but never in secret, everything said
// aloud for the killer to hear (p.8). A spectator (a member without a seat) may chat as well.
//
// Like pings, the chat is not part of the game: it goes round the room (`Room.chat`), is never
// replayed and never saved with the game. The room shows its latest CHAT_KEEP messages.
//
// Spam: at most one message a second (also enforced by the database rules) and a few in a row
// before a short wait.
//
// Notices (someone joined, left, was kicked, lost their connection or came back) are not messages:
// each device reads them off the room's members as they change, and lists them among the
// messages from the moment it entered.

import { computed, ref, watch } from 'vue'
import { sfx } from '../sound'
import { pingHex } from './online/pingColors'
import { pingColors, session } from './online/session'
import { CHAT_MAX, type ChatMessage } from './online/transport'

export const chatMessages = ref<ChatMessage[]>([])

export type NoticeKind = 'join' | 'leave' | 'kick' | 'drop' | 'back'
export interface ChatNotice {
  id: string
  at: number
  kind: NoticeKind
  text: string
}
/** Notices since this device entered the room. */
export const chatNotices = ref<ChatNotice[]>([])
/** The newest notice, for a few seconds (shown beside the 💬 button when the chat is closed). */
export const lastNotice = ref<ChatNotice | null>(null)

/** Messages and notices, oldest first. */
export const chatFeed = computed(() =>
  [...chatMessages.value.map((m) => ({ ...m, kind: 'msg' as const })), ...chatNotices.value].sort((a, b) => a.at - b.at),
)
/** Messages from the others since the chat was last seen. */
export const chatUnread = ref(0)
/** The chat is on screen (the lobby's panel, the game's drawer): nothing new is unread. */
export const chatSeen = ref(false)
/** The game's chat drawer is open. */
export const chatOpen = ref(false)
/** Seconds to wait before this player may send again (0: now). */
export const chatWait = ref(0)
/** Why the last message didn't go (said under the box for a moment). */
export const chatError = ref('')

/** Ready-made lines, quicker than typing on a tablet. */
export const QUICK_LINES = ['ช่วยด้วย!', 'ไปซ่อม Generator', 'ระวังข้างหลัง!', 'ฉันไปช่วยเอง', 'รอก่อน', 'ขอบคุณ', 'GG']

/** How long a message stays as a bubble beside its sender's tile in the game. */
export const BUBBLE_MS = 6000

/** This device may chat: in a room that carries chat, as one of its members. */
export const canChat = computed(() => !!session.room?.chat && !!session.data?.members[session.me])

/** A sender's colour: their ping colour. */
export function chatHex(from: string): string {
  return pingHex(pingColors.value[from])
}

// ---------- bubbles: each member's newest message, for a few seconds ----------

export interface ChatBubble {
  /** Changes with every message, so the bubble restarts its animation. */
  key: string
  text: string
}

/** Client id → their bubble on screen. */
export const chatBubbles = ref<Record<string, ChatBubble>>({})
const bubbleTimers = new Map<string, number>()

function bubble(m: ChatMessage) {
  chatBubbles.value = {
    ...chatBubbles.value,
    [m.from]: { key: m.id, text: m.text },
  }
  clearTimeout(bubbleTimers.get(m.from))
  bubbleTimers.set(
    m.from,
    window.setTimeout(() => {
      const next = { ...chatBubbles.value }
      delete next[m.from]
      chatBubbles.value = next
      bubbleTimers.delete(m.from)
    }, BUBBLE_MS),
  )
}

/** The member sitting in a seat (the game's player number), for their bubble on the tiles. */
export function memberInSeat(seat: number): string | null {
  return session.data?.seats[String(seat)]?.id ?? null
}

// ---------- sending ----------

/**
 * At least this long between two messages of one player. The database rules refuse faster than one
 * a second, by the server's clock: the margin keeps network jitter from tripping that.
 */
const GAP_MS = 1200
/** A burst: this many messages within BURST_MS, then a wait until the oldest drops out. */
const BURST = 5
const BURST_MS = 10000

let sent: number[] = []
let waitTimer: number | undefined
let errorTimer: number | undefined

function waitFor(now: number): number {
  sent = sent.filter((t) => now - t < BURST_MS)
  const last = sent[sent.length - 1]
  const gap = last === undefined ? 0 : GAP_MS - (now - last)
  const burst = sent.length >= BURST ? BURST_MS - (now - sent[0]) : 0
  return Math.max(0, gap, burst)
}

function countDown() {
  clearInterval(waitTimer)
  const tick = () => {
    chatWait.value = Math.ceil(waitFor(Date.now()) / 1000)
    if (!chatWait.value) clearInterval(waitTimer)
  }
  tick()
  waitTimer = window.setInterval(tick, 250)
}

function fail(why: string) {
  chatError.value = why
  clearTimeout(errorTimer)
  errorTimer = window.setTimeout(() => (chatError.value = ''), 5000)
}

/** Send a message; false when there is nothing to send or it is too soon after the last ones. */
export function sendChat(raw: string): boolean {
  const room = session.room
  const text = raw.replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX)
  if (!text || !canChat.value || !room?.chat) return false
  const now = Date.now()
  if (waitFor(now) > 0) {
    countDown()
    return false
  }
  sent.push(now)
  const name = session.data?.members[session.me]?.name ?? 'ผู้เล่น'
  room.chat({ from: session.me, name, text }).catch((e) => {
    console.warn('online: the message was not sent (database.rules.json needs "chat"?)', e)
    fail('ส่งข้อความไม่ได้ — ลองใหม่อีกครั้ง')
  })
  if (sent.length >= BURST) countDown()
  return true
}

// ---------- receiving ----------

/** Ids already shown, so a message is announced once. */
let known = new Set<string>()
let first = true

function receive(list: ChatMessage[]) {
  const fresh = first ? [] : list.filter((m) => !known.has(m.id))
  first = false
  known = new Set(list.map((m) => m.id))
  chatMessages.value = list
  const others = fresh.filter((m) => m.from !== session.me)
  for (const m of fresh) bubble(m)
  if (!others.length) return
  if (!chatSeen.value) chatUnread.value += others.length
  sfx.chat()
}

// ---------- notices ----------

const NOTICE_TEXT: Record<NoticeKind, string> = {
  join: 'เข้าร่วมห้อง',
  leave: 'ออกจากห้อง',
  kick: 'ถูกเตะออกจากห้อง',
  drop: 'ขาดการเชื่อมต่อ',
  back: 'เชื่อมต่อกลับมาแล้ว',
}

interface Seen {
  names: Record<string, string>
  kicked: Set<string>
  dropped: Set<string>
}
let before: Seen | null = null
let noticeSerial = 0
let noticeTimer: number | undefined

function notice(id: string, name: string, kind: NoticeKind) {
  // about this device itself: it knows (and its own joining is the first thing it sees)
  if (id === session.me) return
  const n: ChatNotice = { id: `n${++noticeSerial}`, at: Date.now(), kind, text: `${name} ${NOTICE_TEXT[kind]}` }
  chatNotices.value = [...chatNotices.value, n].slice(-50)
  lastNotice.value = n
  clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => (lastNotice.value = null), BUBBLE_MS)
}

watch(
  () => session.data,
  (d) => {
    if (!d) return void (before = null)
    const now: Seen = {
      names: Object.fromEntries(Object.entries(d.members).map(([id, m]) => [id, m.name])),
      kicked: new Set(Object.keys(d.kicked ?? {})),
      dropped: new Set(Object.keys(d.dropped ?? {})),
    }
    const was = before
    before = now
    // the first look at the room: what is there already is no news
    if (!was) return
    for (const [id, name] of Object.entries(now.names)) {
      if (!(id in was.names)) notice(id, name, was.dropped.has(id) ? 'back' : 'join')
      else if (now.dropped.has(id) && !was.dropped.has(id)) notice(id, name, 'drop')
      else if (!now.dropped.has(id) && was.dropped.has(id)) notice(id, name, 'back')
    }
    for (const [id, name] of Object.entries(was.names)) {
      if (id in now.names) continue
      // let go after losing their connection earlier (already said): nothing new
      if (was.dropped.has(id) && !now.kicked.has(id)) continue
      notice(id, name, now.kicked.has(id) && !was.kicked.has(id) ? 'kick' : now.dropped.has(id) ? 'drop' : 'leave')
    }
  },
)

watch(chatSeen, (seen) => {
  if (seen) chatUnread.value = 0
})

watch(
  () => session.room,
  (room, _old, onCleanup) => {
    chatMessages.value = []
    chatNotices.value = []
    lastNotice.value = null
    before = null
    chatUnread.value = 0
    chatBubbles.value = {}
    chatOpen.value = false
    known = new Set()
    first = true
    const off = room?.onChat?.(receive)
    onCleanup(() => off?.())
  },
  { immediate: true },
)
