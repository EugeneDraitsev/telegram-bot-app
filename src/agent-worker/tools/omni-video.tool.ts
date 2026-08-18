import { getErrorMessage } from '@tg-bot/common'
import {
  GOOGLE_MEDIA_TOOL_TIMEOUT_MS,
  generateVeoVideo,
  prepareVeoMedia,
  VEO_3_1_LITE_MODEL,
  type VeoAspectRatio,
} from '../services/google-media'
import type { AgentTool } from '../types'
import {
  addResponse,
  claimGeneratedMedia,
  requireToolContext,
  trackToolModelCall,
} from './context'
import { getMediaIdsParameter, selectMediaForTool } from './media-selection'
import { getMediaCaption } from './media-text'

const SUPPORTED_DURATION_SECONDS = [4, 6, 8] as const
const DEFAULT_DURATION_SECONDS = 6

function getDurationSeconds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_DURATION_SECONDS
  }

  return SUPPORTED_DURATION_SECONDS.reduce((nearest, candidate) => {
    const nearestDistance = Math.abs(nearest - value)
    const candidateDistance = Math.abs(candidate - value)
    return candidateDistance < nearestDistance ||
      (candidateDistance === nearestDistance && candidate > nearest)
      ? candidate
      : nearest
  })
}

function getAspectRatio(value: unknown): VeoAspectRatio {
  return value === '16:9' ? '16:9' : '9:16'
}

export const generateVideoTool: AgentTool = {
  execution: ['after-data', 'terminal'],
  timeoutMs: GOOGLE_MEDIA_TOOL_TIMEOUT_MS,
  declaration: {
    type: 'function',
    name: 'generate_video_with_veo',
    description:
      'Generate a new 720p video with native synchronized audio or animate one selected image using Veo 3.1 Lite. Call only for an explicit request to create, generate, or animate video. Only one generated media result can be created per request. The structured MEDIA_CONTEXT ties media_id values to their source messages and visible content; select only media the user actually refers to.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'Detailed scene instructions, including camera motion and desired dialogue, music, ambience, or silence. Preserve the user language and any exact spoken text.',
        },
        caption: {
          type: 'string',
          description:
            'A short natural caption for the generated video in the user language. Describe the result in one sentence. Do not mention model names, providers, duration, resolution, generation status, or other technical details.',
        },
        durationSeconds: {
          type: 'number',
          enum: [...SUPPORTED_DURATION_SECONDS],
          description:
            'Requested output duration: 4, 6, or 8 seconds. Default: 6.',
        },
        aspectRatio: {
          type: 'string',
          enum: ['9:16', '16:9'],
          description:
            '9:16 for vertical/social video; 16:9 for landscape. Default: 9:16.',
        },
        mediaIds: getMediaIdsParameter('a single image conditioning input'),
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
      const mediaSelection = selectMediaForTool(mediaBuffers, args.mediaIds, [
        'image',
      ])
      const selectedMedia = prepareVeoMedia(
        mediaSelection.media,
        mediaSelection.explicit,
      )
      claimGeneratedMedia()
      const result = await trackToolModelCall(
        {
          name: 'video_generation',
          model: `google/${VEO_3_1_LITE_MODEL}`,
        },
        () =>
          generateVeoVideo({
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
        fileName: 'veo-lite-video.mp4',
        caption,
      })
      return caption ? `Generated video: ${caption}` : 'Generated video'
    } catch (error) {
      throw new Error(`Error generating video: ${getErrorMessage(error)}`)
    }
  },
}
