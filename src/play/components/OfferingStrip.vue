<script setup lang="ts">
// The offerings burnt for this game (p.19), under both sides' goals: a small card each, the
// killer's then the survivors'. A click shows them all big with their text.
import { computed, ref } from 'vue'
import { offerings as OFFERING_CARDS } from '../../data'
import { asset, lang } from '../../i18n'
import { OFFERING_SIDE, offeringName, type OfferingId } from '../engine/offerings'
import type { GameState } from '../engine/types'
import ModalShell from './ModalShell.vue'

const props = defineProps<{ st: GameState }>()
const open = ref(false)

const cards = computed(() =>
  [...(props.st.offerings ?? [])]
    .sort((a, b) => Number(OFFERING_SIDE[a] === 'survivor') - Number(OFFERING_SIDE[b] === 'survivor'))
    .map((id: OfferingId) => {
      const c = OFFERING_CARDS.find((x) => x.id === id)!
      return {
        id,
        side: OFFERING_SIDE[id],
        name: offeringName(id),
        image: (lang.value === 'th' ? c.image.th : c.image.en) ?? c.image.en,
        text: lang.value === 'th' ? c.text.th : c.text.en,
        used: props.st.offeringsUsed?.includes(id) ?? false,
      }
    }),
)
</script>

<template>
  <div v-if="cards.length">
    <button type="button" class="strip" title="Offering ของเกมนี้ — คลิกดูรายละเอียด" @click="open = true">
      <span class="label">🔥</span>
      <img v-for="c in cards" :key="c.id" :class="[c.side, { used: c.used }]" :src="asset(c.image)" :alt="c.name" />
    </button>
    <ModalShell :open="open" title="🔥 Offering ของเกมนี้" width="560px" @close="open = false">
      <div class="list">
        <div v-for="c in cards" :key="c.id" class="row">
          <img :src="asset(c.image)" :alt="c.name" />
          <div>
            <small class="muted">{{ c.side === 'killer' ? 'Killer' : 'Survivor' }}{{ c.used ? ' · ใช้ไปแล้วรอบนี้' : '' }}</small>
            <h3>{{ c.name }}</h3>
            <p>{{ c.text.replaceAll('{BP}', '▲') }}</p>
          </div>
        </div>
      </div>
    </ModalShell>
  </div>
</template>

<style scoped>
.strip {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  width: 100%;
  margin-top: 0.35rem;
  padding: 0.25rem 0.4rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: rgb(10 11 14 / 0.9);
  cursor: pointer;
}
.strip:hover {
  border-color: #d4a640;
}
.label {
  font-size: 0.9rem;
}
.strip img {
  height: 44px;
  border-radius: 3px;
  box-shadow: 0 2px 6px rgb(0 0 0 / 0.6);
}
.strip img.killer {
  outline: 1px solid rgb(255 60 60 / 0.6);
}
.strip img.survivor {
  outline: 1px solid rgb(120 180 255 / 0.6);
}
.strip img.used {
  filter: grayscale(0.8) brightness(0.6);
}
.list {
  display: grid;
  gap: 0.9rem;
}
.row {
  display: flex;
  gap: 0.9rem;
  align-items: flex-start;
}
.row img {
  width: 130px;
  flex: none;
  border-radius: 6px;
}
.row h3 {
  margin: 0.1rem 0 0.35rem;
}
.row p {
  margin: 0;
  line-height: 1.5;
}
</style>
