<script setup lang="ts">
// The history of online games kept on this device (history.ts): the list, newest first, and a
// game opened — who played what, the result, the stats, the headline events and the whole log
// round by round.
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { killerById, survivorById } from '../../data'
import { asset } from '../../i18n'
import { sfx } from '../../sound'
import BpText from '../../components/BpText.vue'
import { boards } from '../engine/boards'
import { deleteHistory, getHistory, KEEP, listHistory, type HistoryGame, type HistoryHead } from '../history'
import { diceFaces } from '../labels'
import Mini from '../components/Mini.vue'
import ModalShell from '../components/ModalShell.vue'
import { downloadReport, fetchReport, parseReportId, reportError, sendReport } from '../report'
import type { Report } from '../online/transport'

const route = useRoute()
const router = useRouter()

const heads = ref<HistoryHead[] | null>(null)
const opened = ref<HistoryGame | null>(null)
const failed = ref(false)

async function loadList() {
  try {
    heads.value = await listHistory()
  } catch {
    failed.value = true
    heads.value = []
  }
}
void loadList()

const openId = computed(() => (typeof route.query.id === 'string' ? route.query.id : null))
/** A report opened by its id (#/history?report=RP-…): the game it carries, read-only. */
const reportId = computed(() => (typeof route.query.report === 'string' ? parseReportId(route.query.report) : null))
const report = ref<Report | null>(null)
const loading = ref(false)
/** A report's game: its whole log from the state (nothing masked), for finding the bug. */
const fullLog = ref(false)
watch(
  [openId, reportId],
  async ([id, rid]) => {
    report.value = null
    fullLog.value = false
    if (rid) {
      loading.value = true
      const r = await fetchReport(rid).catch(() => null)
      loading.value = false
      report.value = r?.report ?? null
      opened.value = r?.game ?? null
      return
    }
    opened.value = id ? await getHistory(id).catch(() => null) : null
  },
  { immediate: true },
)
const showing = computed(() => !!openId.value || !!reportId.value)

/** The list's box: open a report by its id. */
const typedId = ref('')
const typedOk = computed(() => parseReportId(typedId.value))
function openReport() {
  if (!typedOk.value) return
  sfx.click()
  void router.push({ path: '/history', query: { report: typedOk.value } })
}

function openGame(id: string) {
  sfx.click()
  void router.push({ path: '/history', query: { id } })
}
function backToList() {
  sfx.click()
  void router.push({ path: '/history' })
}
const confirmDelete = ref(false)
async function remove(id: string) {
  if (!confirmDelete.value) {
    confirmDelete.value = true
    return
  }
  confirmDelete.value = false
  await deleteHistory(id)
  await loadList()
  backToList()
}
watch(openId, () => (confirmDelete.value = false))

// ---------- what shows ----------
const survivorMini = (id: string) => survivorById.get(id)?.images.mini ?? ''
const killerMini = (id: string) => killerById.get(id)?.images.mini ?? ''
const boardName = (b: string) => boards[b]?.name ?? b
const scene = (b: string) => `assets/app/background-img/background_${b}.webp`
const MODES: Record<string, string> = { adept: 'Adept', bloodweb: 'Bloodweb', devout: 'Devout' }
const when = (at: number) => new Date(at).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' })

/** This device's result: won, lost, or watched. */
function result(h: HistoryHead): 'win' | 'loss' | 'watch' {
  if (h.side === 'spectator') return 'watch'
  return (h.side === 'killer') === (h.winner === 'killer') ? 'win' : 'loss'
}
const RESULT_TH = { win: 'ชนะ', loss: 'แพ้', watch: 'ดู' } as const
const winnerLine = (h: HistoryHead) => (h.winner === 'survivors' ? 'ผู้รอดชีวิตหนีรอด' : `${h.killer.name} สังเวยครบ 8`)

const stateLog = computed<HistoryGame['log'] | null>(() => {
  const s = opened.value?.state
  if (!s) return null
  try {
    return (JSON.parse(s) as { log: HistoryGame['log'] }).log.filter((e) => e.text)
  } catch {
    return null
  }
})

