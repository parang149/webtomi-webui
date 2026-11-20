<script setup lang="ts">
defineProps<{ label: string; overlay?: boolean }>()
</script>
<template><i class="status-check" :class="{ 'status-check-overlay': overlay }" :title="label" :aria-label="label" role="img">✓</i></template>
<style scoped>
.status-check{display:inline-grid;font-style:normal;place-items:center;flex-shrink:0;vertical-align:middle;width:28px;height:28px;border-radius:50%;background:#22c55e;color:#092116;font-size:14px;font-weight:800;box-shadow:0 2px 7px #0008;pointer-events:none}.status-check-overlay{position:absolute;inset:5px auto auto 5px}
</style>
