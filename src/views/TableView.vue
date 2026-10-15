<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import CharacterSheet from '../components/CharacterSheet.vue'
import ItemCard from '../components/ItemCard.vue'
import StartMap from '../components/StartMap.vue'
import StartRollIntro from '../components/StartRollIntro.vue'
import EndGame from '../components/EndGame.vue'
import { components, items, killerById, mapById, survivorById } from '../data'
import { asset } from '../i18n'
import { renderMd, rulesSections, searchRules } from '../rulesDoc'
import { loading } from '../loading'
import { useLobbyStore, type MiniKey } from '../stores/lobby'

const lobby = useLobbyStore()
const router = useRouter()
const s = computed(() => lobby.state)

const killer = computed(() => (s.value.killerPick ? killerById.get(s.value.killerPick) : undefined))
const map = computed(() => (s.value.mapId ? mapById.get(s.value.mapId) : undefined))

// Turn order from the first player marker (p.8); falls back to seat order.
const team = computed(() => {
  const first = s.value.firstPlayerSeat ?? 0
  return Array.from({ length: 4 }, (_, k) => (first + k) % 4).map((seat) => ({
    seat,
    character: survivorById.get(s.value.survivorPicks[seat] ?? ''),
    player: lobby.seatPlayerName(seat),
  }))
})

type Tab = 'killer' | `s${number}` | 'items' | 'quick' | 'search' | 'map'
const tab = ref<Tab>('killer')

// Arriving from "เริ่มเกม": play the start-room roll, survivors in turn order first, then the killer.
const route = useRoute()
// waits for the loading screen to finish so the heartbeat and dice don't play behind it
const showIntro = computed(() => route.query.intro === '1' && lobby.hasStartRolls && !!map.value && !loading.active)
const introMinis = computed(() => {
  const byKey = new Map(lobby.minis.map((m) => [m.key, m]))
  const order = [...team.value.map((m) => `s${m.seat}`), 'killer']
  return order.map((k) => byKey.get(k as (typeof lobby.minis)[number]['key'])!).filter(Boolean)
})

function endIntro() {
  tab.value = 'map'
  router.replace('/table')
}

// Sections of docs/rules-th.md worth having at hand mid-game.
const QUICK = [4, 5, 6, 7, 10, 8, 12]
const quickSections = computed(() =>
  QUICK.map((n) => rulesSections.find((x) => x.num === n)).filter((x): x is NonNullable<typeof x> => !!x),
)
const openQuick = ref<number | null>(4)

const query = ref('')
const results = computed(() => searchRules(query.value))

