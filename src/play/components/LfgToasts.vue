<script setup lang="ts">
// Rooms announced in the looking-for-players chat, as cards in the top right of any page
// (lfgNotify.ts): who, what the room lacks, their words, and the way in or to the chat.
import { useRouter } from 'vue-router'
import { sfx } from '../../sound'
import { needLabel } from '../online/lfg'
import { dropToast, lfgToasts } from '../lfgNotify'

const router = useRouter()

function join(id: string, room: string) {
  sfx.select()
  dropToast(id)
  // the online page joins a room from a link (asking a name or a password if it needs one)
  void router.push({ path: '/online', query: { room } })
}
function toChat() {
  sfx.click()
  void router.push('/lfg')
}
</script>

<template>
  <Teleport to="body">
    <TransitionGroup name="toast" tag="ul" class="lfg-toasts" aria-live="polite">
      <li v-for="t in lfgToasts" :key="t.id" class="toast">
        <div class="head">
          <span class="ico" aria-hidden="true">📢</span>
          <span class="title"><b>{{ t.m.name }}</b> ประกาศหาผู้เล่น</span>
          <button type="button" class="x" aria-label="ปิด" @click="dropToast(t.id)">✕</button>
        </div>
        <p class="body">
          <span v-if="t.m.need" class="need" :class="t.m.need">{{ needLabel(t.m.need) }}</span>
          <span class="muted">ห้อง {{ t.m.room }}</span>
        </p>
        <p v-if="t.m.text" class="text">{{ t.m.text }}</p>
        <div class="actions">
          <button type="button" @click="toChat">ดูแชต</button>
          <button type="button" class="primary" @click="join(t.id, t.m.room!)">เข้าห้อง</button>
        </div>
      </li>
    </TransitionGroup>
  </Teleport>
</template>

<style scoped>
.lfg-toasts {
  position: fixed;
  top: 68px;
  right: 16px;
  z-index: 60;
  display: grid;
  gap: 0.5rem;
  width: min(360px, calc(100vw - 32px));
  margin: 0;
  padding: 0;
  list-style: none;
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  display: grid;
  gap: 0.35rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid rgb(79 179 106 / 0.7);
  border-left: 3px solid var(--ok);
  background: rgb(12 13 16 / 0.97);
  box-shadow:
    0 10px 30px rgb(0 0 0 / 0.6),
    0 0 18px rgb(79 179 106 / 0.2);
}
.head {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}
.title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.x {
  padding: 0.05rem 0.4rem;
  border: none;
  background: none;
  color: var(--muted);
}
.body,
.text {
  margin: 0;
  font-size: 0.88rem;
}
.body {
  display: flex;
  gap: 0.5rem;
}
.text {
  color: #cfcac0;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.need.killer {
  color: #ff9a9a;
}
.need.survivor {
  color: #9cc4ff;
}
.need.any {
  color: var(--ok);
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.4rem;
}
.actions button {
  padding: 0.3rem 0.8rem;
  font-size: 0.9rem;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(24px);
}
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}
</style>
