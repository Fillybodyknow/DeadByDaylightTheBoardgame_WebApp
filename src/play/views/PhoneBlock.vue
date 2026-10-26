<script setup lang="ts">
// Shown instead of the full game on a phone (see ../device.ts).
import { RouterLink } from 'vue-router'
</script>

<template>
  <section class="card phone-block">
    <span class="icon" aria-hidden="true">💻</span>
    <h2>เล่นเต็มเกมได้บนคอมพิวเตอร์หรือ iPad เท่านั้น</h2>
    <p class="muted">กระดาน แผงตัดสินใจ และสถานะผู้เล่นต้องใช้จอใหญ่ — สมาร์ตโฟนยังไม่รองรับโหมด Online / Offline</p>
    <div class="row">
      <RouterLink class="btn primary" to="/">กลับเมนู</RouterLink>
    </div>
  </section>
</template>

<style scoped>
.phone-block {
  max-width: 30rem;
  margin: 2rem auto;
  display: grid;
  gap: 0.6rem;
  justify-items: center;
  text-align: center;
}
.icon {
  font-size: 2.6rem;
}
h2 {
  margin: 0;
  font-size: 1.25rem;
}
p {
  margin: 0;
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
  margin-top: 0.4rem;
}
.btn {
  display: inline-block;
  padding: 0.55rem 1rem;
  border: 1px solid var(--line-strong);
  border-radius: var(--radius);
  color: var(--text);
  text-decoration: none;
}
.btn.primary {
  border-color: var(--blood);
  background: var(--blood);
  color: #fff;
}
</style>
