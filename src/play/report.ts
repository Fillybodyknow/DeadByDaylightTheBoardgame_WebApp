// Problem reports to the developer, from the game history: the player says what went wrong, and
// the game as this device kept it goes with it (its whole last state included, for finding the
// bug). Sent to the room's backend under a random id (`RP-XXXX-XXXX-XXXX`) that only this player
// learns: they pass it on, and the report is read back by it (#/history?report=<id>). The list of
// reports can't be read. A file to download stands in when sending fails.

import { backend, session } from './online/session'
import type { Report } from './online/transport'
import { markReported, type HistoryGame } from './history'
import { APP_BUILT, APP_VERSION } from '../version'

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no 0/O, 1/I/L

function newReportId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(12))
  const ch = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('')
  return `RP-${ch.slice(0, 4)}-${ch.slice(4, 8)}-${ch.slice(8, 12)}`
}

/** A report id as typed (spaces, lower case), or null when it isn't one. */
export function parseReportId(s: string): string | null {
  const id = s.trim().toUpperCase().replace(/\s+/g, '')
  return /^RP-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(id) ? id : null
}

function reportOf(g: HistoryGame, note: string, round: number): Report {
  return {
    from: session.me,
    app: `${APP_VERSION} ${APP_BUILT}`.slice(0, 80),
    note: note.trim().slice(0, 2000),
    round,
    ua: navigator.userAgent.slice(0, 400),
    game: JSON.stringify(g),
  }
}

/** Send a report about game `g`: its id (also marked on the game in the history). */
export async function sendReport(g: HistoryGame, note: string, round: number): Promise<string> {
  if (!backend.sendReport) throw new Error('this backend takes no reports')
  const id = newReportId()
  await backend.sendReport(id, reportOf(g, note, round))
  await markReported(g.head.id, id).catch(() => {})
  return id
}

/** The same report as a file to download (when sending fails, to pass on by hand). */
export function downloadReport(g: HistoryGame, note: string, round: number) {
  const blob = new Blob([JSON.stringify({ ...reportOf(g, note, round), at: Date.now() })], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  const day = new Date(g.head.at).toISOString().slice(0, 10)
  a.download = `dbdl-report-${day}-${g.head.room || 'game'}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/** A report by its id, with its game (null: no such report, or it can't be read). */
export async function fetchReport(id: string): Promise<{ report: Report; game: HistoryGame } | null> {
  const r = await backend.fetchReport?.(id)
  if (!r) return null
  return { report: r, game: JSON.parse(r.game) as HistoryGame }
}

/** Why sending failed, in Thai. */
export function reportError(e: unknown): string {
  const msg = String((e as Error)?.message ?? e)
  if (/permission|PERMISSION_DENIED/i.test(msg)) return 'ส่งไม่ได้: เพิ่งส่งไปไม่ถึง 1 นาที หรือเซิร์ฟเวอร์ยังไม่รองรับรายงาน — ลองใหม่อีกครั้ง หรือดาวน์โหลดไฟล์แทน'
  return 'ส่งไม่ได้: ตรวจการเชื่อมต่ออินเทอร์เน็ต แล้วลองใหม่ หรือดาวน์โหลดไฟล์แทน'
}
