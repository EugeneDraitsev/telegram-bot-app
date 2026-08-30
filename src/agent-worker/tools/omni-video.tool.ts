import { getErrorMessage } from '@tg-bot/common'
import {
  GOOGLE_MEDIA_TOOL_TIMEOUT_MS,
  generateOmniVideo,
  MAX_OMNI_VIDEO_SECONDS,
  MIN_OMNI_VIDEO_SECONDS,
  OMNI_VIDEO_MODEL,
  type OmniAspectRatio,
  prepareOmniMedia,
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

const DEFAULT_DURATION_SECONDS = 8

function getDurationSeconds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_DURATION_SECONDS
  }

  return Math.min(
    MAX_OMNI_VIDEO_SECONDS,
    Math.max(MIN_OMNI_VIDEO_SECONDS, Math.round(value)),
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
      'Generate a new 360p video with native synchronized audio, animate selected images, or edit and extend one selected video using Gemini Omni Flash. Call only for an explicit request to create, animate, edit, or continue a video. Only one generated media result can be created per request. The structured MEDIA_CONTEXT ties media_id values to their source messages and visible content; select only media the user actually refers to.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'Detailed scene instructions, including camera motion and desired dialogue, music, ambience, or silence. When editing a selected video, keep the instruction simple and add "Keep everything else the same". When continuing a selected video, say the scene continues. Preserve the user language and any exact spoken text.',
        },
        caption: {
          type: 'string',
          description:
            'A short natural caption for the generated video in the user language. Describe the result in one sentence. Do not mention model names, providers, duration, resolution, generation status, or other technical details.',
        },
        durationSeconds: {
          type: 'integer',
          minimum: MIN_OMNI_VIDEO_SECONDS,
          maximum: MAX_OMNI_VIDEO_SECONDS,
          description: `Requested output duration in seconds, ${MIN_OMNI_VIDEO_SECONDS}-${MAX_OMNI_VIDEO_SECONDS}. Default: ${DEFAULT_DURATION_SECONDS}.`,
        },
        aspectRatio: {
          type: 'string',
          enum: ['9:16', '16:9'],
          description:
            '9:16 for vertical/social video; 16:9 for landscape. Default: 9:16.',
        },
        mediaIds: getMediaIdsParameter(
          'up to 3 conditioning images (one image, first and last frame, or subject references) or a single video to edit or extend',
        ),
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
        'video',
      ])
      const selectedMedia = prepareOmniMedia(
        mediaSelection.media,
        mediaSelection.explicit,
      )
      claimGeneratedMedia()
      const result = await trackToolModelCall(
        {
          name: 'video_generation',
          model: `google/${OMNI_VIDEO_MODEL}`,
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
