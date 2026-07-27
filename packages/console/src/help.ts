import type { CommandDefinition, CommandRegistry } from './command'

export function renderCommandList(registry: CommandRegistry): string {
  const commands = registry.all()
  if (commands.length === 0) return 'No commands are registered.\n'
  return `Available commands:\n${commands.map(command => `  ${command.name}${command.description ? `  ${command.description}` : ''}`).join('\n')}\n`
}

export function renderCommandHelp(command: CommandDefinition): string {
  const argumentUsage = Object.entries(command.arguments ?? {}).map(([name, value]) => value.required ? `<${name}>` : `[${name}]`).join(' ')
  const optionUsage = Object.keys(command.options ?? {}).length ? ' [options]' : ''
  const lines = [`Usage: ${command.name}${argumentUsage ? ` ${argumentUsage}` : ''}${optionUsage}`]
  if (command.description) lines.push('', command.description)
  const argumentsList = Object.entries(command.arguments ?? {})
  if (argumentsList.length) lines.push('', 'Arguments:', ...argumentsList.map(([name, value]) => `  ${name}${value.description ? `  ${value.description}` : ''}`))
  const optionsList = Object.entries(command.options ?? {})
  lines.push('', 'Options:', '  -h, --help  Display command help', ...optionsList.map(([name, value]) => `  ${value.short ? `-${value.short}, ` : '    '}--${name}${value.kind === 'boolean' ? '' : ` <${value.kind}>`}${value.description ? `  ${value.description}` : ''}`))
  return `${lines.join('\n')}\n`
}
