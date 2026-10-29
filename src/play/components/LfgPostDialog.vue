<script setup lang="ts">
// 📢 ประกาศหาคน from a lobby: a message to the looking-for-players chat (online/lfg.ts, #/lfg)
// with the room on it, the side it lacks and a few words, joined from the chat in one click.
import { ref, watch } from 'vue'
import { sfx } from '../../sound'
import ModalShell from './ModalShell.vue'
import { LFG_NEEDS, LFG_TEXT_MAX, needLabel, sendLfg, type LfgNeed } from '../online/lfg'

const props = defineProps<{
  open: boolean
  /** The sender's name. */
  name: string
  room: string
  roomName?: string
  /** The side to start from (what the room lacks). */
  need: LfgNeed
}>()
const emit = defineEmits<{ close: []; posted: [] }>()

const need = ref<LfgNeed>('any')
const text = ref('')
const busy = ref(false)
const error = ref('')

watch(
  () => props.open,
  (on) => {
    if (!on) return
    need.value = props.need
    error.value = ''
  },
  { immediate: true },
)

async function post() {
  busy.value = true
  error.value = ''
  try {
    await sendLfg({ name: props.name, text: text.value, room: props.room, need: need.value })
    sfx.select()
    text.value = ''
    emit('posted')
    emit('close')
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <ModalShell :open="open" title="📢 ประกาศหาคน" width="460px" @close="emit('close')">
    <p class="with-room">
      ส่งไปที่ห้องแชต <b>หาผู้เล่น</b> พร้อมห้อง <b>{{ roomName || `ห้อง ${room}` }}</b> <small class="muted">({{ room }})</small> — คนที่เห็นกดเข้าห้องได้เลย
    </p>

    <div class="field">
      <small>ห้องนี้ขาด</small>
      <div class="seg" role="radiogroup">
        <button v-for="n in LFG_NEEDS" :key="n" type="button" role="radio" :aria-checked="need === n" :class="{ on: need === n }" @click="need = n">
          {{ needLabel(n) }}
        </button>
      </div>
    </div>

    <label class="field">
      <small>ข้อความ (ไม่บังคับ)</small>
      <textarea v-model="text" :maxlength="LFG_TEXT_MAX" rows="3" placeholder="เช่น มือใหม่ก็มาได้ เล่นโหมด Bloodweb" />
      <small class="count muted">{{ text.length }}/{{ LFG_TEXT_MAX }}</small>
    </label>

    <p v-if="error" class="notice error">{{ error }}</p>
    <template #footer>
      <button type="button" @click="emit('close')">ยกเลิก</button>
      <button type="button" class="primary" :disabled="busy" @click="post">📢 ส่งประกาศ</button>
    </template>
  </ModalShell>
</template>

<style scoped>
.field {
  display: grid;
  gap: 0.3rem;
  margin-bottom: 0.8rem;
}
.field small {
  color: var(--muted);
}
.with-room {
  margin: 0 0 0.8rem;
  padding: 0.5rem 0.7rem;
  border: 1px solid rgb(79 179 106 / 0.5);
  background: rgb(79 179 106 / 0.08);
}
.seg {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.seg button {
  flex: 1;
  padding: 0.45rem 0.6rem;
  white-space: nowrap;
}
.seg button.on {
  border-color: var(--blood-bright);
  background: var(--blood);
  color: #fff;
}
textarea {
  font: inherit;
  color: var(--text);
  background: rgb(0 0 0 / 0.5);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  padding: 0.5rem 0.7rem;
  resize: vertical;
}
textarea:focus {
  border-color: var(--blood);
  outline: none;
}
.count {
  justify-self: end;
  font-size: 0.75rem;
}
.notice.error {
  margin: 0;
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--blood);
  color: var(--blood-bright);
}
</style>