// the opened game: its log by round
const rounds = computed(() => {
  const g = opened.value
  if (!g) return []
  const out: { round: number; lines: HistoryGame['log'] }[] = []
  for (const e of fullLog.value && stateLog.value ? stateLog.value : g.log) {
    // the "— round N —" line: the round's own heading says it
    if (e.ev?.k === 'round') continue
    const last = out[out.length - 1]
    if (last && last.round === e.round) last.lines.push(e)
    else out.push({ round: e.round, lines: [e] })
  }
  return out
})
const openRounds = ref<Set<number>>(new Set())
watch(opened, () => (openRounds.value = new Set(rounds.value.length ? [rounds.value[rounds.value.length - 1].round] : [])))
function toggleRound(r: number) {
  const s = new Set(openRounds.value)
  if (s.has(r)) s.delete(r)
  else s.add(r)
  openRounds.value = s
}
const allOpen = computed(() => rounds.value.length > 0 && rounds.value.every((r) => openRounds.value.has(r.round)))
function toggleAll() {
  openRounds.value = allOpen.value ? new Set() : new Set(rounds.value.map((r) => r.round))
}

/** A log line's face: the survivor's or the killer's mini, or The Entity for the game. */
function lineFace(g: HistoryGame, who: number | 'killer' | 'game'): string {
  if (who === 'killer') return killerMini(g.head.killer.id)
  if (who === 'game') return 'assets/tokens/entity.webp'
  return survivorMini(g.head.survivors[who]?.id ?? '')
}

// ---------- a problem report to the developer ----------
const reporting = ref(false)
const note = ref('')
const noteRound = ref(0)
const sending = ref(false)
const sentId = ref('')
const sendError = ref('')
const copied = ref(false)
function openReporting() {
  sfx.click()
  note.value = ''
  noteRound.value = 0
  sentId.value = ''
  sendError.value = ''
  reporting.value = true
}
async function send() {
  const g = opened.value
  if (!g || note.value.trim().length < 5 || sending.value) return
  sending.value = true
  sendError.value = ''
  try {
    sentId.value = await sendReport(g, note.value, noteRound.value)
    g.reported = sentId.value
    sfx.select()
  } catch (e) {
    console.warn('report: not sent (database.rules.json needs "reports")', e)
    sendError.value = reportError(e)
  } finally {
    sending.value = false
  }
}
function download() {
  if (opened.value) downloadReport(opened.value, note.value || '(ไม่ได้เขียน)', noteRound.value)
}
async function copyId(id: string) {
  try {
    await navigator.clipboard.writeText(id)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    // no clipboard: the id is on screen to copy by hand
  }
}

const SURVIVOR_COLS = [
  { key: 'repair', label: 'ซ่อม' },
  { key: 'gensDone', label: 'Gen เสร็จ' },
  { key: 'rescues', label: 'ช่วย' },
  { key: 'heals', label: 'รักษา' },
  { key: 'wounded', label: 'บาดเจ็บ' },
  { key: 'hooked', label: 'โดนแขวน' },
  { key: 'bp', label: '▲ ที่ได้' },
] as const
const KILLER_COLS = [
  { key: 'hits', label: 'ทำร้าย' },
  { key: 'pickUps', label: 'อุ้ม' },
  { key: 'hooks', label: 'แขวน' },
  { key: 'damaged', label: 'ทำลาย Gen' },
  { key: 'breaks', label: 'ทุบ' },
  { key: 'bp', label: '▲ ที่ได้' },
] as const
</script>

