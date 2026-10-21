<script setup lang="ts">
// A pill at the top when a newer build is published: one click reloads into it. (A game in
// progress is saved on this device, or in the room, and picks up where it was.)
import { update } from '../update'

const reload = () => location.reload()
</script>

<template>
  <transition name="update">
    <div v-if="update.available" class="update" role="status">
      <span>🆕 มีเวอร์ชันใหม่{{ update.latest ? ` v${update.latest}` : '' }}</span>
      <button type="button" class="primary" @click="reload">อัปเดตตอนนี้</button>
      <button type="button" class="later" aria-label="ไว้ทีหลัง" @click="update.available = false">✕</button>
    </div>
  </transition>
</template>

<style scoped>
.update {
  position: fixed;
  top: 0.6rem;
  left: 50%;
  translate: -50% 0;
  z-index: 65;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.35rem 0.5rem 0.35rem 0.9rem;
  border: 1px solid rgb(255 214 120 / 0.8);
  border-radius: 99px;
  background: rgb(14 15 19 / 0.96);
  box-shadow:
    0 0 24px rgb(255 214 120 / 0.3),
    0 8px 24px rgb(0 0 0 / 0.6);
  color: #fff;
}
.update .primary {
  padding: 0.2rem 0.8rem;
}
.later {
  padding: 0.1rem 0.45rem;
  border: none;
  background: none;
  color: var(--muted);
}
.update-enter-active,
.update-leave-active {
  transition:
    opacity 0.25s,
    translate 0.25s;
}
.update-enter-from,
.update-leave-to {
  opacity: 0;
  translate: -50% -1rem;
}
</style>
