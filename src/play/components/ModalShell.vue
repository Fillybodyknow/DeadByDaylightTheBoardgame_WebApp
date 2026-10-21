<script setup lang="ts">
// A dialog over the page: a dimmed backdrop, a titled box, closed by Esc, a click outside or the
// ✕. The first field inside takes the focus when it opens. Teleported to the body, because the
// panels' backdrop-filter would trap a fixed box inside them.
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{ open: boolean; title: string; width?: string }>()
const emit = defineEmits<{ close: [] }>()

const box = ref<HTMLElement | null>(null)

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

watch(
  () => props.open,
  async (on) => {
    if (on) {
      window.addEventListener('keydown', onKey)
      await nextTick()
      box.value?.querySelector<HTMLElement>('input, button.primary')?.focus()
    } else window.removeEventListener('keydown', onKey)
  },
  { immediate: true },
)
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="modal-back" @mousedown.self="emit('close')">
        <div ref="box" class="modal-box" role="dialog" aria-modal="true" :aria-label="title" :style="{ width: width ?? '440px' }">
          <header class="modal-head">
            <h2>{{ title }}</h2>
            <button type="button" class="modal-x" aria-label="ปิด" @click="emit('close')">✕</button>
          </header>
          <div class="modal-body"><slot /></div>
          <footer v-if="$slots.footer" class="modal-foot"><slot name="footer" /></footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-back {
  position: fixed;
  inset: 0;
  z-index: 70;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgb(0 0 0 / 0.72);
  backdrop-filter: blur(3px);
}
.modal-box {
  position: relative;
  max-width: 100%;
  max-height: 100%;
  overflow-y: auto;
  background: rgb(12 13 17 / 0.98);
  border: 1px solid var(--line-strong);
  box-shadow: 0 24px 80px rgb(0 0 0 / 0.8);
}
/* the red notch on the top-left, as the panels */
.modal-box::before {
  content: '';
  position: absolute;
  top: -1px;
  left: -1px;
  width: 52px;
  height: 3px;
  background: var(--blood);
  box-shadow: 0 0 10px var(--blood);
}
.modal-head {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.2rem 0.6rem;
}
.modal-head h2 {
  flex: 1;
  margin: 0;
  font-size: 1.25rem;
  letter-spacing: 0.03em;
}
.modal-x {
  padding: 0.15rem 0.55rem;
  font-size: 1rem;
  background: none;
  border: 1px solid var(--line-strong);
}
.modal-body {
  display: grid;
  gap: 0.8rem;
  padding: 0.4rem 1.2rem 1rem;
}
.modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 0.8rem 1.2rem;
  background: rgb(255 255 255 / 0.03);
  border-top: 1px solid var(--line);
}
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.18s;
}
.modal-enter-active .modal-box {
  animation: modal-in 0.22s cubic-bezier(0.2, 1.2, 0.4, 1);
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
@keyframes modal-in {
  from {
    transform: translateY(14px) scale(0.97);
  }
}
@media (prefers-reduced-motion: reduce) {
  .modal-enter-active .modal-box {
    animation: none;
  }
}
</style>