function highlight(html: string): string {
  const q = query.value.trim()
  if (!q) return html
  const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?![^<]*>)`, 'gi')
  return html.replace(re, '<mark>$1</mark>')
}

// Keep the screen on while the table is in use.
let wakeLock: { release: () => Promise<void> } | null = null
onMounted(async () => {
  try {
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    wakeLock = (await nav.wakeLock?.request('screen')) ?? null
  } catch {
    // not supported or denied: the screen may sleep
  }
})
onBeforeUnmount(() => {
  void wakeLock?.release()
})

// End of the trial: pick the winner, show the result, record it in the history.
const ending = ref(false)

function rematchNow() {
  lobby.rematch()
  router.push('/lobby')
}

function rematch() {
  if (!confirm('เล่นอีกตาด้วยผู้เล่นชุดเดิม? (เลือกตัวละครและแผนที่ใหม่)')) return
  rematchNow()
}
</script>

<template>
  <div v-if="!lobby.ready" class="card">
    <p>ยังไม่ได้ตั้งเกม</p>
    <RouterLink to="/lobby"><button type="button" class="primary">ไป Lobby</button></RouterLink>
  </div>

  <div v-else class="table">
    <nav class="tabs" aria-label="เลือกดู">
      <button type="button" class="tab killer" :class="{ active: tab === 'killer' }" @click="tab = 'killer'">
        <img :class="{ 'aura-killer': tab === 'killer' }" :src="asset(killer?.images.mini)" alt="" />
        <span><small>{{ lobby.playerName(s.killerPlayer) }}</small>{{ killer?.name }}</span>
      </button>
      <button
        v-for="(m, order) in team"
        :key="m.seat"
        type="button"
        class="tab"
        :class="{ active: tab === `s${m.seat}` }"
        @click="tab = `s${m.seat}`"
      >
        <img :class="{ 'aura-survivor': tab === `s${m.seat}` }" :src="asset(m.character?.images.mini)" alt="" />
        <span>
          <small>
            <img v-if="order === 0 && s.firstPlayerSeat !== null" class="first" :src="asset(components.firstPlayer.image)" alt="First player" />
            {{ m.player }}
          </small>
          {{ m.character?.name }}
        </span>
      </button>
      <span class="sep" />
      <button type="button" class="tab text" :class="{ active: tab === 'quick' }" @click="tab = 'quick'">📖 กติกาย่อ</button>
      <button type="button" class="tab text" :class="{ active: tab === 'search' }" @click="tab = 'search'">🔍 ค้นหา</button>
      <button type="button" class="tab text" :class="{ active: tab === 'items' }" @click="tab = 'items'">🎒 ไอเทม</button>
      <button type="button" class="tab text" :class="{ active: tab === 'map' }" @click="tab = 'map'">🗺 แผนที่</button>
    </nav>

    <section class="panel">
      <CharacterSheet v-if="tab === 'killer' && killer" :character="killer" kind="killer" :perks="lobby.perksFor('killer')" large />

      <template v-for="m in team" :key="m.seat">
        <CharacterSheet v-if="tab === `s${m.seat}` && m.character" :character="m.character" kind="survivor" :perks="lobby.perksFor(`s${m.seat}` as MiniKey)" large />
      </template>

      <div v-if="tab === 'items'" class="items">
        <ItemCard v-for="it in items" :key="it.id" :item="it" compact class="card" />
      </div>

      <div v-if="tab === 'quick'" class="quick">
        <div class="dice card">
          <div>
            <h3>ลูกเต๋า Skill Check (ดำ)</h3>
            <div class="faces">
              <figure><img :src="asset(components.skillDieFaces[5])" alt="" /><figcaption class="fail">0 ล้มเหลว<br />Killer +1 ▲</figcaption></figure>
              <figure><img :src="asset(components.skillDieFaces[3])" alt="" /><figcaption>1–4 สำเร็จ</figcaption></figure>
              <figure><img :src="asset(components.skillDieFaces[2])" alt="" /><figcaption class="great">5 สำเร็จยิ่งใหญ่</figcaption></figure>
            </div>
          </div>
          <div>
            <h3>Danger Die (แดง)</h3>
            <div class="faces">
              <figure><img :src="asset(components.dangerDieFaces[1])" alt="" /><figcaption class="fail">4 หน้า ล้มเหลว</figcaption></figure>
              <figure><img :src="asset(components.dangerDieFaces[0])" alt="" /><figcaption class="great">2 หน้า สำเร็จยิ่งใหญ่</figcaption></figure>
            </div>
          </div>
        </div>

        <details v-for="sec in quickSections" :key="sec.num" class="card sec" :open="openQuick === sec.num" @toggle="($event.target as HTMLDetailsElement).open && (openQuick = sec.num)">
          <summary>{{ sec.title }}</summary>
          <div class="md" v-html="renderMd(sec.body)" />
        </details>
      </div>

      <div v-if="tab === 'search'" class="search">
        <input v-model="query" type="search" placeholder="พิมพ์คำค้น เช่น pallet, ตู้, hook, ทอยใหม่" autofocus />
        <p v-if="query.trim().length >= 2 && !results.length" class="muted">ไม่พบ</p>
        <div v-for="r in results" :key="r.section.num" class="card hit">
          <h3>{{ r.section.num }}. {{ r.section.title }}</h3>
          <div class="md" v-html="highlight(renderMd(r.lines.join('\n')))" />
        </div>
      </div>

      <div v-if="tab === 'map' && map">
        <h2>{{ map.name }}</h2>
        <p v-if="lobby.hasStartRolls" class="muted">ตำแหน่งเริ่มต้นจากการทอยตอนจัดโต๊ะ</p>
        <StartMap :map="map" :minis="lobby.hasStartRolls ? lobby.minis : []" />
      </div>
    </section>

    <!-- terror radius: while the Killer's tab is open the screen edge pulses red like a heartbeat -->
    <!-- type="transition": the infinite pulse animation must not hold up the fade-out -->
    <Transition name="terror" type="transition">
      <div v-if="tab === 'killer'" class="terror" aria-hidden="true" />
    </Transition>

    <StartRollIntro v-if="showIntro && map" :map="map" :minis="introMinis" @done="endIntro" />

    <EndGame v-if="ending" @close="ending = false" @rematch="rematchNow" @history="router.push('/history')" />

    <footer class="foot">
      <RouterLink to="/setup">← จัดโต๊ะ</RouterLink>
      <span class="foot-actions">
        <button type="button" @click="rematch">เล่นอีกตา (ผู้เล่นเดิม)</button>
        <button type="button" class="primary" @click="ending = true">🏁 จบเกม</button>
      </span>
    </footer>
  </div>
</template>

<style scoped>
.table {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  padding: 0.25rem 0;
  position: sticky;
  top: 3.2rem;
  z-index: 5;
  background: rgb(7 8 10 / 0.72);
  backdrop-filter: blur(6px);
}
.tab {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: none;
  padding: 0.35rem 0.75rem 0.35rem 0.35rem;
  background: var(--bg-raised);
  text-align: left;
}
.tab img {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  object-fit: cover;
}
.tab span {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  white-space: nowrap;
}
.tab small {
  color: var(--muted);
  font-size: 0.8rem;
  display: flex;
  align-items: center;
  gap: 0.2rem;
}
.tab img.first {
  width: 1rem;
  height: 1rem;
  border-radius: 0;
}
.tab.text {
  padding: 0.6rem 0.9rem;
}
.tab.killer {
  border-color: var(--blood-dim);
}
.terror {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  box-shadow: inset 0 0 120px 20px rgb(200 10 20 / 0.35);
  animation: terror 1.1s ease-in-out infinite;
}
@keyframes terror {
  0%,
  40%,
  100% {
    opacity: 0.55;
  }
  12% {
    opacity: 1;
  }
  26% {
    opacity: 0.8;
  }
}
.terror-enter-active,
.terror-leave-active {
  transition: opacity 0.6s;
}
.terror-enter-from,
.terror-leave-to {
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .terror {
    animation: none;
    opacity: 0.6;
  }
}
.tab.active {
  border-color: var(--blood);
  box-shadow: 0 0 0 2px var(--blood) inset;
}
.sep {
  flex: none;
  width: 1px;
  background: var(--line);
  margin: 0 0.2rem;
}
@media (max-width: 900px) {
  /* characters on one row, reference tools on the next */
  .sep {
    flex-basis: 100%;
    height: 0;
    margin: 0;
  }
  .tabs {
    position: static;
  }
}
.items {
  display: grid;
  gap: 0.6rem;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
}
.quick {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.dice {
  display: flex;
  flex-wrap: wrap;
  gap: 1.5rem;
}
.faces {
  display: flex;
  gap: 0.75rem;
}
.faces figure {
  margin: 0;
  text-align: center;
  font-size: 0.85rem;
}
.faces img {
  width: 64px;
  height: 64px;
  border-radius: 8px;
}
.fail {
  color: var(--blood);
}
.great {
  color: var(--warn);
}
.sec summary {
  cursor: pointer;
  font-weight: 700;
  font-size: 1.1rem;
}
.md :deep(table) {
  border-collapse: collapse;
  display: block;
  overflow-x: auto;
  margin: 0.5rem 0;
}
.md :deep(th),
.md :deep(td) {
  border: 1px solid var(--line);
  padding: 0.35rem 0.6rem;
  text-align: left;
  vertical-align: top;
}
.md :deep(mark) {
  background: var(--warn);
  color: #000;
  border-radius: 2px;
}
.md :deep(pre) {
  overflow-x: auto;
  background: var(--bg);
  padding: 0.6rem;
  border-radius: 6px;
}
.search input {
  width: 100%;
  font: inherit;
  font-size: 1.15rem;
  color: var(--text);
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0.7rem 0.9rem;
  margin-bottom: 0.75rem;
}
.hit {
  margin-bottom: 0.6rem;
}
.foot-actions {
  display: flex;
  gap: 0.5rem;
}
.foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 0;
  color: var(--muted);
}
</style>
