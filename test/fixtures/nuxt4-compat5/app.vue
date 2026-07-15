<script setup lang="ts">
const { data } = await useHttp<{ message: string }>('/http-client')
</script>

<template>
  <main>{{ data?.message }}</main>
</template>
