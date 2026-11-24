<script setup lang="ts">
defineProps<{ label: string; overlay?: boolean; gray?: boolean; double?: boolean }>()
</script>
<template><i class="status-check" :class="{ 'status-check-overlay': overlay, 'status-check-gray': gray }" :title="label" :aria-label="label" role="img"><svg v-if="double" width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18 6-11 11-5-5M22 10l-7 7-2-2" /></svg><template v-else>✓</template></i></template>
<style scoped>
.status-check{display:inline-grid;font-style:normal;place-items:center;flex-shrink:0;vertical-align:middle;width:28px;height:28px;border-radius:50%;background:#22c55e;color:#092116;font-size:14px;font-weight:800;box-shadow:0 2px 7px #0008;pointer-events:none}.status-check-gray{background:#62666e;color:#fff}.status-check-overlay{position:absolute;inset:5px auto auto 5px}
</style>
