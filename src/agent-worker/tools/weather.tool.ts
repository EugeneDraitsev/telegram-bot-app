/**
 * Tool for getting weather information
 */

import { formatWeatherText, getErrorMessage, getWeather } from '@tg-bot/common'
import type { AgentTool } from '../types'
import { addResponse, requireToolContext } from './context'

export const weatherTool: AgentTool = {
  declaration: {
    type: 'function',
    name: 'get_weather',
    description:
      'Get current weather and 3-day forecast for a location. Use when user asks about weather, temperature, or forecast.',
    parameters: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'The city or location (e.g., "Moscow", "Минск")',
        },
      },
      required: ['location'],
    },
  },
  execute: async (args) => {
    requireToolContext()

    try {
      const location = (args.location as string).trim()
      if (!location) {
        return 'Error getting weather: Location cannot be empty'
      }

      const weather = await getWeather(location)
      const text = formatWeatherText(weather)

      addResponse({ type: 'text', text })

      return `Got weather for ${weather.city}: ${weather.temperature}°C, ${weather.description}`
    } catch (error) {
      return `Error getting weather: ${getErrorMessage(error)}`
    }
  },
}
