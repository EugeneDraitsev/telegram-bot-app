import { getErrorMessage } from '@tg-bot/common'
import {
  GOOGLE_MEDIA_MIN_REQUEST_TIMEOUT_MS,
  GOOGLE_MEDIA_REQUEST_TIMEOUT_MS,
  GOOGLE_MEDIA_TOOL_TIMEOUT_MS,
  generateLyriaMusic,
  LYRIA_3_CLIP_MODEL,
  LYRIA_3_PRO_MODEL,
  type LyriaModel,
  prepareLyriaMedia,
} from '../services/google-media'
import type { AgentTool } from '../types'
import {
  addResponse,
  preparePaidMediaGeneration,
  requireToolContext,
  trackToolModelCall,
} from './context'
import { getMediaIdsParameter, selectMediaForTool } from './media-selection'
import { getMediaCaption, getTrackTitle } from './media-text'

type LyriaMode = 'clip' | 'pro'

function getLyriaMode(
  commandName: string | undefined,
  value: unknown,
): LyriaMode {
  if (commandName === 'lyriapro') return 'pro'
  if (commandName === 'lyria') return 'clip'
  return value === 'pro' ? 'pro' : 'clip'
}

function getLyriaModel(mode: LyriaMode): LyriaModel {
  return mode === 'pro' ? LYRIA_3_PRO_MODEL : LYRIA_3_CLIP_MODEL
}

export const generateMusicTool: AgentTool = {
  execution: ['after-data', 'terminal'],
  timeoutMs: GOOGLE_MEDIA_TOOL_TIMEOUT_MS,
  declaration: {
    type: 'function',
    name: 'generate_music_with_lyria',
    description:
      'Generate original high-fidelity stereo music with Google Lyria 3. Call only for an explicit request to create music, a song, loop, or soundtrack. This is billed. Default to the cheaper 30-second Clip model and use Pro only for an explicitly requested full-length or multi-section song. The structured MEDIA_CONTEXT ties media_id values to source messages and visible content; select only images the user actually refers to. Do not imitate a living artist or reproduce copyrighted lyrics.',
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
        mode: {
          type: 'string',
          enum: ['clip', 'pro'],
          description:
            'clip creates a 30-second MP3. pro creates a full-length structured song. Default: clip.',
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

      const mode = getLyriaMode(commandName, args.mode)
      const model = getLyriaModel(mode)
      const mediaSelection = selectMediaForTool(mediaBuffers, args.mediaIds, [
        'image',
      ])
      const selectedMedia = prepareLyriaMedia(
        mediaSelection.media,
        mediaSelection.explicit,
      )
      const timeoutMs = await preparePaidMediaGeneration({
        maximumRequestTimeoutMs: GOOGLE_MEDIA_REQUEST_TIMEOUT_MS,
        minimumRequestTimeoutMs: GOOGLE_MEDIA_MIN_REQUEST_TIMEOUT_MS,
      })
      const result = await trackToolModelCall(
        {
          name: 'music_generation',
          model: `google/${model}`,
          getOutputTokensByModality: (media) => media.outputTokensByModality,
        },
        () =>
          generateLyriaMusic({
            prompt,
            model,
            media: selectedMedia,
            timeoutMs,
          }),
      )

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
