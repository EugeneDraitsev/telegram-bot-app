/**
 * Tool for mathematical calculations
 * Pure tool - returns calculation result
 */

import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'

import { requireToolContext } from './context'

// Safe math expression evaluator (no eval!)
function evaluateExpression(expr: string): number {
  // Remove whitespace
  const sanitized = expr.replace(/\s+/g, '')

  // Only allow safe characters: digits, operators, parentheses, decimal point
  if (!/^[\d+\-*/().%^]+$/.test(sanitized)) {
    throw new Error('Invalid characters in expression')
  }

  // Replace ^ with ** for power
  const jsExpr = sanitized.replace(/\^/g, '**')

  // Use Function constructor for safe evaluation (no access to scope)
  const result = new Function(`return ${jsExpr}`)()

  if (typeof result !== 'number' || !Number.isFinite(result)) {
    throw new Error('Result is not a valid number')
  }

  return result
}

export const calculatorTool = new DynamicStructuredTool({
  name: 'calculator',
  description:
    'Perform mathematical calculations. Use for arithmetic operations like addition, subtraction, multiplication, division, percentages, and powers. Supports parentheses for complex expressions.',
  schema: z.object({
    expression: z
      .string()
      .describe(
        'Mathematical expression to evaluate (e.g., "2 + 2", "15 * 7", "(100 - 20) / 4", "2^10", "50%")',
      ),
  }),
  func: async ({ expression }) => {
    requireToolContext()

    try {
      // Handle percentage as "X% of Y" or just "X%" (convert to decimal)
      let processedExpr = expression

      // Convert "X%" to "X/100" when standalone
      processedExpr = processedExpr.replace(/(\d+(?:\.\d+)?)%/g, '($1/100)')

      const result = evaluateExpression(processedExpr)

      // Format result nicely
      const formatted = Number.isInteger(result)
        ? result.toString()
        : result.toFixed(6).replace(/\.?0+$/, '')

      return `${expression} = ${formatted}`
    } catch (_error) {
      return `Error calculating "${expression}": Invalid expression. Please use valid math operators (+, -, *, /, ^, %) and numbers.`
    }
  },
})
