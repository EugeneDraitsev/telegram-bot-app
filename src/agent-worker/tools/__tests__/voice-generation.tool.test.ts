import { readFileSync } from 'node:fs'
import type { Message } from 'grammy/types'

import * as common from '@tg-bot/common'
import {
  MAX_SERIAL_TOOL_CALLS_PER_ROUND,
  MAX_TOOL_ITERATIONS,
  TOOL_CALL_TIMEOUT_MS,
} from '../../agent/config'
import {
  CHAT_ROLE,
  REPLY_GATE_ROLE,
  WEB_SEARCH_TOTAL_TIMEOUT_MS,
} from '../../agent/models'
import * as tts from '../../services/google-tts'
import { codeExecutionTool } from '../code-execution.tool'
import {
  claimGeneratedMedia,
  getCollectedResponses,
  runWithToolContext,
} from '../context'
import { generateVoiceTool } from '../generate-voice.tool'

const message = { chat: { id: 123 }, message_id: 55 } as Message

function configuredNumber(file: string, blockName: string, field: string) {
  const lines = readFileSync(file, 'utf8').split('\n')
  const start = lines.indexOf(`  ${blockName}:`)
  const remaining = lines.slice(start + 1)
  const end = remaining.findIndex((line) => /^ {2}\S/.test(line))
  const block = end === -1 ? remaining : remaining.slice(0, end)
  const value = Number(
    block
      .find((line) => line.trimStart().startsWith(`${field}:`))
      ?.split(':')[1],
  )
  if (start < 0 || !Number.isFinite(value)) {
    throw new Error(`Missing ${blockName}.${field} in ${file}`)
  }
  return value
}

describe('generate_voice tool', () => {
  afterEach(() => jest.restoreAllMocks())

  test('fits the bounded voice workflow and delivery inside the worker and SQS deadlines', () => {
    const workerTimeoutMs =
      configuredNumber('serverless.yml', 'telegram-agent-worker', 'timeout') *
      1000
    const dataRoundTimeoutMs = Math.max(
      WEB_SEARCH_TOTAL_TIMEOUT_MS,
      codeExecutionTool.timeoutMs ?? TOOL_CALL_TIMEOUT_MS,
    )
    // Allow all model fallbacks, two data rounds before speech, a final model
    // response after a tool failure, and a minute for loading and delivery.
    const workflowTimeoutMs =
      REPLY_GATE_ROLE.timeoutMs * 2 +
      CHAT_ROLE.timeoutMs * 2 * (MAX_TOOL_ITERATIONS + 1) +
      dataRoundTimeoutMs *
        MAX_SERIAL_TOOL_CALLS_PER_ROUND *
        (MAX_TOOL_ITERATIONS - 1) +
      tts.VOICE_TOOL_TIMEOUT_MS +
      60_000
    expect(workerTimeoutMs).toBeGreaterThan(workflowTimeoutMs)
    const visibilitySeconds = configuredNumber(
      'resources.yml',
      'TelegramAgentWorkerQueue',
      'VisibilityTimeout',
    )
    expect(visibilitySeconds * 1000).toBeGreaterThanOrEqual(workerTimeoutMs * 6)
  })

  test('passes voice design and delivery to Gemini and queues the resulting voice', async () => {
    const buffer = Buffer.from('OggS')
    const generate = jest.spyOn(tts, 'generateVoice').mockResolvedValue(buffer)
    await runWithToolContext(message, undefined, async () => {
      await generateVoiceTool.execute({
        text: ' hello ',
        voice: 'Puck',
        style: 'whispered',
        voice_description: 'A fictional robot.',
      })
      expect(generate).toHaveBeenCalledWith('hello', {
        voice: 'Puck',
        style: 'whispered',
        voiceDescription: 'A fictional robot.',
      })
      expect(getCollectedResponses()).toEqual([{ type: 'voice', buffer }])
    })
  })

  test('rejects a missing text without calling the service', async () => {
    const generate = jest.spyOn(tts, 'generateVoice')
    await runWithToolContext(message, undefined, async () => {
      await expect(generateVoiceTool.execute({ text: 123 })).rejects.toThrow(
        'Text cannot be empty',
      )
      expect(generate).not.toHaveBeenCalled()
      expect(getCollectedResponses()).toEqual([])
    })
  })

  test('does not spend a voice call after another tool claims media generation', async () => {
    jest.spyOn(common, 'getGoogleApiKey').mockReturnValue('test-key')
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(Response.json({}))
    await runWithToolContext(message, undefined, async () => {
      claimGeneratedMedia()
      await expect(
        generateVoiceTool.execute({ text: 'hello' }),
      ).rejects.toThrow('Only one generated media result')
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  })
})
