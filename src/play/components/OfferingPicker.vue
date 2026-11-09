<script setup lang="ts">
// A side's offerings before a trial (p.19): the side's offerings in a row as their hexagons (the
// PC game's offering slot), a click on one shows its card big with its text, the button under it burns it (or puts it back), and a confirm button once the
// count is right. Online and on one device alike.
import { computed, ref } from 'vue'
import { offerings as OFFERING_CARDS } from '../../data'
import { asset, lang } from '../../i18n'
import { sfx } from '../../sound'
import { offeringName, offeringsOf, type OfferingId } from '../engine/offerings'
import type { Side } from '../engine/loadout'
import BpText from '../../components/BpText.vue'
import { offeringIcon } from '../labels'
import ModalShell from './ModalShell.vue'

const props = defineProps<{
  side: Side
  /** How many this side burns. */
  slots: number
  /** Why the pick can't be confirmed yet ('' when it can). */
  problem: string
  confirmed: boolean
}>()
const picked = defineModel<OfferingId[]>({ required: true })
const emit = defineEmits<{ confirm: [on: boolean] }>()

const cards = computed(() =>
  offeringsOf(props.side).map((id) => {
    const c = OFFERING_CARDS.find((x) => x.id === id)!
    return { id, name: offeringName(id), en: c.name, image: (lang.value === 'th' ? c.image.th : c.image.en) ?? c.image.en, text: lang.value === 'th' ? c.text.th : c.text.en }
  }),
)

/** The card shown big. */
const zoomed = ref<OfferingId | null>(null)
const zoom = computed(() => cards.value.find((c) => c.id === zoomed.value) ?? null)

function toggle(id: OfferingId) {
  if (props.confirmed) return
  sfx.select()
  if (picked.value.includes(id)) picked.value = picked.value.filter((o) => o !== id)
  // one slot: a click swaps it; more: the oldest pick goes when the slots are full
  else picked.value = [...picked.value, id].slice(-props.slots)
}
</script>

<template>
  <section class="card offering-picker">
    <h2>🔥 เลือก Offering — {{ side === 'killer' ? 'Killer' : 'Survivor' }} ({{ picked.length }}/{{ slots }})</h2>
    <p class="muted small">เผา Offering ก่อน Setup: มีผลตลอดเกม และทุกคนเห็นเมื่อเกมเริ่ม (หน้า 19)</p>
    <div class="cards">
      <div v-for="c in cards" :key="c.id" class="slot">
        <button
          type="button"
          class="offer"
          :class="{ on: picked.includes(c.id), dim: confirmed && !picked.includes(c.id) }"
          :title="`ดู ${c.name} ใหญ่`"
          @click="zoomed = c.id"
        >
          <img :src="asset(offeringIcon(c.image))" :alt="c.name" loading="lazy" />
          <b>{{ c.name }}</b>
          <small>{{ c.en }}</small>
        </button>
        <button v-if="!confirmed" type="button" class="pick" :class="{ primary: !picked.includes(c.id) }" @click="toggle(c.id)">
          {{ picked.includes(c.id) ? '✓ เลือกแล้ว — กดเพื่อเอาออก' : 'เลือกใบนี้' }}
        </button>
      </div>
    </div>
    <ModalShell :open="!!zoom" :title="zoom?.name ?? ''" width="min(760px, 94vw)" @close="zoomed = null">
      <div v-if="zoom" class="zoom-body">
        <img :src="asset(zoom.image)" :alt="zoom.name" />
        <div class="zoom-text">
          <small class="muted">{{ zoom.en }} · {{ side === 'killer' ? 'Killer' : 'Survivor' }} offering</small>
          <p><BpText :text="zoom.text.replaceAll('{BP}', '▲')" /></p>
          <button v-if="!confirmed" type="button" :class="{ primary: !picked.includes(zoom.id) }" @click="toggle(zoom.id); zoomed = null">
            {{ picked.includes(zoom.id) ? 'เอาออก' : 'เลือกใบนี้' }}
          </button>
        </div>
      </div>
    </ModalShell>
    <div class="foot">
      <p v-if="problem && !confirmed" class="muted small">{{ problem }}</p>
      <button type="button" :class="{ primary: !confirmed }" :disabled="!confirmed && !!problem" @click="emit('confirm', !confirmed)">
        {{ confirmed ? '🔒 ยืนยันแล้ว (กดเพื่อแก้)' : 'ยืนยัน Offering' }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.offering-picker h2 {
  margin: 0 0 4px;
}
.cards {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 12px 0;
}
.slot {
  display: flex;
  flex-direction: column;
}
/* the pick under its card: the card itself only shows it big */
.pick {
  width: 100%;
  margin-top: 6px;
}
.zoom-body {
  display: flex;
  flex-wrap: wrap;
  gap: 1.2rem;
  align-items: flex-start;
}
.zoom-body img {
  width: min(340px, 100%);
  max-height: 70vh;
  object-fit: contain;
  border-radius: 10px;
}
.zoom-text {
  flex: 1 1 240px;
  display: grid;
  gap: 0.8rem;
  justify-items: start;
}
.zoom-text p {
  margin: 0;
  font-size: 1.1rem;
  line-height: 1.6;
}
.offer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 150px;
  padding: 6px;
  border: 2px solid transparent;
  border-radius: 10px;
  background: rgb(255 255 255 / 0.04);
  color: inherit;
  cursor: pointer;
  transition: transform 0.15s, border-color 0.15s, opacity 0.15s;
}
.offer:hover {
  transform: translateY(-3px);
}
/* the hexagon cut from the card (`offering-icons/`) */
.offer img {
  width: 96px;
  height: 108px;
  object-fit: contain;
}
.offer small {
  opacity: 0.6;
}
.offer.on {
  border-color: var(--gold, #d4a640);
  box-shadow: 0 0 14px rgb(212 166 64 / 0.45);
}
.offer.dim {
  opacity: 0.35;
}
.foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}
</style>
