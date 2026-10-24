<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { editPerkCards, items, killers, survivors } from '../data'
import { asset, lang, tr, trName } from '../i18n'
import BpIcon from '../components/BpIcon.vue'
import PerkRichText from '../components/PerkRichText.vue'

type Tab = 'survivor' | 'killer' | 'item' | 'perk'
const TABS: Tab[] = ['survivor', 'killer', 'item', 'perk']
const tab = ref<Tab>('survivor')
const query = ref('')

// Searches names and perk names so "sprint burst" finds Meg.
const list = computed(() => {
  const q = query.value.trim().toLowerCase()
  const match = (...texts: string[]) => !q || texts.some((t) => t.toLowerCase().includes(q))
  if (tab.value === 'survivor')
    return survivors
      .filter((s) => match(s.name, ...s.perks.map((p) => p.name)))
      .map((s) => ({ id: s.id, name: s.name, sub: s.perks.map((p) => p.name).join(' · '), img: s.images.mini }))
  if (tab.value === 'killer')
    return killers
      .filter((k) => match(k.name, k.power.name, ...k.perks.map((p) => p.name)))
      .map((k) => ({ id: k.id, name: k.name, sub: k.power.name, img: k.images.mini }))
  return items
    .filter((i) => match(i.name.en, i.name.th))
    .map((i) => ({ id: i.id, name: tr(i.name), sub: `×${i.count}`, img: i.images.th ?? i.images.pt }))
})

// ---------- perk cards: every card of the edit-perks decks (Bloodweb, Devout) ----------

type Side = 'all' | 'survivor' | 'killer'
const side = ref<Side>('all')

/** The character whose board prints a perk of this name, if any (the card is still one of its own). */
const boardOf = new Map<string, string>(
  [...survivors, ...killers].flatMap((c) => c.perks.map((p) => [p.name.toLowerCase(), c.name] as [string, string])),
)
const ownerOf = (name: string) => boardOf.get(name.toLowerCase()) ?? ''

const perks = computed(() => {
  const q = query.value.trim().toLowerCase()
  return editPerkCards
    .filter((p) => side.value === 'all' || p.side === side.value)
    .filter((p) => !q || [p.name, p.text.th, p.text.en, ownerOf(p.name)].some((t) => (t ?? '').toLowerCase().includes(q)))
    .sort((a, b) => a.name.localeCompare(b.name))
})
const sideCount = (s: Side) => (s === 'all' ? editPerkCards.length : editPerkCards.filter((p) => p.side === s).length)
const cardImage = (p: (typeof editPerkCards)[number]) => (lang.value === 'th' ? p.image?.th : p.image?.en) ?? p.image?.en

