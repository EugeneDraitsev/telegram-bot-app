import { Writable } from 'node:stream'
import { inspect } from 'node:util'
import pino from 'pino'
import type { Message } from 'telegram-typings'

type LogRecord = Record<string, unknown> & {
  time?: number
  level?: number | string
  levelLabel?: string
  msg?: unknown
}

const isLocalPrettyLog =
  process.env.STAGE === 'local' ||
  process.env.IS_OFFLINE === 'true' ||
  process.env.NODE_ENV === 'development'

const isPrettyEnabled =
  process.env.LOG_PRETTY === '1' ||
  process.env.LOG_PRETTY === 'true' ||
  isLocalPrettyLog

const loggerOptions = {
  level: process.env.AGENT_WORKER_LOG_LEVEL ?? process.env.LOG_LEVEL ?? 'info',
  base: null,
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
}

const levelByNumber = new Map<number, string>([
  [10, 'trace'],
  [20, 'debug'],
  [30, 'info'],
  [40, 'warn'],
  [50, 'error'],
  [60, 'fatal'],
])

const levelColor = {
  trace: '\x1b[90m',
  debug: '\x1b[36m',
  info: '\x1b[32m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  fatal: '\x1b[35m',
} as const

const resetColor = '\x1b[0m'
const isTerminalOutput = process.stdout.isTTY

function formatLevel(level: unknown) {
  if (typeof level === 'string') {
    return level
  }

  if (typeof level === 'number') {
    return levelByNumber.get(level) ?? String(level)
  }

  return 'info'
}

function toPrettyLine(record: LogRecord) {
  const { time, level, levelLabel, msg, pid, hostname, ...rest } = record
  const levelText = formatLevel(levelLabel ?? level)
  const ts = time
    ? new Date(time).toLocaleString('en-GB', {
        hour12: false,
      })
    : ''
  const color = isTerminalOutput
    ? (levelColor[levelText as keyof typeof levelColor] ?? '')
    : ''
  const coloredLevel = `${color}${levelText.toUpperCase().padEnd(5)}${color ? resetColor : ''}`
  const payload = msg ?? ''
  const details = Object.keys(rest).length
    ? inspect(rest, { colors: isTerminalOutput, depth: 2 })
    : ''

  const prettyPayload =
    typeof payload === 'string'
      ? payload
      : inspect(payload, { colors: isTerminalOutput, depth: 2 })

  return `${ts} ${coloredLevel} ${prettyPayload}${details ? ` ${details}` : ''}`
}

const prettyStream = isPrettyEnabled
  ? new Writable({
      decodeStrings: false,
      write(chunk, _encoding, cb) {
        const lines = String(chunk).split('\n')
        const result = lines
          .filter(Boolean)
          .map((line) => {
            const trimmed = line.trim()
            if (!trimmed) {
              return ''
            }

            try {
              return `${toPrettyLine(JSON.parse(trimmed) as LogRecord)}\n`
            } catch {
              return `${line}\n`
            }
          })
          .join('')

        if (result.length > 0) {
          process.stdout.write(result)
        }
        cb()
      },
    })
  : undefined

export const logger = prettyStream
  ? pino(loggerOptions, prettyStream)
  : pino(loggerOptions)

export function getMessageLogMeta(message: Message) {
  return {
    chatId: message.chat?.id,
    messageId: message.message_id,
    fromId: message.from?.id,
    hasText: Boolean(message.text || message.caption),
    hasPhoto: Boolean(message.photo?.length),
  }
}
