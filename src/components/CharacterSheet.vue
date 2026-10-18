<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { asset, lang, tr } from '../i18n'
import type { Killer, Perk, Survivor } from '../types'
import RichText from './RichText.vue'
import BpIcon from './BpIcon.vue'
import BpText from './BpText.vue'

// One character's board: perks, and for killers the power and passive panels.
// `perks` overrides the printed perks (Devout mode picks).
const props = defineProps<{ character: Survivor | Killer; kind: 'survivor' | 'killer'; large?: boolean; perks?: Perk[] }>()
const shownPerks = computed(() => props.perks ?? props.character.perks)

const killer = computed(() => (props.kind === 'killer' ? (props.character as Killer) : undefined))
const survivor = computed(() => (props.kind === 'survivor' ? (props.character as Survivor) : undefined))

/** The image in the current card language, falling back to the other one. */
function pick(img: Partial<Record<'th' | 'en', string>> | undefined): string | undefined {
  return img?.[lang.value] ?? img?.th ?? img?.en
}

function perkImage(p: Perk): string | undefined {
  return pick(p.image)
}

const showBoard = ref(false)
const boardImage = computed(() => {
  const img = props.character.images
  return asset(lang.value === 'th' ? (img.boardTh ?? img.boardEn) : (img.boardEn ?? img.boardTh))
})

// ---------- a card picture opened big (a click on it); a click anywhere or Esc puts it back ----------
// Teleported to the body: the sheet often sits in a modal inside a .card, whose backdrop-filter
// would trap a fixed overlay.

const zoomed = ref<string | null>(null)
function zoom(e: MouseEvent) {
  zoomed.value = (e.currentTarget as HTMLImageElement).src
}
// Esc closes the picture first, not the modal around the sheet (caught before it hears the key).
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !zoomed.value) return
  e.stopImmediatePropagation()
  e.preventDefault()
  zoomed.value = null
}
watch(zoomed, (z) => (z ? window.addEventListener('keydown', onKey, true) : window.removeEventListener('keydown', onKey, true)))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey, true))

const t = computed(() =>
  lang.value === 'th'
    ? { zoom: 'คลิกเพื่อขยาย', back: 'คลิกที่ไหนก็ได้เพื่อย่อกลับ', board: 'ดูภาพกระดาน', text: 'ดูแบบข้อความ', power: 'พลัง', passive: 'Passive', easy: 'ง่าย', hard: 'ยาก' }
    : { zoom: 'Click to enlarge', back: 'Click anywhere to close', board: 'Show board image', text: 'Show text', power: 'Power', passive: 'Passive', easy: 'Easy', hard: 'Hard' },
)
</script>

