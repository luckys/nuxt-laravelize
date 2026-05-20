<script setup lang="ts">
import { counterToken } from './shared/providers/CounterProvider'

const container = useContainer()
const counter = container.make(counterToken)

const firstValue = counter.next()
const secondValue = counter.next()
</script>

<template>
  <div>
    <span data-testid="first-value">{{ firstValue }}</span>
    <span data-testid="second-value">{{ secondValue }}</span>
  </div>
</template>
