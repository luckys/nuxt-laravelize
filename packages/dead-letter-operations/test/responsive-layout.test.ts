import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const readRuntimeFile = (path: string) => readFile(new URL(`../src/runtime/${path}`, import.meta.url), 'utf8')

describe('dead-letter operations responsive layout', () => {
  it('keeps the ledger before inspection and reverses no mobile order', async () => {
    const page = await readRuntimeFile('pages/DeadLetterOperationsPage.vue')
    const template = page.slice(0, page.indexOf('<style'))

    expect(template.indexOf('class="results"')).toBeLessThan(template.indexOf('class="inspection"'))
    expect(page).toContain('@media(max-width:920px){.results{order:1}.inspection{order:2}')
  })

  it('contains the workspace, controls, detail and table while preserving internal table scrolling', async () => {
    const [page, filters, detail, table, mutations] = await Promise.all([
      readRuntimeFile('pages/DeadLetterOperationsPage.vue'),
      readRuntimeFile('components/OperationsFilters.vue'),
      readRuntimeFile('components/DeadLetterDetail.vue'),
      readRuntimeFile('components/DeadLetterTable.vue'),
      readRuntimeFile('components/DeadLetterMutationPanel.vue'),
    ])

    expect(page).toContain('.workspace,.results,.inspection{min-width:0;max-width:100%}')
    expect(filters).toContain('.filters,.field,.actions{min-width:0;max-width:100%;box-sizing:border-box}')
    expect(detail).toContain('.detail{min-width:0;max-width:100%;box-sizing:border-box}')
    expect(table).toContain('.table-shell,.scroll{min-width:0;max-width:100%;box-sizing:border-box}')
    expect(table).toMatch(/\.scroll\{[^}]*overflow-x:auto/)
    expect(mutations).toContain('.mutations,.action,.pending,.pending-key,.action label{min-width:0;max-width:100%;box-sizing:border-box}')
  })
})
