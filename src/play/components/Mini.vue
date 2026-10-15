<script setup lang="ts">
// A character mini: the art is square with a printed ring and the figure spills past it, so
// crop it to the ring. Auras and wound rings go on this frame (a clip-path on the image
// itself would cut them off).
defineProps<{ src: string; alt?: string }>()
</script>

<template>
  <span class="mini-frame"><img :src="src" :alt="alt ?? ''" draggable="false" /></span>
</template>

<style scoped>
.mini-frame {
  display: inline-block;
  flex: none;
  aspect-ratio: 1;
  border-radius: 50%;
  line-height: 0;
}
img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* the printed ring's outer edge, scaled so it meets the frame */
  clip-path: circle(48.5% at 50% 50%);
  transform: scale(1.031);
}
</style>
