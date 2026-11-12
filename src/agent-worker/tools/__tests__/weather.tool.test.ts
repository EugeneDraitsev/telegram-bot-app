import type { Message } from 'grammy/types'

import * as common from '@tg-bot/common'
import { getCollectedResponses, runWithToolContext } from '../context'
import { weatherTool } from '../weather.tool'

const weather: common.WeatherData = {
  city: 'Минск',
  country: 'BY',
  countryFlag: '🇧🇾',
  temperature: 2,
  feelsLike: -1,
  humidity: 91,
  windSpeed: 2,
  windDirection: 'З',
  description: 'пасмурно',
  icon: '☁️',
  hourly: [
    {
      hour: 15,
      temperature: 3,
      description: 'пасмурно',
      icon: '☁️',
      precipitationChance: 20,
    },
  ],
  forecast: [{ tempHigh: 3, tempLow: 1, description: 'пасмурно', icon: '☁️' }],
}

const mockGetWeather = jest.spyOn(common, 'getWeather')

afterAll(() => mockGetWeather.mockRestore())

const executeTool = (chatType: 'private' | 'supergroup') =>
  runWithToolContext(
    { chat: { id: 1, type: chatType }, message_id: 1 } as Message,
    undefined,
    async () => {
      const result = await weatherTool.execute({ location: ' Минск ' })
      return { result, responses: getCollectedResponses() }
    },
  )

describe('weatherTool', () => {
  beforeEach(() => {
    mockGetWeather.mockReset().mockResolvedValue(weather)
  })

  test('answers a private chat with the weather widget and a text fallback', async () => {
    const { result, responses } = await executeTool('private')

    expect(mockGetWeather).toHaveBeenCalledWith('Минск')
    expect(result).toBe('Got weather for Минск: 2°C, пасмурно')
    expect(responses).toHaveLength(1)
    const [response] = responses
    if (response.type !== 'widget') throw new Error('expected a widget')
    expect(response.html).toContain('<div class="ct">Минск<small>BY</small>')
    expect(response.fallbackText).toBe(common.formatWeatherText(weather))
  })

  test('answers a group with text, where widgets are not delivered', async () => {
    const { responses } = await executeTool('supergroup')

    expect(responses).toEqual([
      { type: 'text', text: common.formatWeatherText(weather) },
    ])
  })
})
