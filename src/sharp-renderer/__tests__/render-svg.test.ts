import sharp from 'sharp'

import * as common from '@tg-bot/common'
import sharpRendererHandler, { renderSvgPng } from '../index'

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160" viewBox="0 0 320 160"><rect width="320" height="160" fill="#ffffff"/></svg>'

async function renderWithWidth(width: number) {
  const response = await sharpRendererHandler({ svg: SVG, width } as never)

  expect(response.statusCode).toBe(200)
  return sharp(Buffer.from(response.body, 'base64')).metadata()
}

describe('renderSvgPng', () => {
  test('renders inline svg to png', async () => {
    const image = await renderSvgPng(
      '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160" viewBox="0 0 320 160"><rect width="320" height="160" fill="#ffffff"/><text x="24" y="84" font-size="28" fill="#111827">y = x^2</text></svg>',
    )

    const metadata = await sharp(image).metadata()

    expect(image.length).toBeGreaterThan(0)
    expect(metadata.format).toBe('png')
    expect(metadata.width).toBe(320)
    expect(metadata.height).toBe(160)
  })

  test('rounds and clamps dimensions at the lambda boundary', async () => {
    const rounded = await renderWithWidth(640.4)
    const clamped = await renderWithWidth(999_999)

    expect(rounded.width).toBe(640)
    expect(clamped.width).toBe(2_000)
  })

  test('rejects active svg content', async () => {
    await expect(
      renderSvgPng(
        '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      ),
    ).rejects.toThrow('unsupported active content')
  })

  test('rejects embedded data resources by default', async () => {
    await expect(
      renderSvgPng(
        '<svg xmlns="http://www.w3.org/2000/svg"><image href="data:image/png;base64,AAAA"/></svg>',
      ),
    ).rejects.toThrow('must not embed data resources')
  })

  test('rejects external resources with whitespace-obfuscated protocols', async () => {
    await expect(
      renderSvgPng(
        '<svg xmlns="http://www.w3.org/2000/svg"><image href="h t t p s : //example.com/image.png"/></svg>',
      ),
    ).rejects.toThrow('must not reference external resources')
  })

  test('rejects oversized svg', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><desc>${'x'.repeat(260_000)}</desc><rect width="1" height="1"/></svg>`

    await expect(renderSvgPng(svg)).rejects.toThrow('SVG exceeds 250000 bytes')
  })
})

describe('daily chart', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  test('renders user names that look like links or data URIs', async () => {
    jest.spyOn(common, 'get24hChatStats').mockResolvedValue([
      { id: 1, is_bot: false, first_name: 'https://example.com', messages: 3 },
      { id: 2, is_bot: false, first_name: 'Data: fan', messages: 2 },
    ])

    const response = await sharpRendererHandler({
      queryStringParameters: { chatId: '-100' },
    } as never)

    expect(response.statusCode).toBe(200)
    const metadata = await sharp(
      Buffer.from(response.body, 'base64'),
    ).metadata()
    expect(metadata.format).toBe('png')
  })
})
