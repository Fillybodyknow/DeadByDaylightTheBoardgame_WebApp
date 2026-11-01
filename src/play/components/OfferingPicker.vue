<script setup lang="ts">
// A side's offerings before a trial (p.19): the side's cards in a row, a click burns one (or puts
// it back), and a confirm button once the count is right. Online and on one device alike.
import { computed } from 'vue'
import { offerings as OFFERING_CARDS } from '../../data'
import { asset, lang } from '../../i18n'
import { sfx } from '../../sound'
import { offeringName, offeringsOf, type OfferingId } from '../engine/offerings'
import type { Side } from '../engine/loadout'

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
      <button
        v-for="c in cards"
        :key="c.id"
        type="button"
        class="offer"
        :class="{ on: picked.includes(c.id), dim: confirmed && !picked.includes(c.id) }"
        :disabled="confirmed"
        :title="c.text"
        @click="toggle(c.id)"
      >
        <img :src="asset(c.image)" :alt="c.name" loading="lazy" />
        <b>{{ c.name }}</b>
        <small>{{ c.en }}</small>
      </button>
    </div>
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
.offer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 210px;
  padding: 6px;
  border: 2px solid transparent;
  border-radius: 10px;
  background: rgb(255 255 255 / 0.04);
  color: inherit;
  cursor: pointer;
  transition: transform 0.15s, border-color 0.15s, opacity 0.15s;
}
.offer:hover:not(:disabled) {
  transform: translateY(-3px);
}
.offer img {
  width: 100%;
  border-radius: 6px;
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
.offer:disabled {
  cursor: default;
}
.foot {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}
</style>
