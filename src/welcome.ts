// The first visit, as the PC game greets a new player: The Entity asks whether they are new; a new
// player hears of its world and picks the side to learn first, and goes straight into that side's
// first tutorial chapter (EntityWelcome). Once seen (or skipped) it is remembered on this device;
// Settings → Data shows it again.

import { reactive } from 'vue'

const KEY = 'dbdl-welcomed'

export const welcome = reactive({ open: false })

export function welcomed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    // storage blocked: never greet, or it would greet on every visit
    return true
  }
}

/** Seen: not shown by itself again. */
export function markWelcomed() {
  try {
    localStorage.setItem(KEY, '1')
  } catch {
    // storage blocked: nothing to remember
  }
}

export function openWelcome() {
  welcome.open = true
}
