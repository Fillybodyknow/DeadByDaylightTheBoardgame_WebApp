// A room announced in the looking-for-players chat (#/lfg) is told on every page of the app: a
// card in the corner with a chime (LfgToasts), a count on the top bar's หาผู้เล่น, and with the tab
// in the background a system notice. Only messages with a room: talk alone stays in the chat.
//
// Not told: the sender's own, a hidden sender's, to a player in a room or a game (offline, the
// tutorial), on the chat's own page (the chat shows it), or with the setting off.
//
// Listening keeps a connection to the database, so only a device that plays online listens: one
// with a name in its profile, or that opened an online page this visit. Someone who only looks at
// the cards or plays offline never connects.
import { ref, watch } from 'vue'
import { router } from '../router'
import { asset } from '../i18n'
import { playerName } from '../profile'
import { settings } from '../settings'
import { sfx } from '../sound'
import { lfgId, mutedSenders, needLabel } from './online/lfg'
import { backend, session } from './online/session'
import type { LfgMessage } from './online/transport'

export interface LfgToast {
  id: string
  m: LfgMessage
}

/** The cards on screen, newest last. */
export const lfgToasts = ref<LfgToast[]>([])
/** Rooms announced since the chat was last open (the top bar's count). */
export const lfgUnread = ref(0)

/** How long a card stays (reading time: not an animation, so not scaled). */
const TOAST_MS = 15_000
const MAX_TOASTS = 3
/** A message older than this when it arrives was there already (the database sends the last one first). */
const FRESH_MS = 60_000

const timers = new Map<string, number>()
export function dropToast(id: string) {
  lfgToasts.value = lfgToasts.value.filter((t) => t.id !== id)
  clearTimeout(timers.get(id))
  timers.delete(id)
}

const onChat = () => router.currentRoute.value.name === 'lfg'
/** Playing: in an online room, or a game on this device (offline, the tutorial). */
const busy = () => !!session.room || ['offline', 'tutorial'].includes(String(router.currentRoute.value.name))

let started = 0
function arrived(m: LfgMessage) {
  if (!m?.room || !settings.lfgNotify) return
  if (typeof m.at !== 'number' || m.at < started - FRESH_MS) return
  if (m.from === lfgId() || mutedSenders().has(m.from)) return
  if (onChat() || busy()) return
  if (lfgToasts.value.some((t) => t.id === m.id)) return
  lfgUnread.value++
  lfgToasts.value = [...lfgToasts.value, { id: m.id, m }].slice(-MAX_TOASTS)
  timers.set(
    m.id,
    window.setTimeout(() => dropToast(m.id), TOAST_MS),
  )
  sfx.ping()
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const n = new Notification(`ดบดล — ${m.name} ประกาศหาผู้เล่น`, {
        body: [m.need ? needLabel(m.need) : '', m.text ?? '', `ห้อง ${m.room}`].filter(Boolean).join(' · '),
        icon: asset('icon.svg'),
        tag: 'dbdl-lfg',
      })
      n.onclick = () => window.focus()
    } catch {
      // some browsers only allow notifications from a service worker: the card is enough
    }
  }
}

let off: (() => void) | null = null
const visitedOnline = ref(false)
router.afterEach((to) => {
  if (to.meta.section === 'online') visitedOnline.value = true
  if (to.name === 'lfg') {
    lfgUnread.value = 0
    lfgToasts.value.forEach((t) => dropToast(t.id))
  }
})

watch(
  () => settings.lfgNotify && (!!playerName.value || visitedOnline.value) && !!backend.onLfgNew,
  (on) => {
    if (on && !off) {
      started = Date.now()
      off = backend.onLfgNew!(arrived)
    } else if (!on && off) {
      off()
      off = null
    }
  },
  { immediate: true },
)
