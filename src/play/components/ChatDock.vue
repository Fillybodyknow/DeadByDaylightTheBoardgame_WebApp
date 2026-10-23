<script setup lang="ts">
// Where the chat lives on screen, online only.
//  - `room` (the lobby and the picks): beside the room's column on a wide screen, always open;
//    on a narrower one a 💬 button in the corner opens it.
//  - `game`: a 💬 tab on the right edge (under the side panel's tab) opens a drawer over the
//    map's edge; Enter opens it too, ready to type. New messages show as bubbles beside the
//    senders' tiles (StatusPanel marks each player's first tile with `data-chat-seat`); a
//    spectator's, who has no tile, as a line beside the tab. The bubbles are drawn here, on top of
//    everything: the player column scrolls, and would clip anything reaching out of it.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { sfx } from '../../sound'
import { BUBBLE_MS, canChat, chatBubbles, chatHex, chatMessages, chatOpen, chatUnread, lastNotice } from '../chat'
import { session } from '../online/session'
import ChatPanel from './ChatPanel.vue'

const props = defineProps<{ mode: 'room' | 'game' }>()

/** Wide enough for the panel beside the room's column. */
const wideQuery = window.matchMedia('(min-width: 1760px)')
const wide = ref(wideQuery.matches)
const onWide = (e: MediaQueryListEvent) => (wide.value = e.matches)

/** The panel shows for good beside the room. */
const docked = computed(() => props.mode === 'room' && wide.value)

function toggle() {
  sfx.click()
  chatOpen.value = !chatOpen.value
}

/** Enter (with nothing else taking it) opens the game's chat, ready to type. */
const typing = ref(false)
function onKey(e: KeyboardEvent) {
  if (props.mode !== 'game' || e.key !== 'Enter' || e.repeat || chatOpen.value || !canChat.value) return
  const t = e.target as HTMLElement | null
  if (t && (t.closest('input, textarea, select, button, a, [role="button"], [contenteditable="true"]') || t.isContentEditable)) return
  e.preventDefault()
  typing.value = true
  chatOpen.value = true
}
function close() {
  chatOpen.value = false
  typing.value = false
}

onMounted(() => {
  wideQuery.addEventListener('change', onWide)
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  wideQuery.removeEventListener('change', onWide)
  window.removeEventListener('keydown', onKey)
  chatOpen.value = false
})

// ---------- the game: bubbles beside the tiles ----------

interface Placed {
  from: string
  key: string
  text: string
  hex: string
  x: number
  y: number
}

const placed = ref<Placed[]>([])

/** The seat (player number) a member sits in, if any. */
function seatOf(id: string): string | null {
  return Object.entries(session.data?.seats ?? {}).find(([, s]) => s.id === id)?.[0] ?? null
}

async function place() {
  if (props.mode !== 'game') return
  await nextTick()
  const out: Placed[] = []
  for (const [from, b] of Object.entries(chatBubbles.value)) {
    const seat = seatOf(from)
    const tile = seat ? document.querySelector(`[data-chat-seat="${seat}"]`) : null
    if (!tile) continue
    const r = tile.getBoundingClientRect()
    // beside the tile, kept on screen (on a narrow screen the tiles are a row under the map)
    out.push({ from, key: b.key, text: b.text, hex: chatHex(from), x: Math.min(r.right + 10, window.innerWidth - 280), y: Math.max(8, r.top + 4) })
  }
  placed.value = out
}
watch(chatBubbles, place)

/** In the game: the newest message of someone without a tile (a spectator), beside the tab. */
const loose = computed(() => {
  if (props.mode !== 'game' || chatOpen.value) return null
  const from = Object.keys(chatBubbles.value).find((id) => !seatOf(id) && id !== session.me)
  if (!from) return null
  const m = [...chatMessages.value].reverse().find((x) => x.from === from)
  return m
    ? {
        key: chatBubbles.value[from].key,
        name: m.name,
        text: m.text,
        hex: chatHex(from),
      }
    : null
})
</script>

