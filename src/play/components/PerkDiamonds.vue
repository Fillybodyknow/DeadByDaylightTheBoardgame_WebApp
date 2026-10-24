<script setup lang="ts">
// A character's three perks as diamonds, as in the PC game's HUD: one on top, two under it (left,
// right). The icon is cut from the middle of the perk card; a perk used this round is dimmed.
// A click opens the perk's details.
import { computed } from 'vue'
import { asset } from '../../i18n'
import { perkUsed } from '../engine/engine'
import { PERKS, type PerkId } from '../engine/perks'
import type { GameState, PerkOwner } from '../engine/types'
import { VILE_PURGE_IMAGE, perkImage, roundEffects } from '../labels'

const props = defineProps<{ st: GameState; owner: PerkOwner }>()
const emit = defineEmits<{ open: [perk: PerkId] }>()

const perks = computed(() => {
  const list = props.owner === 'killer' ? props.st.killer.perks : props.st.survivors[props.owner].perks
  // a perk under one of The Plague's Vile Purges is covered: it can't be used
  const covered = props.owner === 'killer' ? [] : (props.st.survivors[props.owner].purged ?? [])
  return list.slice(0, 3).map((p) => ({ p, used: perkUsed(props.st, props.owner, p), covered: covered.includes(p), image: perkImage(p) }))
})
const killer = computed(() => props.owner === 'killer')
/** Genetic Limits or Fearmonger on this survivor: none of their perks can be used this round. */
const locked = computed(() => (props.owner === 'killer' ? null : (roundEffects(props.st, props.owner).find((e) => e.noPerks) ?? null)))
</script>

<template>
  <div class="diamonds" :class="{ killer }">
    <button
      v-for="(x, i) in perks"
      :key="x.p"
      type="button"
      class="diamond"
      :class="[`at-${i}`, { used: x.used, covered: x.covered, locked: !!locked }]"
      :title="`${PERKS[x.p].name}${PERKS[x.p].cost ? ` (${PERKS[x.p].cost} ▲)` : ' (ฟรี)'}${locked ? ` — ${locked.text}` : x.covered ? ' — ถูก การชำระมลทินต่ำช้า ปิด ใช้ไม่ได้' : x.used ? ' — ใช้แล้วรอบนี้' : ''} · คลิกเพื่อดู`"
      @click.stop="emit('open', x.p)"
    >
      <span class="face" :style="x.image ? { backgroundImage: `url(${asset(x.image)})` } : {}" />
      <img v-if="x.covered" class="purge" :src="asset(VILE_PURGE_IMAGE)" alt="Vile Purge" />
      <span v-else-if="locked" class="lock" aria-hidden="true">⛔</span>
    </button>
  </div>
</template>

<style scoped>
/* top, then bottom-left and bottom-right, the three diamonds touching at their corners */
.diamonds {
  /* the tile sets --perk-d: bigger where the column has room, the old size on narrow screens */
  --d: var(--perk-d, 40px);
  position: relative;
  flex: none;
  width: calc(var(--d) * 2);
  height: calc(var(--d) * 1.5);
  margin-left: auto;
}
.diamond {
  position: absolute;
  width: var(--d);
  height: var(--d);
  padding: 0;
  border: none;
  /* the frame: a diamond of light behind the icon */
  background: linear-gradient(135deg, #e7d4ff, #7a4fc4);
  clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
  cursor: zoom-in;
  transition:
    transform 0.15s,
    filter 0.15s;
}
.killer .diamond {
  background: linear-gradient(135deg, #ffb3a8, #9a1218);
}
.at-0 {
  left: calc(var(--d) / 2);
  top: 0;
}
.at-1 {
  left: 0;
  top: calc(var(--d) / 2);
}
.at-2 {
  left: var(--d);
  top: calc(var(--d) / 2);
}
.diamond:hover,
.diamond:focus-visible {
  z-index: 1;
  transform: scale(1.18);
  filter: brightness(1.15);
}
/* the icon: the diamond printed on the card, cut out and centred (every card is laid out alike) */
.face {
  position: absolute;
  inset: 2px;
  clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
  background-color: #222;
  background-size: 230% auto;
  background-position: 50% 14%;
  background-repeat: no-repeat;
}
/* covered by a Vile Purge: the token sits on it */
.diamond.covered {
  background: linear-gradient(135deg, #d9f7a8, #5d7d1e);
}
.diamond.covered .face {
  filter: grayscale(1) brightness(0.35);
}
.purge {
  position: absolute;
  inset: 22%;
  width: 56%;
  height: 56%;
  border-radius: 3px;
  pointer-events: none;
}
/* stopped for the round (Genetic Limits, Fearmonger): red, dark, a no-entry sign on it */
.diamond.locked {
  background: linear-gradient(135deg, #ff8a80, #7a0b10);
}
.diamond.locked .face {
  filter: grayscale(1) brightness(0.3);
}
.lock {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 0.8em;
  pointer-events: none;
}
/* used this round: dim and grey, as the PC game greys a perk on cooldown */
.diamond.used {
  background: #444;
}
.diamond.used .face {
  filter: grayscale(1) brightness(0.45);
}
</style>
