/**
 * URL context tool — wraps flash-lite with built-in url_context.
 * Fetches and summarizes web page content.
 */

import { getErrorMessage } from '@tg-bot/common'
import { ai, FAST_MODEL } from '../agent/models'
import type { AgentTool } from '../types'
import { requireToolContext } from './context'

export const urlContextTool: AgentTool = {
  declaration: {
    type: 'function',
    name: 'url_context',
    description:
      'Read and summarize content from a specific URL. Use when user shares a link or asks about a specific webpage, article, or documentation page.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to read and summarize',
        },
        question: {
          type: 'string',
          description: 'Optional specific question about the page content',
        },
      },
      required: ['url'],
    },
  },
  execute: async (args) => {
    requireToolContext()
    const url = (args.url as string)?.trim()
    if (!url) {
      return 'Error: URL cannot be empty'
    }

    const question = (args.question as string)?.trim()
    const prompt = question
      ? `${question}\n\nURL: ${url}`
      : `Summarize the content of this page: ${url}`

    try {
      const interaction = await ai.interactions.create({
        model: FAST_MODEL,
        input: prompt,
        tools: [{ type: 'url_context' }],
      })

      const textOutput = interaction.outputs?.find((o) => o.type === 'text')
      if (textOutput && 'text' in textOutput && textOutput.text) {
        return textOutput.text
      }

      return 'Could not read URL content'
    } catch (error) {
      return `URL read failed: ${getErrorMessage(error)}`
    }
  },
}
