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
  LyriaPromptRefusedError,
  prepareLyriaMedia,
} from '../services/google-media'
import type { AgentTool } from '../types'
import {
  addResponse,
  claimGeneratedMedia,
  releaseGeneratedMedia,
  requireToolContext,
  trackToolModelCall,
} from './context'
import { getMediaIdsParameter, selectMediaForTool } from './media-selection'
import { getMediaCaption, getTrackTitle } from './media-text'

// A generation observed at 20-40s; below this a retry only burns a paid call
// whose result the tool timeout would discard anyway.
const MIN_LYRIA_RETRY_MS = 45_000

/**
 * The filter rejects a brief within a second and bills nothing, so the caller
 * model gets to rewrite it; the tool loop's iteration cap bounds the attempts.
 */
function getRefusalInstruction(reason: string): string {
  return [
    `Google's content filter refused this music prompt, so nothing was generated: ${reason}`,
    "If the user's idea itself is what the policy forbids, do not retry; tell the user.",
    "Otherwise rewrite the prompt yourself, keeping the user's idea, and call generate_music_with_lyria again now.",
    'The filter matches words, not intent: the usual trigger is a well-known title or name (film, game, brand, character, celebrity, artist) or copyrighted lyrics, even inside a hook or lyric the user asked for word for word, so replace those with original wording first. Ordinary first names are fine, and toning down mood words rarely helps.',
    "End that call's caption with one short sentence in the user's language saying which words you changed and why.",
  ].join(' ')
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

async function generateWithFallback(
  model: LyriaModel,
  prompt: string,
  media: MediaBuffer[],
) {
  const startedAt = Date.now()
  try {
    return await generateTrack(model, prompt, media)
  } catch (error) {
    if (!(error instanceof LyriaModelUnavailableError)) throw error
    const retryTimeoutMs = getLyriaRetryTimeoutMs(Date.now() - startedAt)
    if (retryTimeoutMs < MIN_LYRIA_RETRY_MS) throw error
    logger.warn(
      { model, fallback: LYRIA_FALLBACK_MODEL, retryTimeoutMs },
      'lyria.model_unavailable_fallback',
    )
    return generateTrack(
      LYRIA_FALLBACK_MODEL,
      prompt,
      media,
      model,
      retryTimeoutMs,
    )
  }
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
            'A short natural caption for the track in the user language. Describe its story, mood, or sound in one sentence. Do not mention model names, providers, duration, generation status, or technical details, apart from the rewrite note a refused prompt asks for.',
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

      const isPro = commandName === 'lyriapro'
      const model = isPro ? LYRIA_PRO_MODEL : LYRIA_CLIP_MODEL
      const mediaSelection = selectMediaForTool(mediaBuffers, args.mediaIds, [
        'image',
      ])
      const selectedMedia = prepareLyriaMedia(
        mediaSelection.media,
        mediaSelection.explicit,
      )
      claimGeneratedMedia()
      let result: Awaited<ReturnType<typeof generateTrack>>
      try {
        result = await generateWithFallback(model, prompt, selectedMedia)
      } catch (error) {
        if (!(error instanceof LyriaPromptRefusedError)) throw error
        releaseGeneratedMedia()
        throw new Error(getRefusalInstruction(error.reason))
      }

      addResponse({
        type: 'audio',
        buffer: result.buffer,
        mimeType: result.mimeType,
        fileName: isPro ? 'lyria-song.mp3' : 'lyria-clip.mp3',
        title,
        caption,
        delivery: isPro ? 'audio' : 'voice',
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
