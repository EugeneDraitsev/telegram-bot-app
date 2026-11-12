import {
  buildWidgetHtml,
  fitsWidgetLimits,
  trySendWidget,
  widgetJson,
} from '..'

const widget = { html: '<b>hi</b>' }

describe('trySendWidget', () => {
  test('sends through the raw Bot API with reply and topic', async () => {
    const message = { message_id: 2 }
    const sendWidget = jest.fn(() => Promise.resolve(message))

    const sent = await trySendWidget({
      api: { raw: { sendWidget } } as never,
      chat: { id: 42, type: 'private' },
      ...widget,
      replyId: 7,
      messageThreadId: 9,
    })

    expect(sent).toBe(message as never)
    expect(sendWidget).toHaveBeenCalledWith({
      chat_id: 42,
      html: '<b>hi</b>',
      reply_parameters: { message_id: 7 },
      message_thread_id: 9,
    })
  })

  test('skips chats where production Telegram delivers no widgets', async () => {
    const sendWidget = jest.fn()

    const sent = await trySendWidget({
      api: { raw: { sendWidget } } as never,
      chat: { id: -100, type: 'supergroup' },
      ...widget,
    })

    expect(sent).toBeUndefined()
    expect(sendWidget).not.toHaveBeenCalled()
  })

  test('resolves to undefined when Telegram rejects the widget', async () => {
    const sendWidget = jest.fn(() => Promise.reject(new Error('too large')))

    const sent = await trySendWidget({
      api: { raw: { sendWidget } } as never,
      chat: { id: 42, type: 'private' },
      ...widget,
    })

    expect(sent).toBeUndefined()
    expect(sendWidget).toHaveBeenCalledWith({ chat_id: 42, ...widget })
  })
})

describe('buildWidgetHtml', () => {
  test('wraps the parts in one document with the shared theme and helpers', () => {
    const html = buildWidgetHtml({
      style: '.x{color:red}',
      body: '<p>body</p>',
      script: 'onShow(()=>{})',
    })

    expect(html).toMatch(/^<!doctype html>/)
    expect(html).toContain('--tg-theme-bg-color')
    expect(html.indexOf('.x{color:red}')).toBeLessThan(html.indexOf('<p>'))
    expect(html.indexOf('const onShow=')).toBeLessThan(
      html.indexOf('onShow(()=>{})'),
    )
  })
})

describe('fitsWidgetLimits', () => {
  test('measures the document after zlib compression', () => {
    // Repetitive markup compresses well; random text does not.
    let seed = 42
    const random = Array.from({ length: 8_000 }, () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31
      return String.fromCharCode(33 + (seed % 90))
    }).join('')

    expect(fitsWidgetLimits('<p>hello</p>'.repeat(2_000))).toBe(true)
    expect(fitsWidgetLimits(random)).toBe(false)
    expect(fitsWidgetLimits('a'.repeat(40_000))).toBe(false)
  })
})

describe('widgetJson', () => {
  test('cannot close the script element it is inlined in', () => {
    const json = widgetJson(['</script><b>'])

    expect(json).not.toContain('<')
    expect(JSON.parse(json)).toEqual(['</script><b>'])
  })
})
