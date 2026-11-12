import type { Message } from 'grammy/types'

import { fitsWidgetLimits } from '@tg-bot/common'
import { getCollectedResponses, runWithToolContext } from '../context'
import { getBaseAgentTools, isToolAvailableInChat } from '../index'
import { sendWidgetTool } from '../send-widget.tool'

const privateMessage = {
  chat: { id: 1, type: 'private' },
  message_id: 1,
} as Message
const groupMessage = {
  chat: { id: -100, type: 'supergroup' },
  message_id: 1,
} as Message

const executeTool = (args: Record<string, unknown>, message = privateMessage) =>
  runWithToolContext(message, undefined, async () => {
    const result = await sendWidgetTool.execute(args)
    return { result, responses: getCollectedResponses() }
  })

describe('sendWidgetTool', () => {
  test('wraps the model parts in the shared theme and queues a widget', async () => {
    const { result, responses } = await executeTool({
      html: '<div class="card"><b id="n">0</b></div>',
      css: '#n{color:var(--ac)}',
      js: "onShow(()=>tween(600,(p)=>{$('n').textContent=Math.round(42*p)}))",
      caption: ' Tap to count. ',
      fallback_text: 'The answer is 42.',
    })

    expect(responses).toHaveLength(1)
    const [response] = responses
    if (response.type !== 'widget') throw new Error('expected a widget')
    expect(response.caption).toBe('Tap to count.')
    expect(response.fallbackText).toBe('The answer is 42.')
    expect(response.html).toMatch(/^<!doctype html>/)
    expect(response.html).toContain('--tg-theme-bg-color')
    expect(response.html).toContain('#n{color:var(--ac)}</style>')
    expect(response.html).toContain('<div class="card"><b id="n">0</b></div>')
    // The shared helpers are defined before the model's script uses them.
    expect(response.html.indexOf('const onShow=')).toBeLessThan(
      response.html.indexOf('onShow(()=>tween(600'),
    )
    expect(fitsWidgetLimits(response.html)).toBe(true)
    expect(result).toMatch(/^Widget queued \(\d+ of 4096 compressed bytes\)$/)
  })

  test('keeps closing tags and NUL characters from breaking the document', async () => {
    const { responses } = await executeTool({
      html: '<p>hi\0</p>',
      css: 'p{margin:0}</style><b>',
      js: "const s='</script>'",
      fallback_text: 'hi',
    })

    const [response] = responses
    if (response.type !== 'widget') throw new Error('expected a widget')
    expect(response.html).not.toContain('\0')
    expect(response.html).toContain('p{margin:0}><b></style>')
    expect(response.html).toContain("const s='<\\/script>'")
    expect(response.html.split('</script>')).toHaveLength(2)
    expect(response.caption).toBeUndefined()
  })

  test('tells the model how far over the size limit a widget is', async () => {
    let seed = 3
    const noise = Array.from({ length: 9_000 }, () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31
      return String.fromCharCode(97 + ((seed >>> 16) % 26))
    }).join('')

    await expect(
      executeTool({ html: `<p>${noise}</p>`, fallback_text: 'noise' }),
    ).rejects.toThrow(/it is \d+ bytes after compression, the limit is 4096/)
  })

  test('requires the markup and the plain-text version', async () => {
    await expect(executeTool({ html: '<p>hi</p>' })).rejects.toThrow(
      'html and fallback_text cannot be empty',
    )
    await expect(
      executeTool({ html: ' ', fallback_text: 'hi' }),
    ).rejects.toThrow('html and fallback_text cannot be empty')
  })

  test('refuses to run outside a private chat', async () => {
    await expect(
      executeTool({ html: '<p>hi</p>', fallback_text: 'hi' }, groupMessage),
    ).rejects.toThrow('only available in private chats')
  })

  test('is offered to the model only in private chats', () => {
    const offeredIn = (message: Message) =>
      getBaseAgentTools()
        .filter((tool) => isToolAvailableInChat(tool, message.chat))
        .map((tool) => tool.declaration.name)

    expect(offeredIn(privateMessage)).toContain('send_widget')
    expect(offeredIn(groupMessage)).not.toContain('send_widget')
    expect(offeredIn(groupMessage)).toContain('render_svg_to_png')
  })
})
