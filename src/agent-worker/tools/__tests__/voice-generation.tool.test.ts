import type { Message } from 'grammy/types'

import * as tts from '../../services/google-tts'
import {
  claimGeneratedMedia,
  getCollectedResponses,
  runWithToolContext,
} from '../context'
import { generateVoiceTool } from '../generate-voice.tool'

const message = { chat: { id: 123 }, message_id: 55 } as Message

describe('generate_voice tool', () => {
  afterEach(() => jest.restoreAllMocks())

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
    const generate = jest.spyOn(tts, 'generateVoice')
    await runWithToolContext(message, undefined, async () => {
      claimGeneratedMedia()
      await expect(
        generateVoiceTool.execute({ text: 'hello' }),
      ).rejects.toThrow('Only one generated media result')
      expect(generate).not.toHaveBeenCalled()
    })
  })
})
