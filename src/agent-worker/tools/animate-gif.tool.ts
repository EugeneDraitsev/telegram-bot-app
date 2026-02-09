/**
 * Tool for generating animated text GIFs via Giphy SDK.
 * Uses the Giphy Animate endpoint to create dynamic text animations.
 * Requires GIPHY_API_KEY environment variable (SDK key).
 */

import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'

import { getErrorMessage, sample } from '@tg-bot/common'
import { addResponse, requireToolContext } from './context'
import { getGiphyClient, getMediaUrl } from './search-gif.tool'

const ANIMATE_RESULTS_LIMIT = 10

export async function animateGiphyText(text: string): Promise<string | null> {
  const gf = getGiphyClient()
  const { data } = await gf.animate(text, { limit: ANIMATE_RESULTS_LIMIT })

  const picked = sample(data ?? [])
  return picked ? getMediaUrl(picked) : null
}

export const animateGifTool = new DynamicStructuredTool({
  name: 'animate_text',
  description:
    'Generate an animated GIF from text using Giphy Animate. Creates stylized animated typography — great for greetings, announcements, or expressive short phrases.',
  schema: z.object({
    text: z
      .string()
      .describe('Short text to animate (e.g. "Happy Birthday!", "LOL")'),
  }),
  func: async ({ text }) => {
    requireToolContext()

    const normalizedText = text.trim()
    if (!normalizedText) {
      return 'Error animating text: Text cannot be empty'
    }

    try {
      const mediaUrl = await animateGiphyText(normalizedText)

      if (!mediaUrl) {
        return 'No animated GIF generated for this text'
      }

      addResponse({
        type: 'animation',
        url: mediaUrl,
      })
      return `Generated animated text GIF: ${mediaUrl}`
    } catch (error) {
      const errorMsg = getErrorMessage(error)
      return `Error animating text: ${errorMsg}`
    }
  },
})
