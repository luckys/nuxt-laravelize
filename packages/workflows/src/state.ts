import type { WorkflowSnapshot } from './types'

const terminalStates = new Set<WorkflowSnapshot['state']>(['completed', 'failed', 'compensated', 'compensation_failed', 'cancelled'])

export function isWorkflowTerminal(snapshot: WorkflowSnapshot): boolean {
  return terminalStates.has(snapshot.state)
}

export function isWorkflowWaiting(snapshot: WorkflowSnapshot): boolean {
  return snapshot.state === 'waiting_retry' || snapshot.state === 'compensation_waiting_retry'
}

export function workflowNextRetryAt(snapshot: WorkflowSnapshot): number | null {
  return snapshot.steps.find(step => step.state === 'waiting_retry' || step.state === 'compensation_waiting_retry')?.retryAt ?? null
}
