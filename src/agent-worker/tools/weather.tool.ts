/**
 * Tool for getting weather information
 * Pure tool - adds response to collector, doesn't send directly
 */

import { DynamicStructuredTool } from '@langchain/core/tools'
import { z } from 'zod'

import { formatWeatherText, getWeather } from '../services'
import { addResponse, requireToolContext } from './context'

export const weatherTool = new DynamicStructuredTool({
  name: 'get_weather',
  description:
    'Get current weather and 3-day forecast for a location. Use when user asks about weather, temperature, or forecast.',
  schema: z.object({
    location: z
      .string()
      .describe(
        'The city or location (e.g., "Moscow", "New York", "Минск", "Киев")',
      ),
  }),
  func: async ({ location }) => {
    requireToolContext()

    try {
      const normalizedLocation = location.trim()
      if (!normalizedLocation) {
        return 'Error getting weather: Location cannot be empty'
      }

      const weather = await getWeather(normalizedLocation)
      const text = formatWeatherText(weather)

      addResponse({
        type: 'text',
        text,
      })

      return `Got weather for ${weather.city}: ${weather.temperature}°C, ${weather.description}`
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : 'Weather fetch failed'
      return `Error getting weather: ${errorMsg}`
    }
  },
})
