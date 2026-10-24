<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { devoutPool, killerById, perkOption, printedPerks, survivorById, type PerkRef } from '../data'
import { asset, lang, tr, trName } from '../i18n'
import { useLobbyStore, type MiniKey } from '../stores/lobby'
import { sfx } from '../sound'
import PerkRichText from './PerkRichText.vue'

// Devout (rulebook p.19): each player picks 3 perks — their printed ones or any shareable perk
// of their side, no duplicates. One device: the picks are made in turn behind a hand-off
// screen and only shown together once everyone has chosen.
const lobby = useLobbyStore()
const s = computed(() => lobby.state)

const ORDER: MiniKey[] = ['s0', 's1', 's2', 's3', 'killer']

const key = computed(() => lobby.currentPerkPicker)
const isKiller = computed(() => key.value === 'killer')
const characterId = computed(() => (key.value ? lobby.characterOf(key.value) : null))
const character = computed(() =>
  characterId.value ? (isKiller.value ? killerById.get(characterId.value) : survivorById.get(characterId.value)) : undefined,
)
const player = computed(() =>
  !key.value ? '' : isKiller.value ? lobby.playerName(s.value.killerPlayer) : lobby.seatPlayerName(Number(key.value.slice(1))),
)

// hand-off → picking, per player
const showing = ref(false)
const draft = ref<PerkRef[]>([])
const query = ref('')

watch(
  key,
  () => {
    showing.value = false
    query.value = ''
    draft.value = characterId.value ? printedPerks(isKiller.value ? 'killer' : 'survivor', characterId.value) : []
  },
  { immediate: true },
)

const pool = computed(() => (characterId.value ? devoutPool(isKiller.value ? 'killer' : 'survivor', characterId.value) : []))
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return pool.value
  return pool.value.filter((o) =>
    [o.perk.name, o.ownerName, o.perk.text.th, o.perk.text.en].some((t) => t.toLowerCase().includes(q)),
  )
})

function toggle(ref: PerkRef) {
  sfx.click()
  const i = draft.value.indexOf(ref)
  if (i >= 0) draft.value.splice(i, 1)
  else if (draft.value.length < 3) draft.value.push(ref)
}

function cardImage(ref: PerkRef): string {
  const img = perkOption(ref)?.perk.image
  return asset(img?.[lang.value] ?? img?.th ?? img?.en)
}

function confirm() {
  sfx.select()
  if (key.value) lobby.confirmPerks(key.value, draft.value)
}

const done = computed(() => key.value === null)
const reveal = computed(() =>
  ORDER.map((k) => {
    const id = lobby.characterOf(k)
    const c = id ? (k === 'killer' ? killerById.get(id) : survivorById.get(id)) : undefined
    const printed = id ? printedPerks(k === 'killer' ? 'killer' : 'survivor', id) : []
    return {
      key: k,
      name: c?.name ?? '?',
      mini: c?.images.mini,
      killer: k === 'killer',
      player: k === 'killer' ? lobby.playerName(s.value.killerPlayer) : lobby.seatPlayerName(Number(k.slice(1))),
      picks: (s.value.perkPicks[k] ?? []).map((r) => ({ ref: r, swapped: !printed.includes(r) })),
    }
  }),
)
function doReveal() {
  sfx.entity()
  lobby.revealPerks()
}
const pickedCount = computed(() => ORDER.filter((k) => s.value.perkPicks[k]).length)
</script>

