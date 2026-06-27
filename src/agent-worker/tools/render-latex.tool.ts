/**
 * Tool for rendering LaTeX through Telegram Rich Message math blocks.
 */

import type { AgentTool } from '../types'
import { addResponse, requireToolContext } from './context'

const MAX_LATEX_CHARS = 4_000
const MAX_CONTEXT_TEXT_CHARS = 800

function getString(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() : undefined
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function normalizeMode(value: unknown): 'block' | 'inline' {
  return value === 'inline' ? 'inline' : 'block'
}

function buildFallbackText(
  latex: string,
  mode: 'block' | 'inline',
  text?: string,
): string {
  if (mode === 'inline') {
    return [text, latex].filter(Boolean).join(' ')
  }

  return [text, latex].filter(Boolean).join('\n\n')
}

export const renderLatexTool: AgentTool = {
  declaration: {
    type: 'function',
    name: 'render_latex',
    description:
      'Render a LaTeX formula using Telegram native rich math. Use for equations, derivations, formulas, and compact mathematical notation. This is better than plain text when the user asks to render LaTeX or show a formula. Use render_svg_to_png instead for charts, plots, geometric diagrams, or visual layouts.',
    parameters: {
      type: 'object',
      properties: {
        latex: {
          type: 'string',
          description:
            'Raw LaTeX formula body without surrounding $ delimiters. Keep it self-contained.',
        },
        mode: {
          type: 'string',
          enum: ['block', 'inline'],
          description:
            'Use "block" for standalone formulas and "inline" for short formulas inside a sentence. Default: block.',
        },
        text: {
          type: 'string',
          description:
            'Optional short plain-text context to show before the formula.',
        },
      },
      required: ['latex'],
    },
  },
  execute: async (args) => {
    requireToolContext()

    const latex = getString(args.latex)
    if (!latex) {
      return 'Error rendering LaTeX: latex cannot be empty'
    }

    if (latex.length > MAX_LATEX_CHARS) {
      return `Error rendering LaTeX: latex exceeds ${MAX_LATEX_CHARS} characters`
    }

    const mode = normalizeMode(args.mode)
    const text = getString(args.text)?.slice(0, MAX_CONTEXT_TEXT_CHARS)
    const escapedLatex = escapeHtml(latex)
    const escapedText = text ? `<p>${escapeHtml(text)}</p>` : ''
    const math =
      mode === 'inline'
        ? `<p><tg-math>${escapedLatex}</tg-math></p>`
        : `<tg-math-block>${escapedLatex}</tg-math-block>`

    addResponse({
      type: 'rich',
      richMessage: {
        html: `${escapedText}${math}`,
        skip_entity_detection: true,
      },
      fallbackText: buildFallbackText(latex, mode, text),
    })

    return `Rendered LaTeX ${mode} math`
  },
}
