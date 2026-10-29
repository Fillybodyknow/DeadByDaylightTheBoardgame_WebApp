// The player's profile: the name everyone else sees online (rooms, the looking-for-players chat),
// set in one place, the top bar's profile button (ProfileButton), as a PC game's profile. Kept on
// this device; the key is the one the online page used, so names set before carry over.
import { ref } from 'vue'

const KEY = 'dbdl-player-name'
export const NAME_MAX = 16

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

/** The player's name ('' until they set one). */
export const playerName = ref(read())

/** The profile window is open, and why it was opened for the player (shown in it; '' = by them). */
export const profileOpen = ref(false)
export const profileReason = ref('')
let afterSave: (() => void) | null = null

export function openProfile() {
  afterSave = null
  profileReason.value = ''
  profileOpen.value = true
}

/**
 * Do something that needs a name (making or joining a room, writing in the public chat): now if
 * the player has one, else once they set it in the profile window, opened for it.
 */
export function withName(then: () => void) {
  if (playerName.value) return then()
  afterSave = then
  profileReason.value = 'ตั้งชื่อก่อน — ผู้เล่นคนอื่นจะเห็นคุณด้วยชื่อนี้'
  profileOpen.value = true
}

export function closeProfile(saved: boolean) {
  profileOpen.value = false
  profileReason.value = ''
  const then = afterSave
  afterSave = null
  if (saved && playerName.value) then?.()
}

export function setPlayerName(raw: string) {
  const n = raw.trim().slice(0, NAME_MAX)
  playerName.value = n
  try {
    if (n) localStorage.setItem(KEY, n)
    else localStorage.removeItem(KEY)
  } catch {
    // storage blocked: the name holds for this visit only
  }
}

/**
 * The name to show for this player when they have set none. (Another tab's rename is not
 * followed live: the online test backend plays a different player in each tab.)
 */
export const nameOrDefault = () => playerName.value || 'ผู้เล่น'
