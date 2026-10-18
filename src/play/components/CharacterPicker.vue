<script setup lang="ts">
// Character grid in the companion's style: tap a character to see its sheet, pick it from there,
// or let the roulette pick. Only characters whose perks the engine knows can be played.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import CharacterSheet from '../../components/CharacterSheet.vue'
import RouletteReel, { type ReelItem } from '../../components/RouletteReel.vue'
import { killers, survivors } from '../../data'
import { asset } from '../../i18n'
import { sfx } from '../../sound'
import type { Killer, Survivor } from '../../types'
import { PLAYABLE_KILLERS, PRINTED_PERKS } from '../engine/perks'

const props = withDefaults(
  defineProps<{
    kind: 'survivor' | 'killer'
    /** Picked by someone else: shown, but can't be picked. */
    taken?: string[]
    /** Picked by this player: highlighted; picking it again takes it back. */
    selected?: string[]
    /** How many more picks this player has to make (for "random for all the rest"). */
    remaining?: number
    locked?: boolean
    takenLabel?: string
    /** Roulette title, e.g. whose pick it is. */
    rollTitle?: string
    /** Banned by the room's host: shown, never picked or drawn. */
    banned?: string[]
  }>(),
  { taken: () => [], selected: () => [], remaining: 1, locked: false, takenLabel: 'มีคนเลือกแล้ว', rollTitle: '', banned: () => [] },
)
const emit = defineEmits<{ pick: [id: string]; unpick: [id: string] }>()

type Character = Survivor | Killer

const playable = (c: Character) =>
  props.kind === 'killer' ? PLAYABLE_KILLERS.includes(c.id) : (PRINTED_PERKS[c.id]?.length ?? 0) > 0

// Rulebook p.4 recommends easy characters for a first game.
const onlyEasy = ref(false)

/** Playable characters first; the rest are shown as coming later. */
const list = computed(() =>
  ((props.kind === 'killer' ? killers : survivors) as Character[])
    .filter((c) => !onlyEasy.value || c.difficulty === 'easy')
    .sort((a, b) => Number(playable(b)) - Number(playable(a))),
)

const isTaken = (id: string) => props.taken.includes(id) || props.banned.includes(id)
const isMine = (id: string) => props.selected.includes(id)

// ---------- preview ----------

const preview = ref<Character | null>(null)

function open(c: Character) {
  if (!playable(c) || isTaken(c.id)) return
  sfx.click()
  preview.value = c
}

