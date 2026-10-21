// What changed in each release, newest first, for the "what's new" panel. Add an entry here
// with every version bump in package.json (the panel lists what is newer than the version a
// player last saw).

export interface Release {
  version: string
  /** ISO date. */
  date: string
  /** One short Thai line per change a player would notice. */
  items: string[]
}

export const CHANGELOG: Release[] = [
  {
    version: '1.1.2',
    date: '2026-10-21',
    items: ['แอนิเมชัน Sacrifice Progress ใช้โทเคนเดียวกับ HUD ขยายกลางจอ วงแหวนแบ่ง 8 ช่อง ช่องใหม่เติมสีทองทีละช่องและตัวเลขนับขึ้น'],
  },
  {
    version: '1.1.1',
    date: '2026-10-21',
    items: ['แท็บเล็ต: มือไพ่พับลงไว้ก่อน แตะครั้งแรกยกขึ้น แตะอีกครั้งเลือกไพ่ แตะที่อื่นเพื่อพับกลับ'],
  },
  {
    version: '1.1.0',
    date: '2026-10-21',
    items: [
      'มีเลขเวอร์ชันบนหน้าเมนู — และแอปบอกเมื่อมีเวอร์ชันใหม่ให้โหลดซ้ำ',
      'สร้างห้อง / ใส่รหัสผ่านเป็นหน้าต่างของตัวเอง และปิดทันทีเมื่อเข้าห้องแล้ว',
      'ไอคอน Perk ที่การ์ดผู้เล่นใหญ่ขึ้น',
      'ไอเท็มที่ต้องกดใช้ดูออกทันทีว่ากดได้ (กรอบทอง + ข้อความ) ส่วนที่ยังใช้ไม่ได้จะหม่นลง',
      'ปุ่ม Perk ในแผงด้านขวา (เช่น Balanced Landing) เด่นขึ้น มีคำบอกว่าให้เลือก',
      'Host เตะผู้เล่นออกจากห้องใน Lobby ได้ (คนที่ถูกเตะเข้าห้องนั้นอีกไม่ได้)',
      'Firecracker ขวางฆาตกรไม่ให้เข้าห้องได้ทุกกรณี รวมถึงพลังที่ย้ายตัว',
      'ออนไลน์: แผงของผู้เล่นคนอื่นไม่กะพริบระหว่างแอนิเมชัน',
      'ทุกครั้งที่ฆาตกรได้ Sacrifice Progress มีแอนิเมชันขึ้นกลางจอ และตอนจบเกม (Sacrifice ครบ / ประตูทางออกเปิด) มีแอนิเมชันก่อนหน้าสรุปเกม',
      'ทอยห้องเริ่มต้นบนแผนที่ในเกมเลย ไม่มีหน้าต่างแยก — มินิลงทีละตัว',
      'แท็บเล็ต: แผงด้านขวาไม่ถูกไพ่บังปุ่มยืนยันอีก (ความสูงหน้าจอตามแถบเบราว์เซอร์)',
      'ห้องออนไลน์ที่ไม่มีคนใช้เกิน 3 วันถูกลบอัตโนมัติ และห้องที่ทุกคนออกจาก Lobby ปิดทันที',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-10-01',
    items: ['เวอร์ชันแรกที่มีเลขเวอร์ชัน: Online, Offline และ Companion'],
  },
]

/** Compare "1.2.3" style versions: negative when a is older than b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d) return d
  }
  return 0
}

/** The releases newer than `seen`, newest first. */
export function releasesSince(seen: string): Release[] {
  return CHANGELOG.filter((r) => compareVersions(r.version, seen) > 0)
}
