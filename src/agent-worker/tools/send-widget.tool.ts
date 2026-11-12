/**
 * Tool for sending a model-authored HTML widget (Bot API 10.4).
 */

import {
  buildWidgetHtml,
  fitsWidgetLimits,
  WIDGET_MAX_COMPRESSED_BYTES,
  widgetCompressedSize,
} from '@tg-bot/common'
import type { AgentTool } from '../types'
import { addResponse, requireToolContext } from './context'

const MAX_CAPTION_LENGTH = 1024

/** Telegram rejects NUL characters in a widget document. */
function getString(value: unknown): string {
  return typeof value === 'string' ? value.replaceAll('\0', '').trim() : ''
}

export const sendWidgetTool: AgentTool = {
  execution: ['after-data', 'terminal'],
  privateChatOnly: true,
  declaration: {
    type: 'function',
    name: 'send_widget',
    description:
      'Send an interactive HTML widget: a small sandboxed app rendered inside the message. Use it when the answer is better shown than told: dashboards, charts, comparisons, timelines, calculators, quizzes, mini-games. The canvas is a phone-width message bubble, about 320-430px wide and at most 600px tall with no scrolling, so size the content to fit. The renderer is not a browser. Use flexbox, absolute positioning, 2D transforms, transitions, @keyframes, gradients, inline SVG shapes, canvas 2D and emoji. There is no network, no external files or fonts (images only as data: URLs or inline SVG), no form inputs, iframes, vh units, scrolling, :has(), :focus or CSS nesting. Interactivity is <button> elements with click listeners. The whole widget must stay under 4096 bytes after zlib compression, so write compact code. Already provided: CSS variables --bg (background), --sf (card surface), --tx (text), --ht (hint text), --ac (accent), --ln (separator) that follow the Telegram theme; classes .card (rounded surface block), .ttl (small caps label), .hd (card header row); JS helpers $(id), tween(ms, fn) which calls fn with eased progress from 0 to 1, onShow(fn) which runs intro animations once the widget is visible, and tick() for haptic feedback.',
    parameters: {
      type: 'object',
      properties: {
        html: {
          type: 'string',
          description:
            'Body markup of the widget, without <html>, <head> or <body>.',
        },
        css: {
          type: 'string',
          description:
            'Styles for the widget, without a <style> tag. Use the provided color variables instead of fixed colors.',
        },
        js: {
          type: 'string',
          description: 'Script for the widget, without a <script> tag.',
        },
        caption: {
          type: 'string',
          description:
            'Optional short message shown under the widget. Do not repeat what the widget already shows.',
        },
        fallback_text: {
          type: 'string',
          description:
            'Plain-text version of the same answer, sent only if the widget cannot be delivered.',
        },
      },
      required: ['html', 'fallback_text'],
    },
  },
  execute: async (args) => {
    const { message } = requireToolContext()
    if (message.chat.type !== 'private') {
      throw new Error(
        'Error sending widget: widgets are only available in private chats',
      )
    }

    const body = getString(args.html)
    const fallbackText = getString(args.fallback_text)
    if (!body || !fallbackText) {
      throw new Error(
        'Error sending widget: html and fallback_text cannot be empty',
      )
    }

    const html = buildWidgetHtml({
      // A closing tag inside the model's code would end the element early.
      style: getString(args.css).replaceAll('</style', ''),
      body,
      script: getString(args.js).replaceAll('</script', '<\\/script'),
    })
    const size = widgetCompressedSize(html)
    if (!fitsWidgetLimits(html)) {
      throw new Error(
        `Error sending widget: it is ${size} bytes after compression, the limit is ${WIDGET_MAX_COMPRESSED_BYTES}. Shorten the markup, styles and script.`,
      )
    }

    addResponse({
      type: 'widget',
      html,
      caption:
        getString(args.caption).slice(0, MAX_CAPTION_LENGTH) || undefined,
      fallbackText,
    })

    return `Widget queued (${size} of ${WIDGET_MAX_COMPRESSED_BYTES} compressed bytes)`
  },
}
