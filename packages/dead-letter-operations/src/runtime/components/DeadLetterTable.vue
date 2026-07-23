<script setup lang="ts">
import type { DeadLetterKey, DeadLetterSummary } from '../types'

const props = defineProps<{ items: readonly DeadLetterSummary[], selected?: DeadLetterKey, loading?: boolean, disabled?: boolean }>()
const emit = defineEmits<{ select: [key: DeadLetterKey] }>()
const selectedRow = (key: DeadLetterKey) => props.selected?.source === key.source && props.selected.namespace === key.namespace && props.selected.id === key.id
</script>

<template>
  <div
    class="table-shell"
    :aria-busy="props.loading"
  >
    <p
      v-if="props.loading"
      class="state"
      role="status"
    >
      Loading dead letters…
    </p>
    <p
      v-else-if="!props.items.length"
      class="state"
    >
      No dead letters match these filters.
    </p>
    <div
      v-else
      class="scroll"
    >
      <table>
        <caption class="sr-only">
          Dead-letter operation results
        </caption><thead>
          <tr>
            <th scope="col">
              Select
            </th><th scope="col">
              Namespace / ID
            </th><th scope="col">
              Type
            </th><th scope="col">
              Attempts
            </th><th scope="col">
              State
            </th><th scope="col">
              Terminal time
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in props.items"
            :key="`${item.key.source}:${item.key.namespace}:${item.key.id}`"
            :class="{ selected: selectedRow(item.key) }"
          >
            <td>
              <button
                type="button"
                :disabled="props.disabled"
                :aria-pressed="selectedRow(item.key)"
                :aria-label="`Select ${item.key.namespace} ${item.key.id}`"
                @click="emit('select', item.key)"
              >
                Inspect
              </button>
            </td><td><strong>{{ item.key.namespace }}</strong><code>{{ item.key.id }}</code></td><td>{{ item.type }}</td><td>{{ item.attempts }}</td><td>
              <span
                class="status"
                :data-state="item.disposition"
              >{{ item.disposition }}</span>
            </td><td><time :datetime="item.terminalAt">{{ new Date(item.terminalAt).toLocaleString() }}</time></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.table-shell{min-height:12rem;border:1px solid #354151;background:#0c131a}.scroll{overflow:auto}table{width:100%;border-collapse:collapse;color:#e6edf5;font-size:.875rem}th{background:#17212b;color:#aebaca;text-align:left;text-transform:uppercase;letter-spacing:.07em;font-size:.7rem}th,td{padding:.75rem;border-bottom:1px solid #2b3744;vertical-align:top}tr.selected td{background:#172b34}td strong,td code{display:block;max-width:18rem;overflow-wrap:anywhere}td code{margin-top:.2rem;color:#9fb0c2;font-size:.72rem}button{border:1px solid #8292a6;background:transparent;color:#f8fafc;padding:.4rem .65rem;font-weight:800;cursor:pointer}button:focus-visible{outline:3px solid #67e8f9;outline-offset:2px}.status{display:inline-block;border:1px solid #64748b;padding:.18rem .4rem;font-size:.7rem;font-weight:900;text-transform:uppercase}.status[data-state=active]{border-color:#fbbf24;color:#fde68a}.status[data-state=discarded]{border-color:#94a3b8;color:#cbd5e1}.state{display:grid;min-height:12rem;place-items:center;margin:0;color:#aebaca}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:700px){th:nth-child(3),td:nth-child(3),th:nth-child(4),td:nth-child(4){display:none}}
</style>

<style scoped>
.table-shell,.scroll{min-width:0;max-width:100%;box-sizing:border-box}.table-shell{width:100%;overflow:hidden}.scroll{width:100%;overflow-x:auto;overscroll-behavior-inline:contain}table{min-width:42rem}button{min-height:2.75rem;box-sizing:border-box}@media(max-width:700px){table{min-width:32rem}}
</style>
