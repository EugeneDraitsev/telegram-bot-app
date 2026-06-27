import sharp from 'sharp'

import { renderSvgPng } from '../index'

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
})
