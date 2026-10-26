// The full game (Online and Offline) is made for a computer or a tablet: the board, the side
// panel and the player tiles need a big screen. Phones get a notice instead; the card
// and rules pages still work on them.

/** Narrower than the smallest iPad (iPad mini: 744 px) on its short side: a phone. */
const PHONE_MAX = 700

/** The device's screen, not the window: a small desktop window is still a computer. */
export function isPhone(): boolean {
  if (typeof screen === 'undefined') return false
  return Math.min(screen.width, screen.height) < PHONE_MAX
}
