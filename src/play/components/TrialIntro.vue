<script setup lang="ts">
// The game's loading screen as it opens (once per game). The minis' start-room rolls that
// follow the reveals (p.6 step 11) are played on the map itself: see StartPlacement.
import { watch } from 'vue'
import { loading, quoteOrTip, showLoading } from '../../loading'
import { SEEN_LOADING, firstTime, gameKey } from '../intro'
import type { GameState } from '../engine/types'

const props = defineProps<{ st: GameState }>()

watch(
  () => props.st,
  (st) => {
    if (st.round !== 1 || st.phase !== 'setup' || loading.active) return
    if (firstTime(SEEN_LOADING, gameKey(st))) showLoading(
      'กำลังเข้าสู่ Trial…',
      quoteOrTip(st.survivors.map((s) => s.characterId)),
    )
  },
  { immediate: true },
)
</script>

<template>
  <span hidden />
</template>
