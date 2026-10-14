<script setup lang="ts">
import { computed, ref } from 'vue'
import { asset, lang } from '../i18n'
import { DANGER_DIE_FACES, PICKUP_DICE_MAX, SKILL_DIE_IMAGE_FACES, skillResult, type SkillResult } from '../rules'
import { useGameStore } from '../stores/game'

const game = useGameStore()

interface Die {
  image: string
  result: SkillResult
  value: number | null
  rerolled: boolean
  danger: boolean
}

const count = ref(1)
const dice = ref<Die[]>([])
const recorded = ref(true)
const roller = ref(0)

function rollSkill(): Omit<Die, 'rerolled'> {
  const idx = Math.floor(Math.random() * 6)
  const value = SKILL_DIE_IMAGE_FACES[idx]
  return { image: `assets/dice/skill-${idx + 1}.webp`, result: skillResult(value), value, danger: false }
}

function rollDanger(): Omit<Die, 'rerolled'> {
  const idx = Math.floor(Math.random() * 6)
  return { image: `assets/dice/danger-${idx + 1}.webp`, result: DANGER_DIE_FACES[idx], value: null, danger: true }
}

// p.16: re-rolls only happen when an effect allows them.
const allowReroll = ref(false)

function roll(kind: 'skill' | 'danger') {
  // Don't lose the killer's BP from an unconfirmed failure.
  if (!recorded.value) record()
  allowReroll.value = false
  dice.value = Array.from({ length: kind === 'skill' ? count.value : 1 }, () => ({
    ...(kind === 'skill' ? rollSkill() : rollDanger()),
    rerolled: false,
  }))
  recorded.value = false
}

// p.16: the re-rolled result stands and can't be re-rolled again.
function reroll(i: number) {
  const d = dice.value[i]
  if (!allowReroll.value || d.rerolled || recorded.value) return
  dice.value[i] = { ...(d.danger ? rollDanger() : rollSkill()), rerolled: true }
}

// p.18: killer BP for failures is counted once re-rolls are done.
function record() {
  if (recorded.value || !dice.value.length) return
  const who = game.state ? game.survivorName(roller.value) : 'Survivor'
  game.recordRoll(who, dice.value.map((d) => d.result))
  recorded.value = true
}

const best = computed<SkillResult | null>(() => {
  if (!dice.value.length) return null
  const r = dice.value.map((d) => d.result)
  return r.includes('great') ? 'great' : r.includes('success') ? 'success' : 'fail'
})

const t = computed(() =>
  lang.value === 'th'
    ? { title: 'ทอยลูกเต๋า', skill: 'Skill Check', danger: 'Danger Die', dice: 'จำนวนลูก', who: 'ผู้ทอย', allowReroll: 'มีผลที่ให้ทอยใหม่ได้', reroll: 'แตะลูกเต๋าเพื่อทอยใหม่ (ได้ลูกละครั้ง)', confirm: 'ยืนยันผล', done: 'บันทึกแล้ว', fail: 'ล้มเหลว — ฆาตกร +1 ▲', success: 'สำเร็จ', great: 'สำเร็จยิ่งใหญ่!' }
    : { title: 'Dice', skill: 'Skill check', danger: 'Danger die', dice: 'Dice', who: 'Roller', allowReroll: 'An effect allows a re-roll', reroll: 'Tap a die to re-roll it (once each)', confirm: 'Confirm result', done: 'Recorded', fail: 'Failure — Killer +1 ▲', success: 'Success', great: 'Great success!' },
)
</script>

<template>
  <section class="card dice">
    <h3>{{ t.title }}</h3>
    <div class="controls">
      <label v-if="game.state">
        {{ t.who }}
        <select v-model.number="roller">
          <option v-for="(s, i) in game.state.survivors" :key="s.characterId" :value="i">{{ game.survivorName(i) }}</option>
        </select>
      </label>
      <label>
        {{ t.dice }}
        <select v-model.number="count">
          <option v-for="n in PICKUP_DICE_MAX" :key="n" :value="n">{{ n }}</option>
        </select>
      </label>
      <button type="button" @click="roll('skill')">⚫ {{ t.skill }}</button>
      <button type="button" class="danger" @click="roll('danger')">🔴 {{ t.danger }}</button>
    </div>

    <div v-if="dice.length" class="results">
      <button
        v-for="(d, i) in dice"
        :key="i"
        type="button"
        class="die"
        :class="[d.result, { rerolled: d.rerolled }]"
        :disabled="!allowReroll || d.rerolled || recorded"
        @click="reroll(i)"
      >
        <img :src="asset(d.image)" :alt="d.result" />
      </button>
    </div>
    <template v-if="best">
      <p class="verdict" :class="best">{{ t[best] }}</p>
      <label v-if="!recorded" class="muted small reroll">
        <input v-model="allowReroll" type="checkbox" /> {{ t.allowReroll }}
        <span v-if="allowReroll">— {{ t.reroll }}</span>
      </label>
      <button v-if="game.state" type="button" class="primary" :disabled="recorded" @click="record">
        {{ recorded ? t.done : t.confirm }}
      </button>
    </template>
  </section>
</template>

<style scoped>
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: end;
}
.controls label {
  display: flex;
  flex-direction: column;
  font-size: 0.85rem;
}
.danger {
  border-color: var(--blood-dim);
}
.results {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}
.die {
  padding: 0;
  width: 72px;
  height: 72px;
  overflow: hidden;
  border-width: 2px;
  animation: pop 0.25s ease-out;
}
.die img {
  width: 100%;
  height: 100%;
}
.die.fail {
  border-color: var(--blood);
}
.die.great {
  border-color: var(--warn);
}
.die.rerolled {
  opacity: 0.85;
  outline: 2px dashed var(--muted);
}
.die:disabled {
  opacity: 1;
  cursor: default;
}
.verdict {
  font-weight: 800;
  margin: 0.5rem 0 0.25rem;
}
.verdict.fail {
  color: var(--blood);
}
.verdict.success {
  color: var(--ok);
}
.verdict.great {
  color: var(--warn);
}
.small {
  font-size: 0.8rem;
  margin: 0 0 0.5rem;
}
@keyframes pop {
  from {
    transform: scale(0.6) rotate(-20deg);
  }
}
</style>
