// How a perk's Thai text is lit, everywhere it shows: the game's panels, the companion's pages and
// the Thai perk card images (drawn from these same rules). Game terms in bold white (English names
// in the Thai text — Interact, Skill Check, Danger Die — the Thai words for the pieces of the game,
// numbers), props in their category's colour (as their tiles' backs), failures and wounds in red,
// successes in green, a great success in gold, ▲ as the token. No imports: the card script loads it.

export type PropCategory = 'objective' | 'survival' | 'altruism' | 'boldness'
export type HighlightKind = 'term' | 'num' | 'bad' | 'good' | 'great' | 'bp' | 'token' | 'plain' | PropCategory

/** The colour of each kind (bold, on a dark ground); the plain text keeps its own. */
export const HIGHLIGHT_COLORS: Record<Exclude<HighlightKind, 'plain' | 'token'>, string> = {
  term: '#f4f4f4',
  num: '#f4f4f4',
  bp: '#e8232a',
  bad: '#ff5a4f',
  good: '#8fe36a',
  great: '#f5c04a',
  objective: '#f0b545',
  survival: '#5aa8ff',
  altruism: '#3fcf6a',
  boldness: '#ff4f5e',
}

const BAD = ['ล้มเหลว', 'บาดเจ็บ', 'สังเวย', 'ถูกแขวน']
const GREAT = ['สำเร็จยอดเยี่ยม', 'สำเร็จอย่างยิ่ง']
const GOOD = ['สำเร็จ', 'หายบาดเจ็บ', 'ไม่บาดเจ็บ']
/** Props, by the colour of their category (and the colour itself, as "prop สีเหลือง" names it). */
const PROPS: Record<PropCategory, string[]> = {
  objective: ['เครื่องปั่นไฟ', 'ประตูทางออก', 'สีเหลือง'],
  survival: ['กล่องไอเทม', 'ตู้หลบ', 'ตู้เก็บของ', 'สีน้ำเงิน'],
  altruism: ['อีกา', 'แผ่นพาเลท', 'พาเลท', 'สีเขียว'],
  boldness: ['ตะขอแขวน', 'ตะขอ', 'โทเท็มคำสาป', 'โทเท็ม', 'สีแดง'],
}
const PROP_OF = new Map(Object.entries(PROPS).flatMap(([c, ws]) => ws.map((w) => [w, c as PropCategory])))
const TERMS = ['ผู้รอดชีวิต', 'ฆาตกร', 'การ์ดเคลื่อนที่', 'เส้นทาง', 'ไอเทม', 'กำแพง', 'ความคืบหน้า', 'เทิร์น', 'เฟส']

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// longest first, so "หายบาดเจ็บ" wins over "บาดเจ็บ" and "ตะขอแขวน" over "ตะขอ"
const words = [...GREAT, ...GOOD, ...BAD, ...PROP_OF.keys(), ...TERMS].sort((a, b) => b.length - a.length).map(escape)
// ▲, numbers, runs of English words ("Skill Check", "Danger Die", "Hex Totem"), the Thai words
const PATTERN = new RegExp(`(▲|\\d+|[A-Za-z][A-Za-z'’&-]*(?: [A-Z][A-Za-z'’&-]*)*|${words.join('|')})`, 'g')
const THAI = /[฀-๿]/

function kindOf(t: string): HighlightKind {
  if (t === '▲') return 'bp'
  if (/^\d+$/.test(t)) return 'num'
  if (GREAT.includes(t)) return 'great'
  if (GOOD.includes(t)) return 'good'
  if (BAD.includes(t)) return 'bad'
  return PROP_OF.get(t) ?? 'term'
}

/**
 * A perk's (or power's, or passive's) text cut into lit and plain parts: "{BP}" taken as ▲, any
 * other "{NAME}" a token (kind 'token', its NAME: tokenIcons.ts). English names in it go through
 * `rename` (their Thai names: thaiName). An English text (the companion in English) is left plain but
 * for ▲ and tokens: every word of it would be a "term".
 */
export function highlightPerkText(text: string, rename?: (en: string) => string | undefined): { t: string; kind: HighlightKind }[] {
  const thai = THAI.test(text)
  return text
    .replaceAll('{BP}', '▲')
    .split(/\{([A-Z_]+)\}/)
    .flatMap((chunk, i) => (i % 2 === 1 ? [{ t: chunk, kind: 'token' as HighlightKind }] : highlightChunk(chunk, thai, rename)))
}

function highlightChunk(s: string, thai: boolean, rename?: (en: string) => string | undefined): { t: string; kind: HighlightKind }[] {
  // split() with a capturing pattern alternates: plain text, a match, plain text, a match…
  const parts = thai
    ? s.split(PATTERN).map((t, i) => (i % 2 === 1 ? { t: (/^[A-Za-z]/.test(t) && rename?.(t)) || t, kind: kindOf(t) } : { t, kind: 'plain' as HighlightKind }))
    : s.split(/(▲)/).map((t) => ({ t, kind: (t === '▲' ? 'bp' : 'plain') as HighlightKind }))
  return parts.filter((p) => p.t !== '')
}
