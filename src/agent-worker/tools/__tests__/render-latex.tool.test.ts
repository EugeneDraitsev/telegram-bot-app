import type { Message } from 'grammy/types'

import { getCollectedResponses, runWithToolContext } from '../context'
import { renderLatexTool } from '../render-latex.tool'

const TEST_MESSAGE = {
  chat: { id: 1 },
  message_id: 1,
} as Message

const executeTool = (args: Record<string, unknown>) =>
  runWithToolContext(TEST_MESSAGE, undefined, async () => {
    const result = await renderLatexTool.execute(args)
    return { result, responses: getCollectedResponses() }
  })

describe('renderLatexTool', () => {
  test('collects a Telegram rich math block response', async () => {
    const { result, responses } = await executeTool({
      latex: String.raw`P(A \mid B)=\frac{P(B \mid A)P(A)}{P(B)}`,
      text: 'Bayes theorem',
    })

    expect(result).toBe('Rendered LaTeX block math')
    expect(responses).toHaveLength(1)
    expect(responses[0]).toEqual({
      type: 'rich',
      richMessage: {
        html: String.raw`<p>Bayes theorem</p><tg-math-block>P(A \mid B)=\frac{P(B \mid A)P(A)}{P(B)}</tg-math-block>`,
        skip_entity_detection: true,
      },
      fallbackText: String.raw`Bayes theorem

P(A \mid B)=\frac{P(B \mid A)P(A)}{P(B)}`,
    })
  })

  test('escapes html in rich message but keeps fallback readable', async () => {
    const { responses } = await executeTool({
      latex: 'a < b & c',
      text: 'x < y',
      mode: 'inline',
    })

    expect(responses[0]).toEqual({
      type: 'rich',
      richMessage: {
        html: '<p>x &lt; y</p><p><tg-math>a &lt; b &amp; c</tg-math></p>',
        skip_entity_detection: true,
      },
      fallbackText: 'x < y a < b & c',
    })
  })

  test('rejects empty latex', async () => {
    const { result, responses } = await executeTool({ latex: '   ' })

    expect(result).toBe('Error rendering LaTeX: latex cannot be empty')
    expect(responses).toEqual([])
  })
})
