import { getErrorMessage, type MediaBuffer } from '@tg-bot/common'
import {
  generateOmniVideo,
  MAX_OMNI_VIDEO_SECONDS,
  MIN_OMNI_VIDEO_SECONDS,
  OMNI_VIDEO_MODEL,
  OMNI_VIDEO_TOOL_TIMEOUT_MS,
  type OmniAspectRatio,
  prepareOmniMedia,
  shortenOmniVideos,
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
// Used only when the model gave no note in the user's own language.
const DEFAULT_FRAME_FALLBACK_NOTE =
  'Rebuilt from the first and last frame of the video — editing the video itself is unavailable.'
const DEFAULT_ASPECT_RATIO: OmniAspectRatio = '9:16'

function getDurationSeconds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_DURATION_SECONDS
  }

  return Math.min(
    MAX_OMNI_VIDEO_SECONDS,
    Math.max(MIN_OMNI_VIDEO_SECONDS, Math.round(value)),
  )
}

/** Match the orientation of the media the video is built from, when known. */
function getReferenceAspectRatio(
  media: MediaBuffer[],
): OmniAspectRatio | undefined {
  const reference = media.find((item) => item.mediaType === 'video') ?? media[0]
  const { width, height } = reference ?? {}
  if (!width || !height || width === height) return undefined

  return width > height ? '16:9' : '9:16'
}

function getAspectRatio(value: unknown, media: MediaBuffer[]): OmniAspectRatio {
  if (value === '16:9' || value === '9:16') return value

  return getReferenceAspectRatio(media) ?? DEFAULT_ASPECT_RATIO
}

export const generateVideoTool: AgentTool = {
  execution: ['after-data', 'terminal'],
  timeoutMs: OMNI_VIDEO_TOOL_TIMEOUT_MS,
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
            'Set only when the user asks for a specific orientation: 9:16 for vertical/social video, 16:9 for landscape. Omit it to follow the orientation of the selected media, or 9:16 when no media is selected.',
        },
        frameFallbackNote: {
          type: 'string',
          description:
            'One short sentence in the user language saying the clip was rebuilt from the first and last frame of their video, because the video itself could not be edited. Provide it whenever mediaIds selects a video; it is used only if that happens.',
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
      const mediaSelection = selectMediaForTool(mediaBuffers, args.mediaIds, [
        'image',
        'video',
      ])
      const validatedMedia = prepareOmniMedia(
        mediaSelection.media,
        mediaSelection.explicit,
      )
      const aspectRatio = getAspectRatio(args.aspectRatio, validatedMedia)
      claimGeneratedMedia()
      const selectedMedia = await shortenOmniVideos(validatedMedia, aspectRatio)
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

      // A terminal tool ends the loop, so the caption is the only place left to
      // tell the user their video was rebuilt rather than edited.
      const note = result.fromFrames
        ? getMediaCaption(args.frameFallbackNote) || DEFAULT_FRAME_FALLBACK_NOTE
        : undefined
      const finalCaption = [caption, note].filter(Boolean).join('\n\n')

      addResponse({
        type: 'video',
        buffer: result.buffer,
        mimeType: result.mimeType,
        fileName: 'omni-video.mp4',
        caption: finalCaption || undefined,
      })
      return [
        result.fromFrames
          ? 'Generated video from the first and last frame of the selected video, because editing the video itself was refused'
          : 'Generated video',
        finalCaption,
      ]
        .filter(Boolean)
        .join(': ')
    } catch (error) {
      throw new Error(`Error generating video: ${getErrorMessage(error)}`)
    }
  },
}
