import { getErrorMessage } from '@tg-bot/common'
import {
  GEMINI_OMNI_FLASH_MODEL,
  GOOGLE_MEDIA_TOOL_TIMEOUT_MS,
  generateOmniVideo,
  type OmniAspectRatio,
} from '../services/google-media'
import type { AgentTool } from '../types'
import { addResponse, requireToolContext, trackToolModelCall } from './context'
import { getMediaCaption } from './media-text'

const DEFAULT_DURATION_SECONDS = 5
const MIN_DURATION_SECONDS = 3
const MAX_DURATION_SECONDS = 10

function getDurationSeconds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_DURATION_SECONDS
  }
  return Math.min(
    MAX_DURATION_SECONDS,
    Math.max(MIN_DURATION_SECONDS, Math.round(value)),
  )
}

function getAspectRatio(value: unknown): OmniAspectRatio {
  return value === '16:9' ? '16:9' : '9:16'
}

export const generateVideoTool: AgentTool = {
  execution: ['after-data', 'terminal'],
  timeoutMs: GOOGLE_MEDIA_TOOL_TIMEOUT_MS,
  declaration: {
    type: 'function',
    name: 'generate_video_with_omni',
    description:
      'Generate a new 720p video with native synchronized audio, animate images, or edit video using Gemini Omni Flash. Call only when the current user explicitly asks to create, generate, animate, or edit video; never call merely to explain video generation. This is a billed content-generation action. Default to a cheap 5-second result and use a longer 3-10 second duration only when the user requests it. The current text prompt and all media available in the agent context are forwarded to Omni together.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'Detailed scene or edit instructions, including camera motion and desired dialogue, music, ambience, or silence. Preserve the user language and any exact spoken text.',
        },
        caption: {
          type: 'string',
          description:
            'A short natural caption for the generated video in the user language. Describe the result in one sentence. Do not mention model names, providers, duration, resolution, generation status, or other technical details.',
        },
        durationSeconds: {
          type: 'number',
          minimum: MIN_DURATION_SECONDS,
          maximum: MAX_DURATION_SECONDS,
          description:
            'Requested output duration from 3 to 10 seconds. Default: 5.',
        },
        aspectRatio: {
          type: 'string',
          enum: ['9:16', '16:9'],
          description:
            '9:16 for vertical/social video; 16:9 for landscape. Default: 9:16.',
        },
      },
      required: ['prompt', 'caption'],
    },
  },
  execute: async (args) => {
    const { mediaBuffers } = requireToolContext()

    try {
      const prompt = typeof args.prompt === 'string' ? args.prompt.trim() : ''
      if (!prompt) throw new Error('Prompt cannot be empty')
      const caption = getMediaCaption(args.caption)

      const durationSeconds = getDurationSeconds(args.durationSeconds)
      const aspectRatio = getAspectRatio(args.aspectRatio)
      const result = await trackToolModelCall(
        {
          name: 'video_generation',
          model: `google/${GEMINI_OMNI_FLASH_MODEL}`,
        },
        () =>
          generateOmniVideo({
            prompt,
            durationSeconds,
            aspectRatio,
            media: mediaBuffers,
          }),
      )

      addResponse({
        type: 'video',
        buffer: result.buffer,
        mimeType: result.mimeType,
        fileName: 'omni-video.mp4',
        caption,
      })
      return caption ? `Generated video: ${caption}` : 'Generated video'
    } catch (error) {
      throw new Error(`Error generating video: ${getErrorMessage(error)}`)
    }
  },
}
