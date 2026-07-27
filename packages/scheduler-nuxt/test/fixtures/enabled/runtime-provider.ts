export default {
  createScope() {
    return { runner: { run: async () => ({ status: 'completed', result: 'fixture' }) } }
  },
}
