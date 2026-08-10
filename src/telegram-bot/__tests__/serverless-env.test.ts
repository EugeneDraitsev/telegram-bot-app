import { readFileSync } from 'node:fs'

/**
 * isAiEnabledChat reads OPENAI_CHAT_IDS once at module load, so a function that
 * runs code touching it and does not declare the variable fails silently: the
 * allowlist is simply empty and every chat is rejected. Nothing in the unit
 * tests can see that, hence this check against serverless.yml itself.
 */
function getFunctionEnvKeys(name: string): string[] {
  const lines = readFileSync('serverless.yml', 'utf8').split('\n')
  const start = lines.indexOf(`  ${name}:`)
  if (start === -1) {
    throw new Error(`function ${name} not found in serverless.yml`)
  }

  const body = lines.slice(start + 1).slice(
    0,
    lines.slice(start + 1).findIndex((line) => /^ {2}\S/.test(line)),
  )
  const envStart = body.indexOf('    environment:')
  if (envStart === -1) {
    return []
  }

  const envBody = body.slice(envStart + 1)
  const envEnd = envBody.findIndex((line) => /^ {4}\S/.test(line))

  return (envEnd === -1 ? envBody : envBody.slice(0, envEnd))
    .map((line) => line.match(/^ {6}([A-Z0-9_]+):/)?.[1])
    .filter((key): key is string => Boolean(key))
}

describe('serverless function environments', () => {
  test.each([
    'telegram-bot',
    'telegram-reply-worker',
    'telegram-agent-worker',
    'telegram-activity-worker',
  ])('%s declares OPENAI_CHAT_IDS', (name) => {
    expect(getFunctionEnvKeys(name)).toContain('OPENAI_CHAT_IDS')
  })

  test('reads a real environment block', () => {
    expect(getFunctionEnvKeys('telegram-bot')).toContain('TOKEN')
  })
})
