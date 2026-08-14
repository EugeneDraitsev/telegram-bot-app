/**
 * Tool for rendering model-authored SVG into a Telegram-ready PNG.
 */

import { getErrorMessage, renderSharpImage } from '@tg-bot/common'
import type { AgentTool } from '../types'
import { addResponse, requireToolContext } from './context'

function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() : undefined
}

export const renderSvgTool: AgentTool = {
  execution: ['after-data', 'terminal'],
  timeoutMs: 30_000,
  declaration: {
    type: 'function',
    name: 'render_svg_to_png',
    description:
      'Render a self-contained SVG into a PNG image and send it to Telegram. Use for charts, diagrams, formulas, tables, plots, or other visual answers that Telegram rich text cannot display well. The SVG must be complete inline markup with width/height and viewBox; no scripts, foreignObject, remote images, data URLs, or external fonts.',
    parameters: {
      type: 'object',
      properties: {
        svg: {
          type: 'string',
          description:
            'Complete inline SVG markup. Include xmlns, width, height, viewBox, inline styles, and readable text. Do not include scripts, foreignObject, external links, or embedded raster data.',
        },
        caption: {
          type: 'string',
          description:
            'Optional short caption to send with the rendered image.',
        },
        width: {
          type: 'number',
          description:
            'Optional output width in pixels. Use 640-1200 for most Telegram images.',
        },
        height: {
          type: 'number',
          description:
            'Optional output height in pixels. Use 360-1400 for most Telegram images.',
        },
        backgroundColor: {
          type: 'string',
          description:
            'Optional PNG background. Use a hex color like #ffffff, or "transparent". Default is white.',
        },
      },
      required: ['svg'],
    },
  },
  execute: async (args) => {
    requireToolContext()

    const svg = getString(args.svg)
    if (!svg) {
      throw new Error('Error rendering SVG: svg cannot be empty')
    }

    try {
      const image = await renderSharpImage(
        {
          svg,
          width: args.width,
          height: args.height,
          backgroundColor: getString(args.backgroundColor),
        },
        { customEndpoint: true },
      )

      addResponse({
        type: 'image',
        buffer: image,
        caption: getString(args.caption)?.slice(0, 1000),
      })

      return `Rendered SVG to PNG (${image.byteLength} bytes)`
    } catch (error) {
      throw new Error(`Error rendering SVG: ${getErrorMessage(error)}`)
    }
  },
}
