<script setup lang="ts">
// A perk's text with its key words lit, as the PC game's perk boxes do: game terms in gold
// (English names in the Thai text, and the Thai words for the pieces of the game), numbers and
// ▲ in bold white, failures and wounds in red, successes in green.
import { computed } from 'vue'
import BpIcon from '../../components/BpIcon.vue'

const props = defineProps<{ text: string }>()

type Kind = 'term' | 'num' | 'bad' | 'good' | 'bp' | 'plain'

const BAD = ['ล้มเหลว', 'บาดเจ็บ', 'สังเวย', 'ถูกแขวน']
const GOOD = ['สำเร็จยอดเยี่ยม', 'สำเร็จอย่างยิ่ง', 'สำเร็จ', 'หายบาดเจ็บ']
const TERMS = [
  'ผู้รอดชีวิต',
  'ฆาตกร',
  'เครื่องปั่นไฟ',
  'ตะขอแขวน',
  'ตะขอ',
  'ประตูทางออก',
  'การ์ดเคลื่อนที่',
  'เส้นทาง',
  'กล่องไอเทม',
  'ไอเทม',
  'แผ่นพาเลท',
  'พาเลท',
  'กำแพง',
  'ตู้เก็บของ',
  'อีกา',
  'ความคืบหน้า',
  'เทิร์น',
  'เฟส',
]

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// longest first, so "หายบาดเจ็บ" wins over "บาดเจ็บ" and "ตะขอแขวน" over "ตะขอ"
const words = [...GOOD, ...BAD, ...TERMS].sort((a, b) => b.length - a.length).map(escape)
// ▲, numbers, runs of English words ("Skill Check", "Danger Die", "Hex Totem"), the Thai words
const PATTERN = new RegExp(`(▲|\\d+|[A-Za-z][A-Za-z'’&-]*(?: [A-Z][A-Za-z'’&-]*)*|${words.join('|')})`, 'g')

function kindOf(t: string): Kind {
  if (t === '▲') return 'bp'
  if (/^\d+$/.test(t)) return 'num'
  if (BAD.includes(t)) return 'bad'
  if (GOOD.includes(t)) return 'good'
  return 'term'
}

// split() with a capturing pattern alternates: plain text, a match, plain text, a match…
const parts = computed(() =>
  props.text
    .split(PATTERN)
    .map((t, i) => ({ t, kind: i % 2 === 1 ? kindOf(t) : ('plain' as Kind) }))
    .filter((p) => p.t !== ''),
)
</script>

<template>
  <span class="perk-rich">
    <template v-for="(p, i) in parts" :key="i">
      <BpIcon v-if="p.kind === 'bp'" />
      <b v-else-if="p.kind !== 'plain'" :class="p.kind">{{ p.t }}</b>
      <template v-else>{{ p.t }}</template>
    </template>
  </span>
</template>

<style scoped>
.perk-rich {
  white-space: pre-line;
}
b {
  font-weight: 700;
}
.term {
  color: #f5c542;
}
.num {
  color: #fff;
}
.bad {
  color: #ff5a4f;
}
.good {
  color: #8fe36a;
}
</style>
