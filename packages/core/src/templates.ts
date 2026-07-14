export function renderProvidersModule(absolutePaths: readonly string[]): string {
  if (absolutePaths.length === 0) {
    return 'export default []\n'
  }

  const imports = absolutePaths.map((path, index) => `import provider${index} from '${path}'`)

  const references = absolutePaths.map((_, index) => `provider${index}`)

  return [
    ...imports,
    '',
    `export default [${references.join(', ')}]`,
    '',
  ].join('\n')
}