<template>
  <!-- fixed on screen: out of any parent with a backdrop-filter or transform -->
  <Teleport to="body">
    <template v-if="session.room?.chat">
      <!-- beside the room's column -->
      <aside v-if="docked" class="dock docked">
        <h2 class="title">💬 แชทในห้อง</h2>
        <ChatPanel />
      </aside>

      <template v-else>
        <button type="button" class="opener" :class="[mode, { open: chatOpen, news: chatUnread > 0 }]" :title="chatOpen ? 'ปิดแชท' : 'เปิดแชท (Enter)'" @click="toggle">
          <span aria-hidden="true">💬</span>
          <span class="opener-text">แชท</span>
          <b v-if="chatUnread && !chatOpen" class="badge">{{ chatUnread > 99 ? '99+' : chatUnread }}</b>
        </button>
        <Transition name="drawer">
          <aside v-if="chatOpen" class="dock floating" :class="mode">
            <header class="head">
              <h2 class="title">💬 แชทในห้อง</h2>
              <button type="button" class="x" aria-label="ปิดแชท" @click="close">✕</button>
            </header>
            <ChatPanel :autofocus="typing || mode === 'room'" @close="close" />
          </aside>
        </Transition>
        <TransitionGroup name="bubble">
          <p v-for="b in placed" :key="b.key" class="bubble" :style="{ left: `${b.x}px`, top: `${b.y}px`, '--hex': b.hex, '--life': `${BUBBLE_MS}ms` }">{{ b.text }}</p>
        </TransitionGroup>
        <!-- someone joined, left, dropped…: said beside the 💬 button while the chat is closed -->
        <Transition name="loose">
          <p v-if="lastNotice && !chatOpen" :key="lastNotice.id" class="notice-line" :class="[mode, lastNotice.kind]" :style="{ '--life': `${BUBBLE_MS}ms` }">{{ lastNotice.text }}</p>
        </Transition>
        <Transition name="loose">
          <p v-if="loose" :key="loose.key" class="loose" :style="{ '--hex': loose.hex, '--life': `${BUBBLE_MS}ms` }">
            <b :style="{ color: loose.hex }">{{ loose.name }}</b>
            {{ loose.text }}
          </p>
        </Transition>
      </template>
    </template>
  </Teleport>
</template>

