/**
 * Tool for generating animated GIFs with AI.
 */

import {
  extractTelegramVideoFrames,
  getErrorMessage,
  VIDEO_TRIM_TIMEOUT_MS,
} from '@tg-bot/common'
import {
  GIF_TOOL_TIMEOUT_MS,
  generateAgentGif,
  getGifTiming,
} from '../services/image-generation'
import type { AgentTool } from '../types'
import { addResponse, claimGeneratedMedia, requireToolContext } from './context'
import { getMediaIdsParameter, selectMediaForTool } from './media-selection'

const MAX_REFERENCE_IMAGES = 16

function needsFrames(media: { mediaType: string; mimeType: string }): boolean {
  return media.mediaType === 'video' || media.mimeType === 'image/gif'
}

export const generateGifTool: AgentTool = {
  execution: ['after-data'],
  timeoutMs: GIF_TOOL_TIMEOUT_MS + VIDEO_TRIM_TIMEOUT_MS,
  declaration: {
    type: 'function',
    name: 'generate_gif',
    description:
      'Generate or EDIT a short looping animated GIF using Sunburst. Use for requests to create a GIF, animate an image into a GIF, or modify a selected GIF/animation. Select source media with mediaIds. An animation or video is rebuilt from reference frames, so its exact motion is not preserved. Use generate_video_with_omni only for requested video output, search_gif for existing reaction GIFs, and animate_text for animated text only. Only one generated media result can be created per request.',
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description:
            'The subject, its motion, and how the loop returns to its starting pose. For edits, describe the requested change and what to preserve from the selected source. Include only visual details directly requested now or present in the current reply target/quote.',
        },
        mediaIds: getMediaIdsParameter(
          'image references or one GIF/animation to edit; animation inputs are rebuilt from their first and last reference frames',
        ),
        frameCount: {
          type: 'integer',
          minimum: 2,
          maximum: 16,
          description:
            'Number of frames, default 16. Loop length = frameCount × frameDurationMs. More frames take longer and cost more.',
        },
        frameDurationMs: {
          type: 'integer',
          minimum: 20,
          maximum: 2000,
          description:
            'Milliseconds per frame in steps of 10, default 80 (12.5 fps). fps = 1000 / frameDurationMs, so 24 fps is 40 and 10 fps is 100.',
        },
      },
      required: ['prompt'],
    },
  },
  execute: async (args) => {
    const { mediaBuffers } = requireToolContext()

    try {
      const prompt = (args.prompt as string).trim()
      if (!prompt) {
        throw new Error('Prompt cannot be empty')
      }

      const { media } = selectMediaForTool(mediaBuffers, args.mediaIds, [
        'image',
        'video',
      ])
      const animations = media.filter(needsFrames)
      if (animations.length > 1) {
        throw new Error('Select only one GIF or video to edit')
      }
      if (animations.some((item) => !item.fileId)) {
        throw new Error('The selected animation has no Telegram file_id')
      }
      // One animation can expand to two reference images.
      if (media.length + animations.length > MAX_REFERENCE_IMAGES) {
        throw new Error(
          'Select at most 16 reference images, counting animation frames',
        )
      }

      claimGeneratedMedia()
      const images = (
        await Promise.all(
          media.map(async (item) => {
            if (!needsFrames(item)) return [item]
            const frames = await extractTelegramVideoFrames({
              fileId: item.fileId as string,
              maxDurationSeconds: 10,
            })
            return frames.map((buffer) => ({ buffer, mimeType: 'image/jpeg' }))
          }),
        )
      ).flat()
      const { gif, timing } = await generateAgentGif(
        prompt,
        getGifTiming(args.frameCount, args.frameDurationMs),
        images.length ? images : undefined,
      )

      addResponse({ type: 'animation', buffer: gif })
      const fps = Math.round(10_000 / timing.frameDurationMs) / 10
      const action = images.length ? 'edited' : 'generated'
      const source = animations.length ? ' from animation reference frames' : ''
      return `Successfully ${action} GIF${source} (${timing.frameCount} frames at ${fps} fps) for: "${prompt.slice(0, 50)}..."`
    } catch (error) {
      throw new Error(`Error generating GIF: ${getErrorMessage(error)}`)
    }
  },
}
