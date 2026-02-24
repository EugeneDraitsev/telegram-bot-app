/**
 * Tool for generating animated text GIFs via Giphy SDK.
 */

import { getErrorMessage, sample } from '@tg-bot/common'
import type { AgentTool } from '../types'
import { addResponse, requireToolContext } from './context'
import { getGiphyClient, getMediaUrl } from './search-gif.tool'

const ANIMATE_RESULTS_LIMIT = 10

export async function animateGiphyText(text: string): Promise<string | null> {
  const gf = getGiphyClient()
  const { data } = await gf.animate(text, { limit: ANIMATE_RESULTS_LIMIT })

  const picked = sample(data ?? [])
  return picked ? getMediaUrl(picked) : null
}

export const animateGifTool: AgentTool = {
  declaration: {
    type: 'function',
    name: 'animate_text',
    description:
      'Generate an animated GIF from text using Giphy Animate. Great for greetings, announcements, or expressive short phrases.',
    parameters: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Short text to animate (e.g. "Happy Birthday!", "LOL")',
        },
      },
      required: ['text'],
    },
  },
  execute: async (args) => {
    requireToolContext()

    const text = (args.text as string).trim()
    if (!text) {
      return 'Error animating text: Text cannot be empty'
    }

    try {
      const mediaUrl = await animateGiphyText(text)

      if (!mediaUrl) {
        return 'No animated GIF generated for this text'
      }

      addResponse({
        type: 'animation',
        url: mediaUrl,
      })
      return `Generated animated text GIF: ${mediaUrl}`
    } catch (error) {
      return `Error animating text: ${getErrorMessage(error)}`
    }
  },
}
