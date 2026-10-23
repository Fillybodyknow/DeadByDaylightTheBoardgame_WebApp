<script setup lang="ts">
// The room's chat: the latest messages, ready-made lines, and a box to type in. The same panel
// sits beside the lobby and in the game's drawer (ChatDock).
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CHAT_MAX } from '../online/transport'
import { session } from '../online/session'
import { QUICK_LINES, canChat, chatError, chatFeed, chatHex, chatSeen, chatWait, sendChat } from '../chat'

const props = defineProps<{ autofocus?: boolean }>()
const emit = defineEmits<{ close: [] }>()

const draft = ref('')
const list = ref<HTMLElement | null>(null)
const box = ref<HTMLInputElement | null>(null)

function send(text = draft.value) {
  if (sendChat(text) && text === draft.value) draft.value = ''
}

function onKey(e: KeyboardEvent) {
  // the game's own keys (Enter to open the chat, Escape, Q to ping) stay out of the box
  e.stopPropagation()
  if (e.key === 'Enter') send()
  if (e.key === 'Escape') {
    box.value?.blur()
    emit('close')
  }
}

const time = (at: number) =>
  new Date(at).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  })

/** Stay at the newest message, unless the reader scrolled up to read older ones. */
let atBottom = true
const onScroll = () => {
  const el = list.value
  if (el) atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
}
watch(
  () => chatFeed.value.length,
  async () => {
    if (!atBottom) return
    await nextTick()
    list.value?.scrollTo({ top: list.value.scrollHeight })
  },
)

onMounted(async () => {
  chatSeen.value = true
  await nextTick()
  list.value?.scrollTo({ top: list.value.scrollHeight })
  if (props.autofocus) box.value?.focus()
})
onBeforeUnmount(() => (chatSeen.value = false))
</script>

<template>
  <section class="chat" aria-label="แชท">
    <ol ref="list" class="msgs" @scroll="onScroll">
      <li v-if="!chatFeed.length" class="empty muted">ยังไม่มีข้อความ — ทุกคนในห้องเห็นแชทนี้ รวมถึง Killer (หน้า 8)</li>
      <!-- yours on the right (no name: it is you), the others' on the left with theirs -->
      <template v-for="m in chatFeed" :key="m.id">
        <!-- someone joined, left, was kicked, dropped or came back: a line in the middle -->
        <li v-if="m.kind !== 'msg'" class="notice" :class="m.kind">
          {{ m.text }} <time>{{ time(m.at) }}</time>
        </li>
        <li v-else class="msg" :class="{ mine: m.from === session.me }" :style="{ '--hex': chatHex(m.from) }">
          <span v-if="m.from !== session.me" class="who">{{ m.name }}</span>
          <span class="text">{{ m.text }}</span>
          <time class="at">{{ time(m.at) }}</time>
        </li>
      </template>
    </ol>
    <template v-if="canChat">
      <div class="quick" aria-label="ข้อความด่วน">
        <button v-for="q in QUICK_LINES" :key="q" type="button" :disabled="chatWait > 0" @click="send(q)">
          {{ q }}
        </button>
      </div>
      <div class="type">
        <input ref="box" v-model="draft" type="text" :maxlength="CHAT_MAX" placeholder="พิมพ์ข้อความ แล้วกด Enter" aria-label="ข้อความ" @keydown="onKey" />
        <button type="button" class="primary" :disabled="!draft.trim() || chatWait > 0" @click="send()">
          {{ chatWait ? `${chatWait} วิ` : 'ส่ง' }}
        </button>
      </div>
      <p v-if="chatError" class="err">{{ chatError }}</p>
    </template>
  </section>
</template>

<style scoped>
.chat {
  display: grid;
  grid-template-rows: 1fr auto auto auto;
  min-height: 0;
  height: 100%;
  gap: 0.45rem;
}
.msgs {
  list-style: none;
  margin: 0;
  padding: 0.2rem 0.25rem;
  overflow-y: auto;
  min-height: 0;
  display: grid;
  align-content: start;
  gap: 0.35rem;
  overscroll-behavior: contain;
}
.empty {
  font-size: 0.82rem;
  padding: 0.4rem 0;
}
.msg {
  justify-self: start;
  max-width: 85%;
  min-width: 5.5rem;
  display: grid;
  grid-template-columns: 1fr auto;
  column-gap: 0.4rem;
  padding: 0.35rem 0.55rem;
  border-radius: 10px 10px 10px 3px;
  background: rgb(255 255 255 / 0.05);
  border-left: 2px solid var(--hex);
}
.msg.mine {
  justify-self: end;
  border-left: none;
  border-right: 2px solid var(--hex);
  border-radius: 10px 10px 3px 10px;
  background: color-mix(in srgb, var(--hex) 16%, rgb(255 255 255 / 0.04));
}
.msg.mine .text {
  text-align: right;
}
.notice {
  justify-self: center;
  font-size: 0.75rem;
  color: var(--muted);
  text-align: center;
}
.notice time {
  margin-left: 0.25rem;
  opacity: 0.7;
}
.notice.join,
.notice.back {
  color: #8fd19e;
}
.notice.kick,
.notice.drop {
  color: #ff8a80;
}
.who {
  font-weight: 700;
  font-size: 0.8rem;
  color: var(--hex);
}
.at {
  grid-row: 1;
  grid-column: 2;
  font-size: 0.7rem;
  color: var(--muted);
}
.text {
  grid-column: 1 / -1;
  font-size: 0.9rem;
  overflow-wrap: anywhere;
  line-height: 1.35;
}
.quick {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.quick button {
  font-size: 0.75rem;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
}
.type {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.35rem;
}
.type input {
  min-width: 0;
}
.err {
  margin: 0;
  font-size: 0.78rem;
  color: var(--warn);
}
</style>