<template>
  <!-- everyone has chosen -->
  <section v-if="done" class="card">
    <template v-if="!s.perksRevealed">
      <h2>ทุกคนเลือก Perk แล้ว</h2>
      <p class="muted">เรียกทุกคนมาดูหน้าจอ แล้วเปิดพร้อมกัน</p>
      <button type="button" class="primary big" @click="doReveal()">🃏 เปิด Perk พร้อมกัน</button>
    </template>
    <template v-else>
      <h2>Perk ของแต่ละตัว</h2>
      <p class="muted">การ์ดที่มีป้าย "เปลี่ยน" ให้หยิบการ์ด Perk ใบนั้นจากกองมาวางทับบนกระดาน</p>
      <div class="reveal">
        <article v-for="r in reveal" :key="r.key" class="who" :class="{ killer: r.killer }">
          <header>
            <img :src="asset(r.mini)" alt="" />
            <div>
              <b>{{ r.name }}</b>
              <small class="muted">{{ r.player }}</small>
            </div>
          </header>
          <div class="trio">
            <figure v-for="p in r.picks" :key="p.ref">
              <img :src="cardImage(p.ref)" :alt="perkOption(p.ref)?.perk.name" />
              <figcaption v-if="p.swapped" class="swap">เปลี่ยน</figcaption>
            </figure>
          </div>
        </article>
      </div>
    </template>
  </section>

  <!-- hand the device over -->
  <section v-else-if="!showing" class="card handoff">
    <p class="muted">เลือก Perk แบบลับ · {{ pickedCount }}/5 คนเลือกแล้ว</p>
    <img class="big-mini" :src="asset(character?.images.mini)" alt="" />
    <h2>ส่งเครื่องให้ {{ player }}</h2>
    <p>
      เลือก Perk ของ <b>{{ character?.name }}</b>
      <span class="muted"> — คนอื่นอย่าดูนะ</span>
    </p>
    <button type="button" class="primary big" @click="showing = true">👁 ฉันคือ {{ player }} — เริ่มเลือก</button>
  </section>

  <!-- picking -->
  <section v-else class="picker">
    <!-- compact sticky bar: who, the 3 chosen perks, search, actions -->
    <div class="chosen card">
      <div class="chosen-head">
        <img :src="asset(character?.images.mini)" alt="" />
        <div>
          <b>{{ character?.name }}</b>
          <small class="muted">{{ player }} · เลือกให้ครบ 3 ใบ ห้ามซ้ำ</small>
        </div>
      </div>
      <div class="slots">
        <button
          v-for="i in 3"
          :key="i"
          type="button"
          class="slot"
          :class="{ filled: draft[i - 1] }"
          :disabled="!draft[i - 1]"
          :title="draft[i - 1] ? 'เอาออก' : ''"
          @click="toggle(draft[i - 1])"
        >
          <template v-if="draft[i - 1]">
            <img :src="cardImage(draft[i - 1])" alt="" />
            <span class="slot-name">{{ perkOption(draft[i - 1])?.perk.name }}</span>
            <span class="x">✕</span>
          </template>
          <span v-else class="empty">ช่อง {{ i }} — ว่าง</span>
        </button>
      </div>
      <div class="bar-row">
        <input v-model="query" class="search" type="search" placeholder="🔍 พิมพ์ค้นหาชื่อ Perk / ตัวละคร / คำในข้อความ" />
        <button type="button" @click="draft = printedPerks(isKiller ? 'killer' : 'survivor', characterId!)">↺ Perk เดิม</button>
        <button type="button" class="primary" :disabled="draft.length !== 3" @click="confirm">✓ ยืนยัน</button>
      </div>
    </div>

    <p class="muted count">แสดง {{ filtered.length }} จาก {{ pool.length }} Perk</p>

    <ul class="pool">
      <li v-for="o in filtered" :key="o.ref">
        <button
          type="button"
          class="opt"
          :class="{ on: draft.includes(o.ref), own: o.ownerId === characterId }"
          :disabled="!draft.includes(o.ref) && draft.length >= 3"
          @click="toggle(o.ref)"
        >
          <img class="thumb" :src="cardImage(o.ref)" alt="" loading="lazy" />
          <span class="info">
            <span class="title">
              <span class="cost">{{ o.perk.cost }}</span>
              <b>{{ trName(o.perk.name) }}</b>
              <small class="muted">{{ o.ownerId === characterId ? 'ของตัวเอง' : o.ownerName }}</small>
            </span>
            <PerkRichText class="text" :text="tr(o.perk.text)" />
          </span>
          <span class="tick">{{ draft.includes(o.ref) ? '✓' : '+' }}</span>
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.big {
  width: 100%;
  padding: 0.85rem;
  font-size: 1.15rem;
}
.handoff {
  text-align: center;
  padding: 2rem 1rem;
}
.big-mini {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  object-fit: cover;
}
.handoff h2 {
  margin: 0.75rem 0 0.25rem;
  font-size: 1.8rem;
}
.picker {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.chosen {
  position: sticky;
  top: 3.4rem;
  z-index: 4;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  grid-template-areas: 'head slots' 'row row';
  gap: 0.5rem 1rem;
  align-items: center;
  padding: 0.6rem 0.8rem;
  box-shadow: 0 8px 20px rgb(0 0 0 / 0.5);
}
.chosen-head {
  grid-area: head;
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.chosen-head img {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
}
.chosen-head div {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}
.slots {
  grid-area: slots;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.4rem;
}
.slot {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  min-width: 0;
  height: 44px;
  padding: 0 0.5rem 0 0.25rem;
  border-style: dashed;
  background: var(--bg);
  text-align: left;
}
.slot.filled {
  border-style: solid;
  border-color: var(--blood);
}
.slot:disabled {
  opacity: 1;
  cursor: default;
}
.slot img {
  width: 36px;
  height: 36px;
  flex: none;
  object-fit: cover;
  object-position: 50% 22%;
  border-radius: 4px;
}
.slot-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  font-size: 0.9rem;
}
.slot .x {
  color: var(--muted);
}
.empty {
  padding-left: 0.4rem;
  color: var(--muted);
  font-size: 0.9rem;
}
.bar-row {
  grid-area: row;
  display: flex;
  gap: 0.5rem;
}
.search {
  flex: 1;
  min-width: 0;
  font: inherit;
  font-size: 1.05rem;
  color: var(--text);
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0.5rem 0.8rem;
}
.search:focus {
  outline: 2px solid var(--blood);
  outline-offset: -1px;
}
.count {
  margin: 0;
  font-size: 0.85rem;
}
.pool {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.5rem;
  grid-template-columns: repeat(auto-fill, minmax(330px, 1fr));
}
.opt {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr) auto;
  gap: 0.6rem;
  align-items: start;
  width: 100%;
  height: 100%;
  padding: 0.5rem;
  text-align: left;
  background: var(--bg-raised);
}
.opt.own {
  border-color: #6b3fa0;
}
.opt.on {
  border-color: var(--blood);
  box-shadow: 0 0 0 2px var(--blood) inset;
}
.opt:disabled {
  opacity: 0.4;
}
.thumb {
  width: 64px;
  height: 64px;
  object-fit: cover;
  object-position: 50% 22%;
  border-radius: 6px;
}
.info {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
}
.title {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem;
}
.cost {
  display: inline-grid;
  place-items: center;
  min-width: 1.4em;
  height: 1.4em;
  border-radius: 4px;
  background: var(--blood);
  color: #fff;
  font-size: 0.8em;
}
.text {
  font-size: 0.85rem;
  color: var(--muted);
}
.tick {
  font-size: 1.2rem;
  font-weight: 800;
  color: var(--blood);
}
.reveal {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
}
.who {
  padding: 0.6rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--bg);
}
.who.killer {
  border-color: var(--blood-dim);
}
.who header {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 0.5rem;
}
.who header img {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
}
.who header div {
  display: flex;
  flex-direction: column;
}
.trio {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.35rem;
}
.trio figure {
  position: relative;
  margin: 0;
}
.trio img {
  width: 100%;
  border-radius: 5px;
}
.swap {
  position: absolute;
  top: 4px;
  right: 4px;
  padding: 0 0.35rem;
  border-radius: 4px;
  background: var(--warn);
  color: #000;
  font-size: 0.75rem;
  font-weight: 700;
}
@media (max-width: 560px) {
  .pool {
    grid-template-columns: 1fr;
  }
  .chosen {
    top: 3rem;
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: 'head' 'slots' 'row';
  }
  .slot img {
    display: none;
  }
  /* search gets its own full-width row */
  .bar-row {
    flex-wrap: wrap;
  }
  .search {
    flex-basis: 100%;
  }
  .bar-row button {
    flex: 1;
  }
  .slot {
    padding: 0 0.4rem;
  }
}
</style>
