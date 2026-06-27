/**
 * Tool for rendering model-authored SVG into a Telegram-ready PNG.
 */

import { getErrorMessage, invokeLambda, safeJSONParse } from '@tg-bot/common'
import type { AgentTool } from '../types'
import { addResponse, requireToolContext } from './context'

const SHARP_RENDERER_LAMBDA_NAME = `telegram-${process.env.stage}-sharp-renderer`
const MAX_SVG_CHARS = 250_000
const MAX_RENDER_DIMENSION = 2_000

function getDimension(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }

  return Math.max(1, Math.min(MAX_RENDER_DIMENSION, Math.round(value)))
}

function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() : undefined
}

function getRendererError(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return 'renderer returned an invalid response'
  }

  const error = (payload as { error?: unknown }).error
  return typeof error === 'string' && error.trim()
    ? error.trim()
    : 'renderer failed'
}

export const renderSvgTool: AgentTool = {
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
      return 'Error rendering SVG: svg cannot be empty'
    }

    if (svg.length > MAX_SVG_CHARS) {
      return `Error rendering SVG: svg exceeds ${MAX_SVG_CHARS} characters`
    }

    try {
      const sharpResponse = await invokeLambda({
        name: SHARP_RENDERER_LAMBDA_NAME,
        customEndpoint: true,
        payload: {
          svg,
          width: getDimension(args.width),
          height: getDimension(args.height),
          backgroundColor: getString(args.backgroundColor),
        },
      })

      if (sharpResponse.FunctionError) {
        return `Error rendering SVG: ${sharpResponse.FunctionError}`
      }

      const payload = safeJSONParse(
        new TextDecoder().decode(sharpResponse.Payload),
      )

      if (payload?.statusCode !== 200) {
        return `Error rendering SVG: ${getRendererError(payload)}`
      }

      if (typeof payload.body !== 'string') {
        return 'Error rendering SVG: renderer returned no image body'
      }

      const image = Buffer.from(payload.body, 'base64')
      if (image.byteLength === 0) {
        return 'Error rendering SVG: renderer returned an empty image'
      }

      addResponse({
        type: 'image',
        buffer: image,
        caption: getString(args.caption)?.slice(0, 1000),
      })

      return `Rendered SVG to PNG (${image.byteLength} bytes)`
    } catch (error) {
      return `Error rendering SVG: ${getErrorMessage(error)}`
    }
  },
}
