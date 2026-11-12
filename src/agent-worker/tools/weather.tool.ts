/**
 * Tool for getting weather information
 */

import { formatWeatherText, getErrorMessage, getWeather } from '@tg-bot/common'
import { buildWeatherWidgetHtml } from '../../telegram-bot/external-apis/weather-widget'
import type { AgentTool } from '../types'
import { addResponse, requireToolContext } from './context'

export const weatherTool: AgentTool = {
  execution: ['terminal'],
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
    const { message } = requireToolContext()

    try {
      const location = (args.location as string).trim()
      if (!location) {
        throw new Error('Location cannot be empty')
      }

      const weather = await getWeather(location)
      const text = formatWeatherText(weather)

      // The private chat gets the same widget as /f, with the text as fallback.
      addResponse(
        message.chat.type === 'private'
          ? {
              type: 'widget',
              html: buildWeatherWidgetHtml(weather),
              fallbackText: text,
            }
          : { type: 'text', text },
      )

      return `Got weather for ${weather.city}: ${weather.temperature}°C, ${weather.description}`
    } catch (error) {
      throw new Error(`Error getting weather: ${getErrorMessage(error)}`)
    }
  },
}
