<script setup lang="ts">
const { data } = await useHttp<{ message: string }>('/http-client')
const { $t } = useI18n()
</script>

<template>
  <main>{{ data?.message }} {{ $t('welcome', { name: 'Laravelize' }) }}</main>
</template>
