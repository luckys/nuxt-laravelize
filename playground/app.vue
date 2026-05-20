<script setup lang="ts">
import { counterToken } from './shared/providers/CounterProvider'

const container = useContainer()
const counter = container.make(counterToken)
const firstValue = counter.next()
const secondValue = counter.next()
</script>

<template>
  <div>
    <p data-testid="first-value">
      {{ firstValue }}
    </p>
    <p data-testid="second-value">
      {{ secondValue }}
    </p>
  </div>
</template>
