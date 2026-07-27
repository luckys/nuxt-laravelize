<script setup lang="ts">
defineOptions({ name: 'AboutPage' })
const { $t } = useI18n()
</script>

<template>
  <main>{{ $t('nested.only') }}</main>
</template>