<style scoped>
.dock {
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 0.5rem;
  padding: 0.75rem;
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  background: rgb(14 15 19 / 0.96);
  box-shadow: 0 10px 34px rgb(0 0 0 / 0.6);
  /* over the side panel and the start-room strip, under the hand-off curtain (50) and modals */
  z-index: 40;
}
.title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 0.95rem;
  letter-spacing: 0.04em;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.x {
  padding: 0.1rem 0.5rem;
}
/* the lobby on a wide screen: a column of its own on the right */
.docked {
  position: fixed;
  top: 5.5rem;
  right: 1rem;
  bottom: 1rem;
  width: 320px;
}
.floating {
  position: fixed;
  width: min(360px, calc(100vw - 2rem));
  height: min(60vh, 520px);
}
.floating.room {
  right: 1rem;
  bottom: 4.5rem;
}
.floating.game {
  right: 2.8rem;
  bottom: 5.5rem;
}
.opener {
  position: fixed;
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  background: rgb(14 15 19 / 0.95);
  border: 1px solid var(--line-strong);
}
.opener.room {
  right: 1rem;
  bottom: 1rem;
  padding: 0.55rem 0.9rem;
  border-radius: 999px;
}
/* the game: a tab on the right edge, like the side panel's */
/* under the side panel's tab, which sits in the middle of the edge */
.opener.game {
  right: 0;
  top: calc(50% + 6.5rem);
  flex-direction: column;
  padding: 0.6rem 0.35rem;
  border-right: none;
  border-radius: 10px 0 0 10px;
  box-shadow: -4px 0 18px rgb(0 0 0 / 0.6);
}
.opener.game .opener-text {
  writing-mode: vertical-rl;
  font-size: 0.85rem;
  letter-spacing: 0.08em;
}
.opener.open {
  border-color: var(--blood-bright);
}
.opener.news {
  border-color: #7fd0ff;
  animation: chat-news 1.2s ease-in-out infinite;
}
@keyframes chat-news {
  50% {
    box-shadow:
      0 0 0 2px #7fd0ff,
      0 0 20px rgb(127 208 255 / 0.6);
  }
}
.badge {
  min-width: 1.3rem;
  padding: 0 0.3rem;
  border-radius: 999px;
  background: var(--blood);
  color: #fff;
  font-size: 0.72rem;
  text-align: center;
}
/* a player's message in the game: a speech bubble beside their tile, pointing at it */
.bubble {
  position: fixed;
  z-index: 40;
  max-width: 260px;
  margin: 0;
  padding: 0.4rem 0.65rem;
  border: 1px solid var(--hex);
  border-radius: 10px;
  background: rgb(14 15 19 / 0.96);
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.6);
  font-size: 0.85rem;
  line-height: 1.3;
  overflow-wrap: anywhere;
  pointer-events: none;
  animation: loose-life var(--life) ease-in forwards;
}
.bubble::before {
  content: '';
  position: absolute;
  left: -6px;
  top: 0.7rem;
  width: 10px;
  height: 10px;
  rotate: 45deg;
  background: rgb(14 15 19 / 0.96);
  border-left: 1px solid var(--hex);
  border-bottom: 1px solid var(--hex);
}
.bubble-enter-from {
  opacity: 0;
  translate: -8px 0;
}
.bubble-enter-active {
  transition:
    opacity 0.2s,
    translate 0.2s;
}
/* a spectator's message in the game: a line beside the tab */
.loose {
  position: fixed;
  z-index: 40;
  right: 2.9rem;
  top: calc(50% + 6.5rem);
  max-width: min(320px, 60vw);
  margin: 0;
  padding: 0.45rem 0.7rem;
  border: 1px solid var(--hex);
  border-radius: 10px;
  background: rgb(14 15 19 / 0.94);
  font-size: 0.85rem;
  overflow-wrap: anywhere;
  pointer-events: none;
  animation: loose-life var(--life) ease-in forwards;
}
/* a notice beside the 💬 button: under a spectator's line in the game, over the button in the lobby */
.notice-line {
  position: fixed;
  z-index: 40;
  margin: 0;
  padding: 0.3rem 0.65rem;
  border-radius: 999px;
  border: 1px solid var(--line-strong);
  background: rgb(14 15 19 / 0.94);
  font-size: 0.8rem;
  color: var(--muted);
  pointer-events: none;
  animation: loose-life var(--life) ease-in forwards;
}
.notice-line.game {
  right: 2.9rem;
  top: calc(50% + 9.5rem);
}
.notice-line.room {
  right: 1rem;
  bottom: 4rem;
}
.notice-line.join,
.notice-line.back {
  color: #8fd19e;
}
.notice-line.kick,
.notice-line.drop {
  color: #ff8a80;
}
@keyframes loose-life {
  85% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
.drawer-enter-active,
.drawer-leave-active {
  transition:
    opacity 0.18s ease,
    translate 0.18s ease;
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
  translate: 12px 0;
}
/* leaving (the drawer opened, a newer message): a quick fade, not the rest of the life's animation */
.bubble-leave-active,
.loose-leave-active {
  animation: none;
  transition: opacity 0.15s;
}
.bubble-leave-to,
.loose-leave-to {
  opacity: 0;
}
.loose-enter-from {
  opacity: 0;
  translate: 8px 0;
}
.loose-enter-active {
  transition:
    opacity 0.2s,
    translate 0.2s;
}
</style>
