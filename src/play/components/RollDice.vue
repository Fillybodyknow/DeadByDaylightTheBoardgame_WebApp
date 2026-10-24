<script setup lang="ts">
// A roll waiting on a decision, its dice to click: Bond's die to keep, or a die to re-roll with a
// key (struggling free from a carry rolls up to 4, so the die is picked here). With both on
// offer, clicking keeps a die until "use a key" is chosen; with several keys, whose is chosen first.
import { computed, ref, watch } from 'vue'
import { ITEM_NAMES } from '../engine/engine'
import type { Action, GameState } from '../engine/types'
import DiceRow from './DiceRow.vue'
import FaceLabel from './FaceLabel.vue'

/** `keyHolders`: the key holders on this device. `canKeep`: this device may keep Bond's die now. */
const props = defineProps<{ st: GameState; keyHolders: number[]; canKeep: boolean }>()
const emit = defineEmits<{ act: [action: Action] }>()

const step = computed(() => (props.st.step.t === 'roll' ? props.st.step : null))
const keep = computed(() => !!step.value?.keep && props.canKeep)

/** Whose key the next click uses (null: the click keeps Bond's die). */
const keyMode = ref<number | null>(null)
watch(
  () => [JSON.stringify(step.value?.dice), props.keyHolders.join(), keep.value] as const,
  () => {
    // one key and nothing to keep: the dice re-roll straight away
    keyMode.value = !keep.value && props.keyHolders.length === 1 ? props.keyHolders[0] : null
  },
  { immediate: true },
)

const pickable = computed(() => {
  const s = step.value
  if (!s) return []
  if (keyMode.value !== null) return s.dice.map((d) => !d.rerolled)
  return s.dice.map(() => keep.value)
})

const hint = computed(() => {
  if (keyMode.value !== null) {
    const sv = props.st.survivors[keyMode.value]
    return `ทิ้ง ${ITEM_NAMES[sv.item!]} ของ ${sv.name} ทอยลูกนี้ใหม่`
  }
  return keep.value ? 'พันธะ: เก็บลูกนี้' : ''
})

function pick(i: number) {
  if (keyMode.value !== null) emit('act', { t: 'reroll', s: keyMode.value, die: i })
  else if (keep.value) emit('act', { t: 'acceptRoll', die: i })
}
</script>

<template>
  <div class="roll-dice">
    <DiceRow v-if="step" :dice="step.dice" big :pickable="pickable" :pick-hint="hint" @pick="pick" />
    <p v-if="hint" class="small hint">👆 คลิกลูกเต๋า: {{ hint }}</p>
    <!-- whose key, when there is a choice (Bond to keep, or several keys) -->
    <div v-if="keyHolders.length && (keep || keyHolders.length > 1)" class="keys">
      <button v-for="s in keyHolders" :key="s" :class="{ on: keyMode === s }" @click="keyMode = keyMode === s ? null : s">
        <FaceLabel :st="st" :who="s" :text="keyMode === s ? `🔑 ${st.survivors[s].name}: เลือกลูกที่จะทอยใหม่ (คลิกอีกครั้งเพื่อยกเลิก)` : `🔑 ใช้ ${ITEM_NAMES[st.survivors[s].item!]} ของ ${st.survivors[s].name} ทอยใหม่`" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.roll-dice {
  display: grid;
  gap: 0.4rem;
  justify-items: start;
}
.hint {
  margin: 0;
  color: #ffe9b0;
}
.keys {
  display: grid;
  gap: 0.3rem;
  width: 100%;
}
.keys button.on {
  border-color: #ffe9b0;
  box-shadow: 0 0 10px rgb(255 214 140 / 0.5);
}
</style>