/** The card opened big in the middle of the screen. */
const open = ref<(typeof editPerkCards)[number] | null>(null)
const onKey = (e: KeyboardEvent) => {
  if (e.key === 'Escape') open.value = null
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

const labels = computed(() =>
  lang.value === 'th'
    ? {
        survivor: 'ผู้รอดชีวิต',
        killer: 'ฆาตกร',
        item: 'ไอเทม',
        perk: 'การ์ด Perk',
        search: tab.value === 'perk' ? 'ค้นหา Perk / คำในการ์ด / ตัวละคร' : 'ค้นหาชื่อ / perk',
        all: 'ทั้งหมด',
        onBoard: 'อยู่บนกระดาน',
        noBoard: 'ไม่อยู่บนกระดานตัวละครใด — ใช้ได้จากการ์ดเท่านั้น',
        free: 'ฟรี',
        close: 'ปิด',
        hint: 'การ์ด Perk ทั้งหมดที่ใช้ในโหมด Bloodweb และ Devout — คลิกการ์ดเพื่อดูใหญ่',
      }
    : {
        survivor: 'Survivors',
        killer: 'Killers',
        item: 'Items',
        perk: 'Perk cards',
        search: tab.value === 'perk' ? 'Search perk / card text / character' : 'Search name / perk',
        all: 'All',
        onBoard: 'On the board of',
        noBoard: "On no character's board — a card only",
        free: 'Free',
        close: 'Close',
        hint: 'Every perk card of the Bloodweb and Devout modes — click a card to see it big',
      },
)
</script>

<template>
  <div class="toolbar">
    <div class="tabs">
      <button v-for="t in TABS" :key="t" type="button" :class="{ active: tab === t }" @click="tab = t">
        {{ labels[t] }}
      </button>
    </div>
    <input v-model="query" class="search" type="search" :placeholder="labels.search" />
  </div>

  <!-- the perk cards -->
  <template v-if="tab === 'perk'">
    <div class="perk-bar">
      <div class="sides">
        <button v-for="s in ['all', 'survivor', 'killer'] as Side[]" :key="s" type="button" :class="{ active: side === s }" @click="side = s">
          {{ s === 'all' ? labels.all : labels[s] }} <small>{{ sideCount(s) }}</small>
        </button>
      </div>
      <small class="muted">{{ labels.hint }}</small>
    </div>
    <div class="perk-grid">
      <button v-for="p in perks" :key="p.id" type="button" class="perk-card" :class="p.side" :title="p.name" @click="open = p">
        <img :src="asset(cardImage(p))" :alt="p.name" loading="lazy" />
      </button>
    </div>
    <p v-if="!perks.length" class="muted">{{ lang === 'th' ? 'ไม่พบการ์ด Perk' : 'No perk card found' }}</p>

    <!-- one card, big, with its text -->
    <Teleport to="body">
      <div v-if="open" class="perk-zoom" role="dialog" aria-modal="true" @click.self="open = null">
        <div class="zoom-body">
          <img :src="asset(cardImage(open))" :alt="open.name" />
          <div class="zoom-text">
            <p class="zoom-side" :class="open.side">{{ labels[open.side] }}</p>
            <h2>{{ trName(open.name) }}</h2>
            <p class="zoom-cost">
              <template v-if="open.cost">{{ open.cost }} <BpIcon /></template>
              <template v-else>{{ labels.free }}</template>
            </p>
            <p class="zoom-rules"><PerkRichText :text="tr(open.text)" /></p>
            <p class="zoom-flavor muted">{{ tr(open.flavor) }}</p>
            <p class="zoom-owner">{{ ownerOf(open.name) ? `${labels.onBoard} ${ownerOf(open.name)}` : labels.noBoard }}</p>
            <button type="button" @click="open = null">{{ labels.close }}</button>
          </div>
        </div>
      </div>
    </Teleport>
  </template>

  <div v-else class="grid">
    <RouterLink v-for="c in list" :key="c.id" :to="`/cards/${tab}/${c.id}`" class="tile card">
      <img :src="asset(c.img)" :alt="c.name" loading="lazy" />
      <strong>{{ c.name }}</strong>
      <small class="muted">{{ c.sub }}</small>
    </RouterLink>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.tabs .active,
.sides .active {
  background: var(--blood);
  border-color: var(--blood);
}
.search {
  flex: 1;
  min-width: 180px;
  font: inherit;
  color: var(--text);
  background: var(--bg-raised);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 0.45rem 0.8rem;
}
.tile {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  text-decoration: none;
  padding: 0.6rem;
}
.tile:hover {
  border-color: var(--muted);
}
.tile img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: contain;
  background: #000;
  border-radius: 6px;
}
.tile small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---------- perk cards ---------- */
.perk-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  margin-bottom: 0.9rem;
}
.sides {
  display: flex;
  gap: 0.25rem;
}
.sides small {
  margin-left: 0.2rem;
  opacity: 0.75;
}
.perk-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 0.7rem;
}
.perk-card {
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: #000;
  overflow: hidden;
  transition:
    transform 0.15s,
    border-color 0.15s,
    box-shadow 0.15s;
}
.perk-card img {
  display: block;
  width: 100%;
  aspect-ratio: 409 / 573;
  object-fit: cover;
}
.perk-card:hover,
.perk-card:focus-visible {
  transform: translateY(-3px) scale(1.03);
  border-color: #e6c27a;
  box-shadow: 0 8px 22px rgb(0 0 0 / 0.6);
}
.perk-card.killer:hover {
  border-color: var(--blood-bright);
}
.perk-zoom {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgb(0 0 0 / 0.8);
}
.zoom-body {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 1.2rem;
  max-width: 900px;
  max-height: 100%;
  overflow-y: auto;
  padding: 1rem;
  background: rgb(12 13 16 / 0.96);
  border: 1px solid var(--line-strong);
  box-shadow: 0 14px 40px rgb(0 0 0 / 0.7);
}
/* the card itself (not the ▲ icons in the text beside it) */
.zoom-body > img {
  width: min(340px, 80vw);
  height: auto;
  border-radius: 8px;
}
.zoom-text {
  flex: 1;
  min-width: 260px;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.zoom-text p,
.zoom-text h2 {
  margin: 0;
}
.zoom-side {
  font-family: var(--font-display);
  font-size: 0.8rem;
  letter-spacing: 0.1em;
  color: #ffd56a;
}
.zoom-side.killer {
  color: #ff6b62;
}
.zoom-cost {
  font-family: var(--font-display);
  font-size: 1.1rem;
}
.zoom-rules {
  font-size: 1.05rem;
  line-height: 1.6;
}
.zoom-flavor {
  font-style: italic;
}
.zoom-owner {
  color: #e6c27a;
  font-size: 0.92rem;
}
.zoom-text button {
  align-self: flex-start;
  margin-top: auto;
}
</style>
