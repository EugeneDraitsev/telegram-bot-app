import { getErrorMessage, logger, type MediaBuffer } from '@tg-bot/common'
import {
  GOOGLE_MEDIA_TOOL_TIMEOUT_MS,
  generateLyriaMusic,
  getLyriaRetryTimeoutMs,
  LYRIA_CLIP_MODEL,
  LYRIA_FALLBACK_MODEL,
  LYRIA_PRO_MODEL,
  type LyriaModel,
  LyriaModelUnavailableError,
  prepareLyriaMedia,
} from '../services/google-media'
import type { AgentTool } from '../types'
import {
  addResponse,
  claimGeneratedMedia,
  requireToolContext,
  trackToolModelCall,
} from './context'
import { getMediaIdsParameter, selectMediaForTool } from './media-selection'
import { getMediaCaption, getTrackTitle } from './media-text'

// A generation observed at 20-40s; below this a retry only burns a paid call
// whose result the tool timeout would discard anyway.
const MIN_LYRIA_RETRY_MS = 45_000

type LyriaMode = 'clip' | 'pro'

function getLyriaMode(commandName: string | undefined): LyriaMode {
  if (commandName === 'lyriapro') return 'pro'
  return 'clip'
}

function getLyriaModel(mode: LyriaMode): LyriaModel {
  return mode === 'pro' ? LYRIA_PRO_MODEL : LYRIA_CLIP_MODEL
}

/** Each attempt is its own metric, so a fallback is never billed to the id
 * that refused the request. */
function generateTrack(
  model: LyriaModel,
  prompt: string,
  media: MediaBuffer[],
  fallbackFrom?: LyriaModel,
  timeoutMs?: number,
) {
  return trackToolModelCall(
    {
      name: 'music_generation',
      model: `google/${model}`,
      ...(fallbackFrom ? { fallbackFrom: `google/${fallbackFrom}` } : {}),
    },
    () => generateLyriaMusic({ prompt, model, media, timeoutMs }),
  )
}

export const generateMusicTool: AgentTool = {
  execution: ['after-data', 'terminal'],
  timeoutMs: GOOGLE_MEDIA_TOOL_TIMEOUT_MS,
  declaration: {
    type: 'function',
    name: 'generate_music_with_lyria',
    description:
      'Generate an original 30-second high-fidelity stereo music clip with Google Lyria 3.5. Call only for an explicit request to create music, a song, loop, or soundtrack. Only one generated media result can be created per request. The structured MEDIA_CONTEXT ties media_id values to source messages and visible content; select only images the user actually refers to. Do not imitate a living artist or reproduce copyrighted lyrics.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'Music brief. Include genre, mood, instruments, tempo, structure, vocals/instrumental choice, lyric language, and any user-provided lyrics. Prompt in the requested lyric language.',
        },
        title: {
          type: 'string',
          description:
            'A short creative track title in the user language, preferably 1-8 words. Do not mention model names, providers, generation status, or technical details.',
        },
        caption: {
          type: 'string',
          description:
            'A short natural caption for the track in the user language. Describe its story, mood, or sound in one sentence. Do not mention model names, providers, duration, generation status, or technical details.',
        },
        includeLyrics: {
          type: 'boolean',
          description:
            'Also send the generated lyrics/structure as text when the user asks to see them. Default: false.',
        },
        mediaIds: getMediaIdsParameter('image conditioning inputs'),
      },
      required: ['prompt', 'title', 'caption'],
    },
  },
  execute: async (args) => {
    const { commandName, mediaBuffers } = requireToolContext()

    try {
      const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : ''
      if (!prompt) throw new Error('Prompt cannot be empty')
      const title = getTrackTitle(args.title)
      const caption = getMediaCaption(args.caption)

      const mode = getLyriaMode(commandName)
      const model = getLyriaModel(mode)
      const mediaSelection = selectMediaForTool(mediaBuffers, args.mediaIds, [
        'image',
      ])
      const selectedMedia = prepareLyriaMedia(
        mediaSelection.media,
        mediaSelection.explicit,
      )
      claimGeneratedMedia()
      const startedAt = Date.now()
      let result: Awaited<ReturnType<typeof generateTrack>>
      try {
        result = await generateTrack(model, prompt, selectedMedia)
      } catch (error) {
        if (!(error instanceof LyriaModelUnavailableError)) throw error
        const retryTimeoutMs = getLyriaRetryTimeoutMs(Date.now() - startedAt)
        if (retryTimeoutMs < MIN_LYRIA_RETRY_MS) throw error
        logger.warn(
          { model, fallback: LYRIA_FALLBACK_MODEL, retryTimeoutMs },
          'lyria.model_unavailable_fallback',
        )
        result = await generateTrack(
          LYRIA_FALLBACK_MODEL,
          prompt,
          selectedMedia,
          model,
          retryTimeoutMs,
        )
      }

      addResponse({
        type: 'audio',
        buffer: result.buffer,
        mimeType: result.mimeType,
        fileName: mode === 'pro' ? 'lyria-song.mp3' : 'lyria-clip.mp3',
        title,
        caption,
        delivery: mode === 'pro' ? 'audio' : 'voice',
      })
      if (args.includeLyrics === true && result.text) {
        addResponse({ type: 'text', text: result.text.slice(0, 3_800) })
      }

      return title ? `Generated track: ${title}` : 'Generated track'
    } catch (error) {
      throw new Error(`Error generating music: ${getErrorMessage(error)}`)
    }
  },
}