<template>
  <div class="history">
    <!-- ================= a game (or a report's) ================= -->
    <template v-if="showing">
      <button type="button" class="back" @click="backToList">◂ ประวัติทั้งหมด</button>
      <p v-if="loading" class="muted">กำลังโหลดรายงาน…</p>
      <p v-else-if="!opened" class="muted">{{ reportId ? 'ไม่พบรายงาน ' + reportId : 'ไม่พบเกมนี้ในเครื่อง' }}</p>
      <template v-else>
        <!-- a report: what its sender said -->
        <section v-if="report" class="report-box">
          <p class="eyebrow">รายงานปัญหา · {{ reportId }}</p>
          <p class="report-note">{{ report.note }}</p>
          <small>{{ report.round ? 'รอบ ' + report.round + ' · ' : '' }}ส่งเมื่อ {{ report.at ? when(report.at) : '-' }} · แอป {{ report.app }}</small>
          <small class="ua">{{ report.ua }}</small>
        </section>
        <!-- this device's game: report a problem in it -->
        <div v-else class="report-bar">
          <span v-if="opened.reported" class="reported">✓ ส่งรายงานแล้ว: <b>{{ opened.reported }}</b> <button type="button" class="small" @click="copyId(opened.reported)">{{ copied ? '✓ คัดลอกแล้ว' : 'คัดลอก' }}</button></span>
          <button type="button" class="report-btn" @click="openReporting">🐞 รายงานปัญหาในเกมนี้</button>
        </div>
        <header class="hero" :class="[opened.head.winner, result(opened.head)]" :style="{ backgroundImage: `url(${asset(scene(opened.head.board))})` }">
          <div class="hero-text">
            <p class="eyebrow">{{ when(opened.head.at) }} · {{ boardName(opened.head.board) }} · {{ MODES[opened.head.mode] ?? opened.head.mode }} · {{ opened.head.rounds }} รอบ</p>
            <h1>{{ opened.head.winner === 'survivors' ? 'หนีรอด' : 'ถูกสังเวย' }} <span class="result">{{ RESULT_TH[result(opened.head)] }}</span></h1>
            <p>{{ winnerLine(opened.head) }} · ห้อง {{ opened.head.roomName || opened.head.room }}</p>
          </div>
        </header>

        <section class="cast">
          <div class="who killer" :class="{ me: opened.head.seat === opened.head.killer.seat, won: opened.head.winner === 'killer' }">
            <Mini class="face aura-killer" :src="asset(killerMini(opened.head.killer.id))" />
            <strong>{{ opened.head.killer.name }}</strong>
            <small>{{ opened.head.killer.player }}{{ opened.head.seat === opened.head.killer.seat ? ' (คุณ)' : '' }}</small>
          </div>
          <span class="vs">VS</span>
          <div v-for="(sv, i) in opened.head.survivors" :key="i" class="who" :class="{ me: opened.head.seat === sv.seat, won: opened.head.winner === 'survivors' }">
            <Mini class="face aura-survivor" :src="asset(survivorMini(sv.id))" />
            <strong>{{ sv.name }}</strong>
            <small>{{ sv.player }}{{ opened.head.seat === sv.seat ? ' (คุณ)' : '' }}</small>
          </div>
        </section>

        <section class="panel">
          <h2>สถิติ</h2>
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ผู้รอดชีวิต</th>
                  <th v-for="c in SURVIVOR_COLS" :key="c.key">{{ c.label }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(sv, i) in opened.head.survivors" :key="i" :class="{ me: opened.head.seat === sv.seat }">
                  <td>{{ sv.name }}</td>
                  <td v-for="c in SURVIVOR_COLS" :key="c.key">{{ opened.stats.survivors[i]?.[c.key] ?? 0 }}</td>
                </tr>
              </tbody>
            </table>
            <table>
              <thead>
                <tr>
                  <th>ฆาตกร</th>
                  <th v-for="c in KILLER_COLS" :key="c.key">{{ c.label }}</th>
                </tr>
              </thead>
              <tbody>
                <tr :class="{ me: opened.head.seat === opened.head.killer.seat }">
                  <td>{{ opened.head.killer.name }}</td>
                  <td v-for="c in KILLER_COLS" :key="c.key">{{ opened.stats.killer[c.key] ?? 0 }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section v-if="opened.timeline.length" class="panel">
          <h2>เหตุการณ์สำคัญ</h2>
          <ol class="timeline">
            <li v-for="(t, i) in opened.timeline" :key="i" :class="`t-${t.tone}`">
              <span class="r">รอบ {{ t.round }}</span>
              <span><BpText :text="t.text" /></span>
            </li>
          </ol>
        </section>

        <section class="panel">
          <div class="log-head">
            <h2>บันทึกทั้งเกม</h2>
            <span class="log-tools">
              <label v-if="report && stateLog" class="full"><input v-model="fullLog" type="checkbox" /> log เต็ม (ไม่ปิด item)</label>
              <button type="button" class="small" @click="toggleAll">{{ allOpen ? 'ย่อทุกรอบ' : 'เปิดทุกรอบ' }}</button>
            </span>
          </div>
          <div v-for="r in rounds" :key="r.round" class="round">
            <button type="button" class="round-head" :aria-expanded="openRounds.has(r.round)" @click="toggleRound(r.round)">
              <span>{{ r.round === 0 ? 'เตรียมเกม' : `รอบ ${r.round}` }}</span>
              <small>{{ r.lines.length }} รายการ {{ openRounds.has(r.round) ? '▴' : '▾' }}</small>
            </button>
            <ul v-if="openRounds.has(r.round)" class="lines">
              <li v-for="(e, i) in r.lines" :key="i" :class="typeof e.who === 'number' ? 'survivor' : e.who === 'game' ? 'sys' : 'killer'">
                <Mini v-if="e.who !== 'game'" class="line-face" :src="asset(lineFace(opened, e.who))" />
                <img v-else class="line-face token" :src="asset(lineFace(opened, e.who))" alt="" />
                <span class="line-text"><BpText :text="e.text" /></span>
                <span v-if="e.dice?.length" class="dice" :title="`ลูกเต๋า: ${diceFaces(e.dice)}`">🎲 {{ diceFaces(e.dice) }}</span>
              </li>
            </ul>
          </div>
        </section>

        <p v-if="!report" class="foot">
          <button type="button" :class="{ danger: confirmDelete }" @click="remove(opened.head.id)">{{ confirmDelete ? 'ยืนยัน ลบเกมนี้' : 'ลบเกมนี้จากประวัติ' }}</button>
        </p>
      </template>

      <ModalShell :open="reporting" title="🐞 รายงานปัญหาถึงผู้พัฒนา" width="560px" @close="reporting = false">
        <template v-if="!sentId">
          <p class="lead">เล่าว่าเกิดอะไรขึ้น ผิดจากที่ควรเป็นยังไง — ผู้พัฒนาจะดูประกอบกับบันทึกของเกมนี้</p>
          <textarea v-model="note" rows="5" maxlength="2000" placeholder="เช่น Meg มี Vile Purge 2 อัน เข้า Locker แล้วหายหมดทั้ง 2 อัน ทั้งที่ควรหายแค่ 1 อัน" />
          <label class="round-pick">
            เกิดในรอบที่
            <select v-model.number="noteRound">
              <option :value="0">ไม่แน่ใจ</option>
              <option v-for="r in opened?.head.rounds ?? 0" :key="r" :value="r">{{ r }}</option>
            </select>
          </label>
          <p class="small muted">ที่ส่งไป: บันทึกและสถานะของเกมนี้ทั้งหมด ชื่อผู้เล่นในเกม เวอร์ชันแอป และชนิดเบราว์เซอร์ — ไม่มีข้อมูลอื่นของเครื่องคุณ</p>
          <p v-if="opened && !opened.state" class="small warn">เกมนี้บันทึกก่อนเวอร์ชัน 1.17.0: มีแค่บันทึกการกระทำ ไม่มีสถานะเกมเต็ม</p>
          <p v-if="sendError" class="error">{{ sendError }}</p>
        </template>
        <template v-else>
          <p class="lead">ส่งแล้ว ขอบคุณที่ช่วยรายงาน — บอกรหัสนี้กับผู้พัฒนา:</p>
          <p class="sent-id">{{ sentId }}</p>
          <button type="button" class="primary" @click="copyId(sentId)">{{ copied ? '✓ คัดลอกแล้ว' : '📋 คัดลอกรหัส' }}</button>
        </template>
        <template #footer>
          <template v-if="!sentId">
            <button type="button" class="quiet" @click="download">ดาวน์โหลดไฟล์แทน</button>
            <button type="button" @click="reporting = false">ยกเลิก</button>
            <button type="button" class="primary" :disabled="note.trim().length < 5 || sending" @click="send">{{ sending ? 'กำลังส่ง…' : 'ส่งรายงาน' }}</button>
          </template>
          <button v-else type="button" @click="reporting = false">ปิด</button>
        </template>
      </ModalShell>
    </template>

    <!-- ================= the list ================= -->
    <template v-else>
      <header class="list-head">
        <div>
          <p class="eyebrow">Online</p>
          <h1>ประวัติเกม</h1>
          <p class="muted">เกมออนไลน์ที่เล่นจบบนเครื่องนี้ {{ KEEP }} เกมล่าสุด — เก็บในเครื่องเท่านั้น</p>
        </div>
      </header>
      <p v-if="heads === null" class="muted">กำลังโหลด…</p>
      <p v-else-if="failed" class="muted">เบราว์เซอร์นี้เก็บประวัติไม่ได้</p>
      <p v-else-if="!heads.length" class="empty">ยังไม่มีเกมในประวัติ — เล่นเกมออนไลน์ให้จบสักเกม แล้วจะมาอยู่ที่นี่</p>
      <ul v-else class="games">
        <li v-for="h in heads" :key="h.id">
          <button type="button" class="game" :class="[result(h), h.winner]" @click="openGame(h.id)">
            <span class="thumb" :style="{ backgroundImage: `url(${asset(scene(h.board))})` }" aria-hidden="true">
              <b class="badge">{{ RESULT_TH[result(h)] }}</b>
            </span>
            <span class="info">
              <strong>{{ h.winner === 'survivors' ? 'หนีรอด' : 'ถูกสังเวย' }} · {{ boardName(h.board) }}</strong>
              <small>{{ when(h.at) }} · {{ h.rounds }} รอบ · {{ MODES[h.mode] ?? h.mode }} · ห้อง {{ h.roomName || h.room }}</small>
              <span class="faces">
                <Mini class="mini aura-killer" :class="{ me: h.seat === h.killer.seat }" :src="asset(killerMini(h.killer.id))" :title="`${h.killer.name} — ${h.killer.player}`" />
                <span class="vs">vs</span>
                <Mini v-for="(sv, i) in h.survivors" :key="i" class="mini" :class="{ me: h.seat === sv.seat }" :src="asset(survivorMini(sv.id))" :title="`${sv.name} — ${sv.player}`" />
              </span>
            </span>
          </button>
        </li>
      </ul>
      <!-- a report sent from another device, by its id -->
      <form class="open-report" @submit.prevent="openReport">
        <small>มีรหัสรายงาน?</small>
        <input v-model="typedId" placeholder="RP-XXXX-XXXX-XXXX" maxlength="20" aria-label="รหัสรายงาน" />
        <button type="submit" :disabled="!typedOk">เปิดดู</button>
      </form>
    </template>
  </div>
</template>

<style scoped>
.history {
  width: min(1000px, 100%);
  margin: 0 auto;
  padding: 1.2rem 1rem 3rem;
  display: grid;
  gap: 1rem;
}
.eyebrow {
  margin: 0;
  font-family: var(--font-display);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--blood-bright, #e0323a);
  font-size: 0.8rem;
}
h1 {
  margin: 0.1rem 0;
  font-family: var(--font-display);
}
h2 {
  margin: 0 0 0.6rem;
  font-size: 1.05rem;
}
.muted,
small {
  color: var(--muted);
}
.list-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
}
.empty {
  padding: 2rem 1rem;
  border: 1px dashed var(--line-strong);
  border-radius: 10px;
  text-align: center;
  color: var(--muted);
}
.games {
  display: grid;
  gap: 0.6rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.game {
  --tone: 217 162 39;
  display: grid;
  grid-template-columns: 170px 1fr;
  gap: 0.9rem;
  width: 100%;
  padding: 0.5rem;
  text-align: left;
  border: 1px solid rgb(var(--tone) / 0.35);
  border-left: 4px solid rgb(var(--tone));
  border-radius: 10px;
  background: linear-gradient(90deg, rgb(var(--tone) / 0.12), rgb(0 0 0 / 0.4));
}
.game.loss {
  --tone: 224 50 58;
}
.game.watch {
  --tone: 150 150 160;
}
.game:hover {
  box-shadow: 0 0 18px rgb(var(--tone) / 0.35);
}
.thumb {
  position: relative;
  min-height: 92px;
  border-radius: 6px;
  background: center / cover no-repeat;
}
.badge {
  position: absolute;
  left: 0.4rem;
  top: 0.4rem;
  padding: 0.05rem 0.55rem;
  border-radius: 999px;
  background: rgb(var(--tone));
  color: #111;
  font-size: 0.8rem;
}
.info {
  display: grid;
  gap: 0.25rem;
  align-content: center;
}
.faces {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  margin-top: 0.2rem;
}
.faces .mini {
  width: 34px;
  height: 34px;
}
.faces .mini.me {
  box-shadow: 0 0 0 2px #ffd56a;
}
.vs {
  font-family: var(--font-display);
  color: var(--muted);
  font-size: 0.8rem;
}
.back {
  justify-self: start;
}
.hero {
  position: relative;
  min-height: 170px;
  display: flex;
  align-items: flex-end;
  padding: 1.2rem;
  border-radius: 12px;
  background: center / cover no-repeat;
  overflow: hidden;
}
.hero::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(0deg, rgb(0 0 0 / 0.85), rgb(0 0 0 / 0.25));
}
.hero.killer::before {
  background: linear-gradient(0deg, rgb(70 6 10 / 0.9), rgb(0 0 0 / 0.25));
}
.hero-text {
  position: relative;
}
.hero h1 {
  font-size: 2rem;
}
.result {
  margin-left: 0.4rem;
  padding: 0.1rem 0.7rem;
  border-radius: 999px;
  font-size: 1rem;
  vertical-align: middle;
  background: #d9a227;
  color: #111;
}
.hero.loss .result {
  background: #e0323a;
  color: #fff;
}
.hero.watch .result {
  background: #888;
}
.cast {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 0.8rem;
}
.who {
  display: grid;
  justify-items: center;
  gap: 0.15rem;
  width: 120px;
  text-align: center;
  opacity: 0.75;
}
.who.won {
  opacity: 1;
}
.who .face {
  width: 64px;
  height: 64px;
}
.who.me .face {
  box-shadow: 0 0 0 3px #ffd56a;
}
.panel {
  padding: 1rem;
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  background: rgb(12 13 16 / 0.85);
}
.table-wrap {
  display: grid;
  gap: 0.8rem;
  overflow-x: auto;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
th,
td {
  padding: 0.35rem 0.5rem;
  text-align: center;
  border-bottom: 1px solid var(--line);
  white-space: nowrap;
}
th:first-child,
td:first-child {
  text-align: left;
}
tr.me td {
  color: #ffe9b0;
  font-weight: 700;
}
.timeline {
  display: grid;
  gap: 0.3rem;
  margin: 0;
  padding: 0;
  list-style: none;
}
.timeline li {
  display: grid;
  grid-template-columns: 4.5rem 1fr;
  gap: 0.5rem;
  padding: 0.3rem 0.5rem;
  border-left: 3px solid #d9a227;
  background: rgb(255 255 255 / 0.03);
}
.timeline li.t-killer {
  border-left-color: #e0323a;
}
.timeline li.t-game {
  border-left-color: #888;
}
.timeline .r {
  color: var(--muted);
  font-size: 0.85rem;
}
.log-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.round {
  border-top: 1px solid var(--line);
}
.round-head {
  display: flex;
  justify-content: space-between;
  width: 100%;
  padding: 0.55rem 0.2rem;
  border: none;
  background: none;
  font-weight: 700;
}
.lines {
  display: grid;
  gap: 0.2rem;
  margin: 0 0 0.6rem;
  padding: 0;
  list-style: none;
}
.lines li {
  display: grid;
  grid-template-columns: 28px 1fr auto;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.4rem;
  border-radius: 6px;
  font-size: 0.9rem;
}
.lines li.killer {
  background: rgb(224 50 58 / 0.08);
}
.lines li.sys {
  color: var(--muted);
}
.line-face {
  width: 28px;
  height: 28px;
}
.line-face.token {
  object-fit: contain;
}
.dice {
  white-space: nowrap;
  font-size: 0.8rem;
  color: var(--muted);
}
.foot {
  text-align: right;
}
.report-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.6rem;
}
.report-btn {
  border-color: #d9a227;
}
.reported {
  color: #8fd19e;
  font-size: 0.9rem;
}
.report-box {
  display: grid;
  gap: 0.35rem;
  padding: 1rem;
  border: 1px solid #d9a227;
  border-radius: 10px;
  background: rgb(217 162 39 / 0.08);
}
.report-note {
  margin: 0;
  white-space: pre-wrap;
  font-size: 1.05rem;
}
.ua {
  font-size: 0.7rem;
  overflow-wrap: anywhere;
}
.log-tools {
  display: flex;
  align-items: center;
  gap: 0.7rem;
}
.full {
  font-size: 0.85rem;
  color: #ffd56a;
}
.lead {
  margin: 0 0 0.6rem;
}
textarea {
  width: 100%;
  resize: vertical;
  font: inherit;
}
.round-pick {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.6rem 0;
}
.warn {
  color: #ffd56a;
}
.error {
  color: #ff8a80;
}
.sent-id {
  margin: 0.4rem 0 0.8rem;
  font-family: var(--font-display);
  font-size: 1.6rem;
  letter-spacing: 0.08em;
  color: #ffd56a;
}
.quiet {
  margin-right: auto;
  background: transparent;
}
.open-report {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  opacity: 0.8;
}
.open-report input {
  width: 13rem;
}
.danger {
  border-color: #e04a3f;
  color: #ffb3ab;
}
@media (max-width: 640px) {
  .game {
    grid-template-columns: 1fr;
  }
}
</style>
