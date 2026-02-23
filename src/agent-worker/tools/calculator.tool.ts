/**
 * Tool for mathematical calculations
 */

import { type AgentTool, Type } from '../types'
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

export const calculatorTool: AgentTool = {
  declaration: {
    name: 'calculator',
    description:
      'Perform mathematical calculations. Use for arithmetic operations like addition, subtraction, multiplication, division, percentages, and powers.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        expression: {
          type: Type.STRING,
          description:
            'Mathematical expression to evaluate (e.g., "2 + 2", "15 * 7", "(100 - 20) / 4", "2^10")',
        },
      },
      required: ['expression'],
    },
  },
  execute: async (args) => {
    requireToolContext()
    const expression = args.expression as string

    try {
      let processedExpr = expression
      processedExpr = processedExpr.replace(/(\d+(?:\.\d+)?)%/g, '($1/100)')
      const result = evaluateExpression(processedExpr)

      const formatted = Number.isInteger(result)
        ? result.toString()
        : result.toFixed(6).replace(/\.?0+$/, '')

      return `${expression} = ${formatted}`
    } catch (_error) {
      return `Error calculating "${expression}": Invalid expression.`
    }
  },
}
