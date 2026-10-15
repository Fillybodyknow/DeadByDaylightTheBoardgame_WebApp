<script setup lang="ts">
// The board's tracks, along the top of the game screen: sacrifice progress, generators, gates.
import { components } from '../../data'
import { asset } from '../../i18n'
import { GENERATORS_TO_POWER, SACRIFICE_TO_WIN, gatesPowered, generatorsDone } from '../engine/engine'
import type { GameState } from '../engine/types'

defineProps<{ st: GameState }>()
</script>

<template>
  <div class="tracks">
    <div class="track" :title="`Sacrifice Progress ${st.sacrifice}/${SACRIFICE_TO_WIN}`">
      <span class="label">Sacrifice</span>
      <span v-for="i in SACRIFICE_TO_WIN" :key="i" class="pip" :class="{ on: i <= st.sacrifice }" />
      <span class="count">{{ st.sacrifice }}/{{ SACRIFICE_TO_WIN }}</span>
    </div>
    <div class="track" :title="`Generator ${generatorsDone(st)}/${GENERATORS_TO_POWER}`">
      <span class="label">Generator</span>
      <img v-for="i in GENERATORS_TO_POWER" :key="i" class="gen" :class="{ on: i <= generatorsDone(st) }" :src="asset(components.generator.image)" alt="" />
      <span class="gate long" :class="{ on: gatesPowered(st) }">{{ gatesPowered(st) ? 'ประตูมีไฟ' : 'ประตูยังไม่มีไฟ' }}</span>
      <span class="gate short" :class="{ on: gatesPowered(st) }">{{ gatesPowered(st) ? 'ประตู ✓' : 'ประตู ✗' }}</span>
    </div>
  </div>
</template>

<style scoped>
.tracks {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 1.6rem;
}
.track {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.label {
  margin-right: 0.3rem;
  font-family: var(--font-display);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
}
.pip {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid var(--blood-dim);
  background: rgb(0 0 0 / 0.4);
}
.pip.on {
  background: radial-gradient(circle at 35% 35%, #ff6b6b, var(--blood) 60%, #5c0b10);
  box-shadow: 0 0 8px rgb(255 30 30 / 0.6);
}
.count {
  margin-left: 0.3rem;
  font-family: var(--font-display);
  font-size: 0.85rem;
  color: #ff8a80;
}
.gen {
  width: 22px;
  height: 22px;
  opacity: 0.25;
  filter: grayscale(1);
}
.gen.on {
  opacity: 1;
  filter: drop-shadow(0 0 6px rgb(245 197 66 / 0.8));
}
.gate {
  margin-left: 0.3rem;
  font-size: 0.8rem;
  color: var(--muted);
}
.gate.on {
  color: #f5c542;
  font-weight: 800;
}
.gate.short {
  display: none;
}
/* in the left rail (GameScreen, wide screens): stacked, the pips wrapping in short rows */
@media (min-width: 981px) and (min-aspect-ratio: 16/9) {
  .tracks {
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }
  /* pips and generators two to a row */
  .track {
    display: grid;
    grid-template-columns: repeat(2, auto);
    justify-content: center;
    justify-items: center;
    gap: 4px;
  }
  .label,
  .count,
  .gate.short {
    grid-column: 1 / -1;
  }
  .gate.long {
    display: none;
  }
  .gate.short {
    display: inline;
  }
  .label,
  .count,
  .gate {
    margin: 0;
    text-align: center;
    white-space: nowrap;
  }
  .label {
    margin-bottom: 0.15rem;
    font-size: 0.58rem;
    letter-spacing: 0.02em;
  }
  .count {
    margin-top: 0.15rem;
    font-size: 0.8rem;
  }
  .gate {
    margin-top: 0.15rem;
    font-size: 0.66rem;
  }
  .pip {
    width: 14px;
    height: 14px;
  }
  .gen {
    width: 16px;
    height: 16px;
  }
}
</style>
