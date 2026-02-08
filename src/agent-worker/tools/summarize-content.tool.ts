import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'

import { summarizeContent } from '../services'
import { addResponse, requireToolContext } from './context'

export const summarizeContentTool = new DynamicStructuredTool({
  name: 'summarize_content',
  description:
    'Summarize URL/video/article/topic into concise text using web-grounded model output.',
  schema: z.object({
    target: z.string().describe('URL, video link, or topic/query to summarize'),
    length: z
      .enum(['short', 'medium', 'long'])
      .optional()
      .describe('Summary size. Default: medium'),
    language: z
      .string()
      .optional()
      .describe('Preferred response language, e.g. ru, en'),
  }),
  func: async ({ target, length = 'medium', language }) => {
    requireToolContext()

    try {
      const text = await summarizeContent({ target, length, language })
      addResponse({ type: 'text', text })
      return `Summarized: ${target}`
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return `Error summarizing content: ${message}`
    }
  },
})
