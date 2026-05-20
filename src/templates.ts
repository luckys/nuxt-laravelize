export function renderProvidersModule(absolutePaths: readonly string[]): string {
  if (absolutePaths.length === 0) {
    return 'export default [] as const\n'
  }

  const imports = absolutePaths.map((path, index) => {
    const specifier = path.replace(/\.ts$/, '')
    return `import provider${index} from '${specifier}'`
  })

  const references = absolutePaths.map((_, index) => `provider${index}`)

  return [
    ...imports,
    '',
    `export default [${references.join(', ')}] as const`,
    '',
  ].join('\n')
}
