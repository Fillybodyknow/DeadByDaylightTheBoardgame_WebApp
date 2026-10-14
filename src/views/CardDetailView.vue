<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import RichText from '../components/RichText.vue'
import { items, killerById, survivorById } from '../data'
import { asset, lang, tr } from '../i18n'

const route = useRoute()
const kind = computed(() => route.params.kind as 'survivor' | 'killer' | 'item')
const id = computed(() => route.params.id as string)

const survivor = computed(() => (kind.value === 'survivor' ? survivorById.get(id.value) : undefined))
const killer = computed(() => (kind.value === 'killer' ? killerById.get(id.value) : undefined))
const item = computed(() => (kind.value === 'item' ? items.find((i) => i.id === id.value) : undefined))
const character = computed(() => survivor.value ?? killer.value)

// Show the scanned board image instead of the transcribed text.
const showBoard = ref(false)
const boardImage = computed(() => {
  const img = character.value?.images
  if (!img) return ''
  return asset(lang.value === 'th' ? (img.boardTh ?? img.boardEn) : (img.boardEn ?? img.boardTh))
})

const t = computed(() =>
  lang.value === 'th'
    ? { back: '← กลับ', board: 'ดูภาพกระดาน', text: 'ดูแบบข้อความ', start: 'เริ่ม', max: 'สูงสุด', power: 'พลัง', passive: 'Passive', perks: 'Perks', extra: 'แอ็กชันพิเศษ', easy: 'ง่าย', hard: 'ยาก', notFound: 'ไม่พบการ์ดนี้' }
    : { back: '← Back', board: 'Show board image', text: 'Show text', start: 'Start', max: 'Max', power: 'Power', passive: 'Passive', perks: 'Perks', extra: 'Extra action', easy: 'Easy', hard: 'Hard', notFound: 'Card not found' },
)
</script>

<template>
  <RouterLink to="/cards" class="muted back">{{ t.back }}</RouterLink>

  <section v-if="character" class="detail">
    <header class="head">
      <img class="mini" :src="asset(character.images.mini)" :alt="character.name" />
      <div>
        <h1>{{ character.name }}</h1>
        <p class="muted">
          {{ survivor ? tr(survivor.title) : killer?.realName }} ·
          <span :class="character.difficulty">{{ t[character.difficulty] }}</span> ·
          BP {{ t.start }} {{ character.bloodpoints.start }} / {{ t.max }} {{ character.bloodpoints.max }}
        </p>
        <button type="button" @click="showBoard = !showBoard">{{ showBoard ? t.text : t.board }}</button>
      </div>
    </header>

    <img v-if="showBoard" class="board" :src="boardImage" :alt="character.name" />
    <template v-else>
      <p>{{ tr(character.description) }}</p>
      <p v-if="survivor && tr(survivor.quote)" class="muted quote">{{ tr(survivor.quote) }}</p>

      <template v-if="killer">
        <div class="card block">
          <h3>{{ t.power }}: {{ killer.power.name }}</h3>
          <RichText :text="tr(killer.power.text)" />
        </div>
        <div v-if="killer.passive" class="card block">
          <h3>{{ t.passive }}</h3>
          <RichText :text="tr(killer.passive)" />
        </div>
        <div v-if="killer.extraAction" class="card block">
          <h3>{{ t.extra }} ({{ killer.extraAction.cost }} BP)</h3>
          <RichText :text="tr(killer.extraAction.text)" />
        </div>
      </template>

      <h2>{{ t.perks }}</h2>
      <div class="perks">
        <article v-for="p in character.perks" :key="p.name" class="card">
          <h3><span class="cost">{{ p.cost }}</span> {{ p.name }}</h3>
          <p class="muted"><em>{{ tr(p.flavor) }}</em></p>
          <RichText :text="tr(p.text)" />
        </article>
      </div>
    </template>
  </section>

  <section v-else-if="item" class="detail">
    <h1>{{ tr(item.name) }} <small class="muted">×{{ item.count }}</small></h1>
    <div class="item">
      <img :src="asset(item.images.th ?? item.images.pt)" :alt="tr(item.name)" />
      <RichText :text="tr(item.text)" />
    </div>
  </section>

  <p v-else>{{ t.notFound }}</p>
</template>

<style scoped>
.back {
  display: inline-block;
  margin-bottom: 0.75rem;
  text-decoration: none;
}
.head {
  display: flex;
  gap: 1rem;
  align-items: center;
  margin-bottom: 1rem;
}
.mini {
  width: 110px;
  height: 110px;
  object-fit: contain;
  background: #000;
  border-radius: var(--radius);
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
.quote {
  font-style: italic;
}
.block {
  margin-bottom: 0.75rem;
}
.perks {
  display: grid;
  gap: 0.75rem;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
}
.cost {
  display: inline-grid;
  place-items: center;
  width: 1.6em;
  height: 1.6em;
  border-radius: 4px;
  background: var(--blood);
  color: #fff;
  font-size: 0.85em;
}
.item {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 320px) 1fr;
  align-items: start;
}
.item img {
  width: 100%;
  border-radius: var(--radius);
}
@media (max-width: 600px) {
  .item {
    grid-template-columns: 1fr;
  }
}
</style>
