<script setup lang="ts">
// The companion's game-start sequence for the full game: a loading screen, then each mini's
// start-room roll (p.6 step 11). The engine has already rolled; the faces are read back from the
// rooms the minis start in. Shown once per game, while it is still in setup.
import { computed, ref, watch } from 'vue'
import StartRollIntro from '../../components/StartRollIntro.vue'
import { mapById, survivorById, killerById } from '../../data'
import { loading, quoteOrTip, showLoading } from '../../loading'
import { boards } from '../engine/boards'
import type { GameState } from '../engine/types'

const props = defineProps<{ st: GameState }>()

const SEEN = 'dbdl-play-intro-seen'

/** Same for every device in the same game, different between games. */
function gameKey(st: GameState): string {
  return [st.board, st.killer.characterId, st.killer.room, ...st.survivors.map((s) => `${s.characterId}@${s.room}`), st.props.map((p) => p.kind).join('')].join('|')
}

function seen(key: string): boolean {
  try {
    return sessionStorage.getItem(SEEN) === key
  } catch {
    return false
  }
}

const intro = ref<{ key: string; st: GameState } | null>(null)

watch(
  () => props.st,
  (st) => {
    if (intro.value || st.phase !== 'setup' || st.round !== 1) return
    const key = gameKey(st)
    if (seen(key)) return
    try {
      sessionStorage.setItem(SEEN, key)
    } catch {
      // storage blocked: the intro may play again after a reload
    }
    intro.value = { key, st }
    showLoading('กำลังเข้าสู่ Trial…', quoteOrTip(st.survivors.map((s) => s.characterId)))
  },
  { immediate: true },
)

const map = computed(() => (intro.value ? mapById.get(intro.value.st.board) : undefined))

const minis = computed(() => {
  const st = intro.value?.st
  if (!st) return []
  const rooms = boards[st.board].rooms
  const faceOf = (room: string) => rooms.find((r) => r.id === room)?.startFace ?? undefined
  const roomName = (room: string) => rooms.find((r) => r.id === room)?.name
  // survivors in turn order from the first player, then the killer (as in the companion)
  const order = [0, 1, 2, 3].map((i) => (st.firstPlayer + i) % 4)
  return [
    ...order.map((i) => {
      const sv = st.survivors[i]
      return {
        key: `s${i}`,
        name: sv.name,
        image: survivorById.get(sv.characterId)?.images.mini ?? '',
        face: faceOf(sv.room),
        player: `ผู้เล่น ${st.handPlayers[sv.hand]}`,
        room: roomName(sv.room),
      }
    }),
    {
      key: 'killer',
      killer: true,
      name: st.killer.name,
      image: killerById.get(st.killer.characterId)?.images.mini ?? '',
      face: faceOf(st.killer.room),
      player: 'ผู้เล่น 1',
      room: roomName(st.killer.room),
    },
  ]
})
</script>

<template>
  <!-- waits for the loading screen so the heartbeat and dice don't play behind it -->
  <StartRollIntro v-if="intro && map && !loading.active" :map="map" :minis="minis" @done="intro = null" />
</template>