function choose() {
  const c = preview.value
  preview.value = null
  if (!c || props.locked) return
  sfx.select()
  if (isMine(c.id)) emit('unpick', c.id)
  else emit('pick', c.id)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') preview.value = null
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

// ---------- roulette ----------

const reel = ref<{ key: number; items: ReelItem[]; target: string } | null>(null)
let reelKey = 0
// "Random for all the rest": the parent may record picks asynchronously (online), so the run
// counts its own picks and skips what it already picked rather than waiting for the props.
let rollLeft = 0
const rolled = new Set<string>()

const pool = computed(() => list.value.filter((c) => playable(c) && !isTaken(c.id) && !isMine(c.id)))

function spin(all = false) {
  if (reel.value || props.locked || props.remaining <= 0) return
  if (!all || !rollLeft) {
    rollLeft = all ? props.remaining : 1
    rolled.clear()
  }
  const items = pool.value.filter((c) => !rolled.has(c.id)).map((c) => ({ id: c.id, name: c.name, image: c.images.mini ?? '' }))
  if (!items.length) return void (rollLeft = 0)
  reel.value = { key: ++reelKey, items, target: items[Math.floor(Math.random() * items.length)].id }
}

function onReelDone(id: string) {
  reel.value = null
  rolled.add(id)
  rollLeft--
  emit('pick', id)
  if (rollLeft > 0) window.setTimeout(() => spin(true), 150)
}
</script>

<template>
  <div class="picker">
    <div class="toolbar">
      <label class="filter"><input v-model="onlyEasy" type="checkbox" /> เฉพาะตัวง่าย (แนะนำเกมแรก)</label>
      <template v-if="!locked && remaining > 0">
        <button type="button" class="roll" @click="spin()">🎲 สุ่ม{{ kind === 'killer' ? 'ฆาตกร' : remaining > 1 ? 'ให้ตัวนี้' : '' }}</button>
        <button v-if="remaining > 1" type="button" class="roll-all" @click="spin(true)">🎲 สุ่มที่เหลือทั้งหมด</button>
      </template>
    </div>

    <div class="grid pick">
      <button
        v-for="c in list"
        :key="c.id"
        type="button"
        class="option"
        :class="[kind === 'killer' ? 'kill' : 'surv', { mine: isMine(c.id) }]"
        :data-id="c.id"
        :disabled="!playable(c) || isTaken(c.id) || (locked && !isMine(c.id))"
        @click="open(c)"
      >
        <img :class="{ 'aura-killer': kind === 'killer' && isMine(c.id), 'aura-survivor': kind === 'survivor' && isMine(c.id) }" :src="asset(c.images.mini)" :alt="c.name" loading="lazy" />
        <span>{{ c.name }}</span>
        <small v-if="!playable(c)" class="muted">เร็ว ๆ นี้</small>
        <small v-else-if="banned.includes(c.id)" class="muted">🚫 ถูกแบน</small>
        <small v-else-if="isTaken(c.id)" class="muted">{{ takenLabel }}</small>
        <small v-else-if="isMine(c.id)" class="mine-label">✓ เลือกแล้ว</small>
        <small v-else :class="c.difficulty">{{ c.difficulty === 'easy' ? 'ง่าย' : 'ยาก' }}</small>
      </button>
    </div>
  </div>

  <!-- To <body>: a parent .card's backdrop-filter would otherwise trap these fixed overlays
       inside the card (the online room puts the picker in one). -->
  <Teleport to="body">
    <RouletteReel v-if="reel" :key="reel.key" :items="reel.items" :target="reel.target" :title="rollTitle || (kind === 'killer' ? 'สุ่มฆาตกร' : 'สุ่ม Survivor')" @done="onReelDone" />

    <div v-if="preview" class="overlay" @click.self="preview = null">
      <div class="modal">
        <CharacterSheet :character="preview" :kind="kind" />
        <div class="modal-actions">
          <button type="button" @click="preview = null">ปิด</button>
          <button type="button" class="primary choose" :disabled="locked" @click="choose">
            {{ isMine(preview.id) ? `เอา ${preview.name} ออก` : `เลือก ${preview.name}` }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.picker {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}
.filter {
  margin-right: auto;
}
.pick {
  grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
}
.option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  padding: 0.6rem 0.4rem;
  background: var(--bg-raised);
  transition:
    transform 0.18s ease,
    border-color 0.18s,
    box-shadow 0.18s;
}
.option img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: contain;
  border-radius: 50%;
  transition: box-shadow 0.25s;
}
.option:disabled {
  opacity: 0.25;
}
/* hovering a character reads its aura: gold-white for survivors, red for killers */
.option:hover:not(:disabled),
.option:focus-visible {
  transform: translateY(-3px);
}
.option.surv:hover:not(:disabled),
.option.surv.mine {
  border-color: rgb(255 214 140 / 0.7);
  box-shadow: 0 8px 22px rgb(0 0 0 / 0.5), 0 0 18px rgb(255 200 110 / 0.25);
}
.option.surv:hover:not(:disabled) img {
  box-shadow:
    0 0 0 2px rgb(255 240 200 / 0.9),
    0 0 18px 4px rgb(255 205 120 / 0.6);
}
.option.kill:hover:not(:disabled) img {
  box-shadow:
    0 0 0 2px rgb(255 50 50 / 0.95),
    0 0 20px 5px rgb(255 30 30 / 0.65);
}
.option.kill:hover:not(:disabled),
.option.kill.mine {
  border-color: var(--blood);
  box-shadow: 0 8px 22px rgb(0 0 0 / 0.5), 0 0 22px rgb(255 30 30 / 0.3);
}
.option.mine:disabled {
  opacity: 1;
}
.mine-label {
  color: var(--warn);
  font-weight: 700;
}
.option.kill .mine-label {
  color: var(--blood-bright);
}
@media (prefers-reduced-motion: reduce) {
  .option:hover:not(:disabled) {
    transform: none;
  }
}
.easy {
  color: var(--ok);
}
.hard {
  color: var(--blood);
}
.overlay {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgb(0 0 0 / 0.75);
}
.modal {
  width: min(900px, 100%);
  max-height: 100%;
  overflow-y: auto;
  padding: 1.25rem;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}
.modal-actions {
  position: sticky;
  bottom: -1.25rem;
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin: 1rem -1.25rem -1.25rem;
  padding: 0.75rem 1.25rem;
  background: var(--bg-raised);
  border-top: 1px solid var(--line);
}
.modal-actions .primary {
  font-size: 1.05rem;
  padding: 0.6rem 1.2rem;
}
</style>
