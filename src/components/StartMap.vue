<script setup lang="ts">
import { computed } from 'vue'
import type { GameMap } from '../data/maps'
import { asset } from '../i18n'

export interface PlacedMini {
  key: string
  name: string
  image: string
  face: number | undefined
  killer?: boolean
}

// The map image with each start room outlined, and the minis that rolled into it.
// `animate` drops each token in as it is added; `highlightFace` marks the room being filled.
const props = defineProps<{ map: GameMap; minis: PlacedMini[]; animate?: boolean; highlightFace?: number }>()

const rooms = computed(() =>
  props.map.startRooms.map((r) => ({ ...r, minis: props.minis.filter((m) => m.face === r.face) })),
)

const pct = (n: number) => `${(n * 100).toFixed(2)}%`
</script>

<template>
  <div class="startmap">
    <img class="board" :src="asset(map.image)" :alt="map.name" />
    <div
      v-for="r in rooms"
      :key="r.face"
      class="room"
      :class="{ occupied: r.minis.length, target: highlightFace === r.face }"
      :data-face="r.face"
      :title="`${r.face} — ${r.name}`"
      :style="{ left: pct(r.box[0]), top: pct(r.box[1]), width: pct(r.box[2]), height: pct(r.box[3]) }"
    >
      <div class="tokens" :class="`n${Math.min(r.minis.length, 5)}`">
        <img
          v-for="m in r.minis"
          :key="m.key"
          class="token"
          :class="{ killer: m.killer, drop: animate }"
          :src="asset(m.image)"
          :alt="m.name"
          :title="m.name"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.startmap {
  position: relative;
  width: 100%;
  container-type: inline-size;
}
.board {
  display: block;
  width: 100%;
  border-radius: 8px;
}
.room {
  position: absolute;
  border: 2px dashed rgb(255 255 255 / 0.35);
  border-radius: 6px;
}
.room.occupied {
  border: 3px solid var(--warn);
  box-shadow: 0 0 18px rgb(217 162 39 / 0.6);
}
.tokens {
  position: absolute;
  inset: 0;
  display: flex;
  flex-wrap: wrap;
  align-content: center;
  justify-content: center;
  gap: 0.6cqw;
  padding: 0.6cqw;
}
/* A room card is about 20 × 11 cqw: shrink tokens so several minis in one room still fit
   (3 on one row, 4–5 on two rows). */
.tokens.n3 .token {
  width: 5.6cqw;
  height: 5.6cqw;
}
.tokens.n4 .token,
.tokens.n5 .token {
  width: 4.4cqw;
  height: 4.4cqw;
  border-width: 0.3cqw;
}
.token {
  width: 6.5cqw;
  height: 6.5cqw;
  border-radius: 50%;
  object-fit: cover;
  border: 0.35cqw solid #fff;
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.7);
}
.token.killer {
  border-color: var(--blood);
}
.room.target {
  border: 3px solid #fff;
  box-shadow: 0 0 28px rgb(255 255 255 / 0.7);
  transition: box-shadow 0.2s;
}
/* A mini being set down on the board. */
.token.drop {
  animation: drop 0.55s cubic-bezier(0.25, 1.4, 0.5, 1) both;
}
@keyframes drop {
  0% {
    opacity: 0;
    transform: translateY(-9cqw) scale(1.8);
  }
  60% {
    opacity: 1;
  }
  100% {
    transform: none;
  }
}
@media (prefers-reduced-motion: reduce) {
  .token.drop {
    animation: none;
  }
}
</style>
