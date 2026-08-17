import { getErrorMessage } from '@tg-bot/common'
import {
  GOOGLE_MEDIA_TOOL_TIMEOUT_MS,
  generateLyriaMusic,
  LYRIA_3_CLIP_MODEL,
  LYRIA_3_PRO_MODEL,
  type LyriaModel,
} from '../services/google-media'
import type { AgentTool } from '../types'
import {
  addResponse,
  claimPaidMediaGeneration,
  requireToolContext,
  trackToolModelCall,
} from './context'
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
      'Generate original high-fidelity stereo music with Google Lyria 3. Call only when the current user explicitly asks to create or generate music, a song, a loop, or a soundtrack; never call merely to discuss music. This is a billed content-generation action. Default to the faster, cheaper 30-second Clip model. Use Pro only when the user explicitly asks for a full-length song or multi-section composition. The current text prompt and all Google-supported media available in the agent context are forwarded automatically. Do not imitate a living artist or reproduce copyrighted lyrics.',
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
      claimPaidMediaGeneration()
      const result = await trackToolModelCall(
        { name: 'music_generation', model: `google/${model}` },
        () =>
          generateLyriaMusic({
            prompt,
            model,
            media: mediaBuffers,
          }),
      )

      addResponse({
        type: 'audio',
        buffer: result.buffer,
        mimeType: result.mimeType,
        fileName: mode === 'pro' ? 'lyria-song.mp3' : 'lyria-clip.mp3',
        title,
        caption,
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
