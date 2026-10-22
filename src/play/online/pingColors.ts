// The colours a player's pings come in. Picked in the lobby from this fixed set, one per member,
// so two rings on the map never look alike (a free colour picker would allow near-twins).

import type { Member } from './transport'

export interface PingColor {
  id: string
  /** Thai name, for the picker's tooltip. */
  name: string
  hex: string
}

export const PING_COLORS: PingColor[] = [
  { id: 'gold', name: 'ทอง', hex: '#ffd23f' },
  { id: 'cyan', name: 'ฟ้า', hex: '#3fd8ff' },
  { id: 'lime', name: 'เขียว', hex: '#7dff4f' },
  { id: 'pink', name: 'ชมพู', hex: '#ff5fc8' },
  { id: 'violet', name: 'ม่วง', hex: '#a77bff' },
  { id: 'orange', name: 'ส้ม', hex: '#ff9a2e' },
  { id: 'white', name: 'ขาว', hex: '#f4f4f4' },
  { id: 'red', name: 'แดง', hex: '#ff3b3b' },
]

export const pingHex = (id: string | undefined) => PING_COLORS.find((c) => c.id === id)?.hex ?? PING_COLORS[0].hex

/**
 * Every member's colour: their own pick, and for a member without one (a room from before
 * pings, or more members than colours) the first one nobody holds, in join order.
 */
export function memberColors(members: Record<string, Member>): Record<string, string> {
  const out: Record<string, string> = {}
  const taken = new Set<string>()
  const order = Object.entries(members).sort(([, a], [, b]) => a.joinedAt - b.joinedAt)
  for (const [id, m] of order)
    if (m.color && !taken.has(m.color)) {
      out[id] = m.color
      taken.add(m.color)
    }
  for (const [id] of order) {
    if (out[id]) continue
    const free = PING_COLORS.find((c) => !taken.has(c.id)) ?? PING_COLORS[0]
    out[id] = free.id
    taken.add(free.id)
  }
  return out
}

/** A colour for someone joining: the first one nobody in the room holds. */
export function freeColor(members: Record<string, Member>): string {
  const taken = new Set(Object.values(memberColors(members)))
  return (PING_COLORS.find((c) => !taken.has(c.id)) ?? PING_COLORS[0]).id
}
