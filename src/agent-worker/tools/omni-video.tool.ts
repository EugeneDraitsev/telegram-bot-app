import { getErrorMessage } from '@tg-bot/common'
import {
  GEMINI_OMNI_FLASH_MODEL,
  GOOGLE_MEDIA_TOOL_TIMEOUT_MS,
  generateOmniVideo,
  type OmniAspectRatio,
} from '../services/google-media'
import type { AgentTool } from '../types'
import {
  addResponse,
  PAID_MEDIA_DELIVERY_RESERVE_MS,
  preparePaidMediaGeneration,
  requireToolContext,
  trackToolModelCall,
} from './context'
import { getMediaIdsParameter, selectMediaForTool } from './media-selection'
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
      'Generate a new 720p video with native synchronized audio, animate selected images, or edit selected video using Gemini Omni Flash. Call only for an explicit request to create, generate, animate, or edit video. This is billed. The structured MEDIA_CONTEXT ties media_id values to their source messages and visible content; select only media the user actually refers to.',
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
        mediaIds: getMediaIdsParameter('image/video conditioning inputs'),
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
      const selectedMedia = selectMediaForTool(mediaBuffers, args.mediaIds, [
        'image',
        'video',
      ])
      await preparePaidMediaGeneration(
        GOOGLE_MEDIA_TOOL_TIMEOUT_MS + PAID_MEDIA_DELIVERY_RESERVE_MS,
      )
      const result = await trackToolModelCall(
        {
          name: 'video_generation',
          model: `google/${GEMINI_OMNI_FLASH_MODEL}`,
          getOutputTokensByModality: (media) => media.outputTokensByModality,
        },
        () =>
          generateOmniVideo({
            prompt,
            durationSeconds,
            aspectRatio,
            media: selectedMedia,
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