<template>
  <section class="sheet" :class="{ large }">
    <header class="head">
      <img class="mini" :class="kind === 'killer' ? 'aura-killer' : 'aura-survivor'" :src="asset(character.images.mini)" :alt="character.name" />
      <div>
        <h2>{{ character.name }}</h2>
        <p class="muted meta">
          <template v-if="survivor && tr(survivor.title)"><BpText :text="tr(survivor.title)" /> · </template>
          <template v-if="killer?.realName">{{ killer.realName }} · </template>
          <span :class="character.difficulty">{{ t[character.difficulty] }}</span> · <BpIcon /> {{ character.bloodpoints.start }} / {{ character.bloodpoints.max }}
        </p>
        <button type="button" class="small" @click="showBoard = !showBoard"><BpText :text="showBoard ? t.text : t.board" /></button>
      </div>
    </header>

    <img v-if="showBoard" class="board zoomable" :title="t.zoom" @click="zoom" :src="boardImage" :alt="character.name" />
    <template v-else>
      <template v-if="killer">
        <!-- POWER / PASSIVE panels cut from the board; transcribed text as alt / fallback. -->
        <div class="panels">
          <img
            v-if="pick(killer.power.image)"
            class="panel-img zoomable"
            :title="t.zoom"
            @click="zoom"
            :src="asset(pick(killer.power.image))"
            :alt="`${t.power}: ${killer.power.name} — ${tr(killer.power.text)}`"
          />
          <div v-else class="card block power">
            <h3>⚡ {{ t.power }}: {{ killer.power.name }}</h3>
            <RichText :text="tr(killer.power.text)" />
          </div>
          <template v-if="killer.passive">
            <img
              v-if="pick(killer.passiveImage)"
              class="panel-img zoomable"
            :title="t.zoom"
            @click="zoom"
              :src="asset(pick(killer.passiveImage))"
              :alt="`${t.passive}: ${tr(killer.passive)}`"
            />
            <div v-else class="card block">
              <h3>{{ t.passive }}</h3>
              <RichText :text="tr(killer.passive)" />
            </div>
          </template>
        </div>
      </template>

      <!-- Perks are shown as the card cut from the board; the transcribed text is the alt text. -->
      <div class="perks">
        <template v-for="p in shownPerks" :key="p.name">
          <img
            v-if="perkImage(p)"
            class="perk-card zoomable"
            :title="t.zoom"
            @click="zoom"
            :class="/-1\.webp$/.test(perkImage(p)!) ? 'own' : 'shared'"
            :src="asset(perkImage(p))"
            :alt="`${p.name} (${p.cost} ▲): ${tr(p.text)}`"
            loading="lazy"
          />
          <article v-else class="card perk">
            <h3><span class="cost"><BpText :text="p.cost" /></span> {{ p.name }}</h3>
            <p class="muted flavor">{{ tr(p.flavor) }}</p>
            <RichText :text="tr(p.text)" />
          </article>
        </template>
      </div>
    </template>

    <Teleport to="body">
      <div v-if="zoomed" class="sheet-zoom" role="dialog" aria-modal="true" @click.stop="zoomed = null">
        <img :src="zoomed" alt="" />
        <p class="muted small">{{ t.back }}</p>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.zoomable {
  cursor: zoom-in;
}
/* the enlarged card, over everything: as big as the screen allows */
.sheet-zoom {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 0.6rem;
  padding: 1.5rem;
  background: rgb(4 5 7 / 0.92);
  cursor: zoom-out;
  animation: zoom-in 0.15s ease-out;
}
.sheet-zoom img {
  max-width: min(92vw, 1100px);
  max-height: 84vh;
  object-fit: contain;
  border-radius: 12px;
  box-shadow: 0 0 0 2px rgb(255 233 176 / 0.6), 0 24px 60px rgb(0 0 0 / 0.85);
}
@keyframes zoom-in {
  from {
    opacity: 0;
  }
}
.head {
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-bottom: 0.75rem;
}
.head h2 {
  margin: 0;
}
.meta {
  margin: 0.15rem 0 0.4rem;
}
.mini {
  width: 88px;
  height: 88px;
  object-fit: contain;
  border-radius: 50%;
  background: #000;
}
.easy {
  color: var(--ok);
}
.hard {
  color: var(--blood);
}
.board {
  width: 100%;
  border-radius: var(--radius);
}
.block {
  margin-bottom: 0.75rem;
}
.panels {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  align-items: end;
  margin-bottom: 0.75rem;
}
.panels .block {
  margin-bottom: 0;
}
.panel-img {
  display: block;
  width: 100%;
  border-radius: 8px;
}
.power {
  border-color: var(--blood-dim);
}
.perks {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}
.perk-card {
  display: block;
  width: 100%;
  max-width: 380px;
  justify-self: center;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.5);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}
/* lift and glow in the card's own colour: purple = the character's own perk, green = shareable */
.perk-card:hover {
  transform: translateY(-6px) scale(1.015);
}
.perk-card.own:hover {
  box-shadow:
    0 14px 30px rgb(0 0 0 / 0.6),
    0 0 26px rgb(160 80 230 / 0.55);
}
.perk-card.shared:hover {
  box-shadow:
    0 14px 30px rgb(0 0 0 / 0.6),
    0 0 26px rgb(60 200 110 / 0.5);
}
@media (prefers-reduced-motion: reduce) {
  .perk-card:hover {
    transform: none;
  }
}
.perk h3 {
  display: flex;
  gap: 0.4rem;
  align-items: center;
}
.flavor {
  font-style: italic;
  margin: 0 0 0.4rem;
}
.cost {
  display: inline-grid;
  place-items: center;
  min-width: 1.6em;
  height: 1.6em;
  border-radius: 4px;
  background: var(--blood);
  color: #fff;
  font-size: 0.85em;
}
.small {
  font-size: 0.85rem;
  padding: 0.25rem 0.6rem;
}
.large {
  font-size: 1.12rem;
}
.large .mini {
  width: 110px;
  height: 110px;
}
</style>
