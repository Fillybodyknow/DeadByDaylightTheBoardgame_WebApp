<script setup lang="ts">
// Online undo by vote (online/undo.ts): while a player asks to take back their last move, the other
// side's players vote here, everyone else sees the count, and then how it ended, for a few seconds.
import { computed, watch } from 'vue'
import { sfx } from '../../sound'
import { KILLER_PLAYER } from '../engine/seats'
import { mySeat, session } from '../online/session'
import { undoAsksMe, undoOutcome, undoSecondsLeft, undoTally, undoVote, voteUndo } from '../online/undo'

const nameOf = (p: number) => session.data?.seats[String(p)]?.name || `ผู้เล่น ${p}`
const sideOf = (p: number) => (p === KILLER_PLAYER ? 'Killer' : 'Survivor')

/** The side that decides on `by`'s request. */
const deciders = (by: number) => (by === KILLER_PLAYER ? 'ฝั่ง Survivor' : 'Killer')

const v = computed(() => undoVote.value)
const mine = computed(() => !!v.value && v.value.by === mySeat.value)
const myVote = computed(() => (v.value && mySeat.value ? v.value.votes?.[String(mySeat.value)] : undefined))

const RESULT: Record<string, string> = {
  yes: 'ย้อนการกระทำแล้ว',
  no: 'ไม่ได้ย้อน — โหวตไม่ผ่าน',
  failed: 'ย้อนไม่ได้ — เกมเปลี่ยนไปแล้ว',
}

// a request that asks this player: a sound, so it is not missed
watch(undoAsksMe, (on) => on && sfx.select())

function vote(yes: boolean) {
  sfx.click()
  void voteUndo(yes)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="v" class="undo-vote card" role="alertdialog" :aria-label="`${nameOf(v.by)} ขอย้อนการกระทำ`">
      <p class="head">
        ↶ <b>{{ nameOf(v.by) }}</b> ({{ sideOf(v.by) }}) ขอย้อนการกระทำล่าสุด
        <b class="clock" :class="{ low: undoSecondsLeft <= 10 }">⏱ {{ undoSecondsLeft }} วิ</b>
      </p>
      <p v-if="v.what" class="what">“{{ v.what }}”</p>
      <p class="muted small">
        {{ deciders(v.by) }} ตัดสิน — ต้องเห็นด้วยเกินครึ่ง
        <template v-if="undoTally">({{ undoTally.yes }}/{{ undoTally.need }} จาก {{ undoTally.voters.length }} คน · ไม่ให้ {{ undoTally.no }})</template>
        · ระหว่างโหวตเกมหยุดไว้
      </p>
      <div v-if="undoAsksMe" class="buttons">
        <button type="button" class="primary" @click="vote(true)">ให้ย้อน</button>
        <button type="button" @click="vote(false)">ไม่ให้</button>
      </div>
      <p v-else-if="myVote !== undefined" class="muted small">คุณโหวต{{ myVote ? 'ให้ย้อน' : 'ไม่ให้' }}แล้ว — รอคนอื่น</p>
      <p v-else-if="mine" class="muted small">รอ{{ deciders(v.by) }}โหวต…</p>
    </div>
    <div v-else-if="undoOutcome" class="undo-vote card outcome" :class="undoOutcome.result" role="status">
      ↶ {{ nameOf(undoOutcome.by) }}: {{ RESULT[undoOutcome.result!] }}
    </div>
  </Teleport>
</template>

<style scoped>
.undo-vote {
  position: fixed;
  top: 76px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 60;
  width: min(460px, calc(100vw - 32px));
  padding: 12px 16px;
  border: 1px solid var(--gold, #d4a640);
  box-shadow: 0 8px 30px rgb(0 0 0 / 0.6);
}
.undo-vote p {
  margin: 0 0 6px;
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
}
.clock {
  margin-left: auto;
  color: var(--gold, #d4a640);
}
.clock.low {
  color: #ff6b6b;
}
.what {
  font-style: italic;
  opacity: 0.9;
}
.buttons {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.buttons button {
  flex: 1;
}
.outcome {
  text-align: center;
  font-weight: 600;
}
.outcome.yes {
  border-color: #4caf50;
}
.outcome.no,
.outcome.failed {
  border-color: #b33;
}
</style>
