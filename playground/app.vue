<template>
  <main>
    <h1>Nuxt Laravelize</h1>
    <p>{{ $t('playground.description') }}</p>
  </main>
</template>

<style scoped>
main {
  display: grid;
  min-height: 100vh;
  place-content: center;
  padding: 2rem;
  text-align: center;
}

h1,
p {
  margin: 0;
}

p {
  margin-top: 0.75rem;
}
</style>
