import type { Message } from 'grammy/types'

import * as common from '@tg-bot/common'
import { runWithToolContext } from '../../tools/context'
import { generateVoice, VOICE_MODEL } from '../google-tts'

const message = { chat: { id: 123 }, message_id: 55 } as Message
const wav = Buffer.from('RIFF-test-WAVE')
const opus = Buffer.from('OggS-test-Opus')

function speechResponse(status = 'completed', data = wav.toString('base64')) {
  return Response.json({
    status,
    steps: [
      {
        type: 'model_output',
        content: [{ type: 'audio', mime_type: 'audio/wav', data }],
      },
    ],
  })
}

const fetchMock = jest.fn(async (_url: unknown, _init?: RequestInit) =>
  speechResponse(),
)

function run(...args: Parameters<typeof generateVoice>) {
  return runWithToolContext(message, undefined, () => generateVoice(...args))
}

function request(index = 0) {
  const [url, init] = fetchMock.mock.calls[index] ?? []
  return {
    url,
    ...init,
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  }
}

describe('Gemini speech and voice design', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    fetchMock.mockImplementation(async () => speechResponse())
    jest
      .spyOn(globalThis, 'fetch')
      .mockImplementation(fetchMock as typeof fetch)
    jest.spyOn(common, 'getGoogleApiKey').mockReturnValue('test-key')
    jest.spyOn(common, 'runFfmpeg').mockResolvedValue(opus)
    jest.spyOn(common.logger, 'info').mockImplementation(() => {})
    jest.spyOn(common.logger, 'warn').mockImplementation(() => {})
  })

  afterEach(() => jest.restoreAllMocks())

  test('reads the exact text with delivery metadata and returns encoded Telegram audio', async () => {
    expect(
      await run(' Привет! ', { voice: 'Charon', style: 'Dramatic pauses' }),
    ).toEqual(opus)
    expect(request()).toMatchObject({
      url: 'https://generativelanguage.googleapis.com/v1beta/interactions',
      headers: { 'x-goog-api-key': 'test-key' },
      body: {
        model: VOICE_MODEL,
        store: false,
        input: [
          {
            type: 'user_input',
            content: [
              {
                type: 'text',
                text: 'Привет!',
                annotations: [
                  { type: 'speech_metadata', style: 'Dramatic pauses' },
                ],
              },
            ],
          },
        ],
        generation_config: { speech_config: [{ voice: 'Charon' }] },
      },
    })
    expect(common.runFfmpeg).toHaveBeenCalledWith(
      expect.arrayContaining(['libopus', 'ogg', 'pipe:0', 'pipe:1']),
      wav,
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('keeps an existing designed voice reusable and never deletes it', async () => {
    await run('hello', { voice: 'voice_existing' })
    expect(request().body.generation_config.speech_config).toEqual([
      { voice: 'voice_existing' },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('designs a one-off timbre, measures both model calls and deletes its profile', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ id: 'voice_created' }))
    fetchMock.mockResolvedValueOnce(speechResponse())
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    expect(
      await run('hello', {
        voiceDescription: 'A gravelly fictional male orator.',
      }),
    ).toEqual(opus)

    expect(request().body).toMatchObject({
      store: true,
      voice: {
        model: VOICE_MODEL,
        type: 'prompted',
        prompted: { input: 'A gravelly fictional male orator.' },
      },
    })
    expect(request(1).body.generation_config.speech_config).toEqual([
      { voice: 'voice_created' },
    ])
    expect(request(2)).toMatchObject({
      url: 'https://generativelanguage.googleapis.com/v1beta/voices/voice_created',
      method: 'DELETE',
    })
    for (const name of ['voice_design', 'voice_generation']) {
      expect(common.logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ name, model: `google/${VOICE_MODEL}` }),
        'tool.model_call',
      )
    }
  })

  test.each(['synthesis', 'encoding'])(
    'cleans up a newly designed voice after %s fails',
    async (stage) => {
      fetchMock.mockResolvedValueOnce(Response.json({ id: 'voice_created' }))
      fetchMock.mockResolvedValueOnce(
        stage === 'synthesis'
          ? Response.json(
              { error: { message: 'Request blocked' } },
              { status: 400 },
            )
          : speechResponse(),
      )
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
      if (stage === 'encoding')
        (common.runFfmpeg as jest.Mock).mockRejectedValue(
          new Error('encoding failed'),
        )
      await expect(
        run('hello', { voiceDescription: 'A fictional robot.' }),
      ).rejects.toThrow(
        stage === 'synthesis' ? 'Request blocked' : 'encoding failed',
      )
      expect(request(2).method).toBe('DELETE')
    },
  )

  test('logs a cleanup failure without discarding successfully generated speech', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ id: 'voice_created' }))
    fetchMock.mockResolvedValueOnce(speechResponse())
    fetchMock.mockResolvedValueOnce(Response.json({}, { status: 503 }))
    expect(
      await run('hello', { voiceDescription: 'A fictional robot.' }),
    ).toEqual(opus)
    expect(common.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ voice: 'voice_created' }),
      'voice_design.cleanup_failed',
    )
  })

  test('does not synthesize or delete an invalid voice design result', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ id: '../unrelated' }))
    await expect(
      run('hello', { voiceDescription: 'A fictional robot.' }),
    ).rejects.toThrow('no voice ID')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  test('rejects partial or missing audio instead of encoding it', async () => {
    fetchMock.mockResolvedValueOnce(speechResponse('failed'))
    await expect(run('hello')).rejects.toThrow('did not complete')
    fetchMock.mockResolvedValueOnce(speechResponse('completed', ''))
    await expect(run('hello')).rejects.toThrow('no voice audio')
    expect(common.runFfmpeg).not.toHaveBeenCalled()
  })

  test('bounds raw audio and refuses an empty encoded result', async () => {
    fetchMock.mockResolvedValueOnce(
      speechResponse(
        'completed',
        Buffer.alloc(9 * 1024 * 1024 + 1).toString('base64'),
      ),
    )
    await expect(run('hello')).rejects.toThrow('byte limit')
    expect(common.runFfmpeg).not.toHaveBeenCalled()
    ;(common.runFfmpeg as jest.Mock).mockResolvedValue(Buffer.alloc(0))
    await expect(run('hello')).rejects.toThrow('empty voice audio')
  })

  test('redacts credentials from provider errors', async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json(
        { error: { message: 'Invalid key test-key' } },
        { status: 403 },
      ),
    )
    await expect(run('hello')).rejects.toThrow('Invalid key [redacted]')
    expect(common.runFfmpeg).not.toHaveBeenCalled()
  })

  test('rejects unusable text and voices before making billable API requests', async () => {
    await expect(run(' ')).rejects.toThrow('Text cannot be empty')
    await expect(
      run('x'.repeat(4097), { voiceDescription: 'A robot.' }),
    ).rejects.toThrow('4096')
    await expect(run('hello', { voice: 'unknown' })).rejects.toThrow(
      'Unsupported voice',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
