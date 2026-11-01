<script setup lang="ts">
// Which side burns offerings before setup (p.19), how many, and whether they are drawn: the room
// settings' row online, and the players step's on one device.
import type { OfferingPlan } from '../engine/offerings'

defineProps<{ disabled?: boolean }>()
const plan = defineModel<OfferingPlan>('plan', { required: true })
const count = defineModel<number>('count', { required: true })
const random = defineModel<boolean>('random', { required: true })

const PLANS: { id: OfferingPlan; label: string }[] = [
  { id: 'none', label: 'ไม่ใช้' },
  { id: 'survivors', label: 'ฝั่ง Survivor' },
  { id: 'killer', label: 'ฝั่ง Killer' },
  { id: 'both', label: 'ฝั่งละ 1' },
]
</script>

<template>
  <div class="seg">
    <button v-for="p in PLANS" :key="p.id" type="button" :class="{ on: plan === p.id }" :disabled="disabled" @click="plan = p.id">{{ p.label }}</button>
  </div>
  <template v-if="plan !== 'none'">
    <div v-if="plan !== 'both'" class="seg">
      <button v-for="n in [1, 2]" :key="n" type="button" :class="{ on: count === n }" :disabled="disabled" @click="count = n">{{ n }} ใบ</button>
    </div>
    <label class="check">
      <input type="checkbox" :checked="random" :disabled="disabled" @change="random = !random" />
      🎲 สุ่มจากกอง (ไม่ต้องเลือก)
    </label>
  </template>
  <small class="muted hint">
    เผาก่อน Setup มีผลตลอดเกม — ให้ฝั่งที่เสียเปรียบใช้ 1–2 ใบ หรือฝั่งละ 1 ใบให้สมดุล (หน้า 19)
  </small>
</template>

<style scoped>
/* as the room settings' rows (RoomSettingsCard): this sits in one of them, and on the offline page */
.seg {
  display: inline-flex;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  overflow: hidden;
}
.seg button {
  border: 0;
  border-radius: 0;
  padding: 0.4rem 0.8rem;
  background: none;
}
.seg button + button {
  border-left: 1px solid var(--line-strong);
}
.seg button.on {
  background: var(--blood);
  color: #fff;
  opacity: 1;
}
.check {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.9rem;
}
.hint {
  flex-basis: 100%;
}
</style>
