<script setup lang="ts">
/* eslint-disable @stylistic/max-statements-per-line */
import { computed, shallowRef, watch } from 'vue'
import type { DeadLetterOperationsDetail, PendingDeadLetterMutation, RetryInput } from '../types'

const props = defineProps<{ item: DeadLetterOperationsDetail, loading?: boolean, retrying?: boolean, pending?: PendingDeadLetterMutation | null }>()
const emit = defineEmits<{ retry: [input: RetryInput], discard: [input: { reason: string }], retrySameOperation: [], abandon: [] }>()
const retryReason = shallowRef('')
const discardReason = shallowRef('')
const availableAt = shallowRef(new Date(Date.now() + 60_000).toISOString())
const retryConfirmed = shallowRef(false)
const discardConfirmed = shallowRef(false)
const isInbox = computed(() => props.item.key.namespace === 'inbox')
watch(() => props.item.key, () => { retryReason.value = ''; discardReason.value = ''; retryConfirmed.value = false; discardConfirmed.value = false; availableAt.value = new Date(Date.now() + 60_000).toISOString() })
watch(() => props.pending, (pending, previous) => { if (!pending && previous) { retryConfirmed.value = false; discardConfirmed.value = false } })
const canRetry = computed(() => props.item.capabilities.retry && (!isInbox.value || props.item.capabilities.retryInbox))
const submitRetry = () => emit('retry', { availableAt: props.item.capabilities.scheduleRetry ? availableAt.value : new Date(0).toISOString(), reason: retryReason.value })
</script>

<template>
  <section
    class="mutations"
    aria-labelledby="mutation-title"
  >
    <h2 id="mutation-title">
      Controlled actions
    </h2><p class="intro">
      Actions use the displayed revision and a unique operation ID. They are never retried automatically.
    </p><div
      v-if="props.pending"
      class="pending"
      role="alert"
    >
      <strong>Pending {{ props.pending.action }} outcome is unknown.</strong><span class="pending-key"><b>Source:</b> {{ props.pending.key.source }} <b>Namespace:</b> {{ props.pending.key.namespace }} <b>ID:</b> {{ props.pending.key.id }}</span><span>Refresh checks this exact key only. Retry same operation resends the exact body and operation ID. To navigate or create a new operation, explicitly abandon this one first.</span><div>
        <button
          type="button"
          :disabled="props.loading"
          @click="emit('retrySameOperation')"
        >
          {{ props.retrying ? 'Retrying same operation…' : 'Retry same operation' }}
        </button><button
          type="button"
          :disabled="props.loading"
          @click="emit('abandon')"
        >
          Abandon and start over
        </button>
      </div>
    </div>
    <form
      v-if="canRetry"
      class="action"
      :inert="!!props.pending"
      @submit.prevent="submitRetry"
    >
      <h3>{{ props.item.capabilities.scheduleRetry ? 'Schedule retry' : 'Retry now' }}</h3><div
        v-if="isInbox"
        class="warning"
        role="alert"
      >
        <strong>Inbox replay can repeat side effects.</strong><span>Confirm downstream handlers and external writes are idempotent before continuing.</span>
      </div><label v-if="props.item.capabilities.scheduleRetry">Available at (canonical ISO UTC)<input
        v-model.trim="availableAt"
        required
        pattern="\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z"
        autocomplete="off"
      ></label><label>Reason<textarea
        v-model.trim="retryReason"
        maxlength="512"
        rows="3"
      /></label><label class="confirm"><input
        v-model="retryConfirmed"
        type="checkbox"
        required
      > I understand this will re-activate processing.</label><button
        type="submit"
        :disabled="props.loading || !!props.pending || !retryConfirmed"
      >
        {{ props.loading ? 'Submitting…' : props.item.capabilities.scheduleRetry ? 'Schedule retry' : 'Retry now' }}
      </button>
    </form>
    <form
      v-if="props.item.capabilities.discard"
      class="action danger"
      :inert="!!props.pending"
      @submit.prevent="emit('discard', { reason: discardReason })"
    >
      <h3>Discard item</h3><p>This marks the item discarded. It does not erase audit records.</p><label>Reason<textarea
        v-model.trim="discardReason"
        maxlength="512"
        rows="3"
        required
      /></label><label class="confirm"><input
        v-model="discardConfirmed"
        type="checkbox"
        required
      > I confirm this dead letter should be discarded.</label><button
        type="submit"
        :disabled="props.loading || !!props.pending || !discardConfirmed"
      >
        {{ props.loading ? 'Submitting…' : 'Discard item' }}
      </button>
    </form>
  </section>
</template>

<style scoped>
.mutations{display:grid;grid-template-columns:1fr 1fr;gap:1rem;border:1px solid #354151;background:#111820;padding:1rem;color:#e7eef6}.mutations>h2,.intro,.pending{grid-column:1/-1;margin:0}.mutations>h2,.action h3{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;text-transform:uppercase;letter-spacing:.04em}.intro,.action p{color:#a6b3c1}.pending{display:grid;gap:.65rem;border:2px solid #f59e0b;background:#2a1c08;padding:.8rem;color:#fde68a}.pending div{display:flex;gap:.5rem;flex-wrap:wrap}.pending button{border:1px solid currentColor;background:transparent;color:inherit;padding:.5rem;font-weight:800}.action{display:grid;align-content:start;gap:.75rem;border:1px solid #465568;padding:1rem;background:#0b1218}.action h3{margin:0;font-size:.95rem}.action label{display:grid;gap:.35rem;color:#bdc8d5;font-size:.78rem;font-weight:800}.action input:not([type=checkbox]),.action textarea{border:1px solid #5c6d80;border-radius:2px;background:#050a0f;color:#fff;padding:.6rem;font:inherit}.confirm{grid-template-columns:auto 1fr!important;align-items:start}.confirm input{width:1.2rem;height:1.2rem}.action button{justify-self:start;border:1px solid #fbbf24;background:#fbbf24;color:#111820;padding:.6rem .9rem;font-weight:900;cursor:pointer}.danger{border-color:#8a3c45}.danger button{border-color:#ef4444;background:#b91c1c;color:#fff}.warning{display:grid;gap:.35rem;border:2px solid #f59e0b;background:#2a1c08;padding:.75rem;color:#fde68a}.action button:focus-visible,.action input:focus-visible,.action textarea:focus-visible,.pending button:focus-visible{outline:3px solid #67e8f9;outline-offset:2px}.action button:disabled,.pending button:disabled{opacity:.5;cursor:not-allowed}@media(max-width:700px){.mutations{grid-template-columns:1fr}}
</style>

<style scoped>
.mutations,.action,.pending,.pending-key,.action label{min-width:0;max-width:100%;box-sizing:border-box}.mutations{grid-template-columns:repeat(2,minmax(0,1fr))}.action input:not([type=checkbox]),.action textarea{width:100%;min-width:0;max-width:100%;box-sizing:border-box}.action button,.pending button{min-height:2.75rem;box-sizing:border-box}@media(max-width:700px){.mutations{grid-template-columns:minmax(0,1fr)}}
</style>
