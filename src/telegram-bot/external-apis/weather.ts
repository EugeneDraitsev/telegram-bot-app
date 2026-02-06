import { formatWeatherText, getWeather as getWeatherData } from '@tg-bot/common'

export const getWeather = async (location: string) => {
  const targetLocation = location?.trim()
  if (!targetLocation) {
    return 'Please provide a valid location to get the weather information.'
  }

  try {
    const weather = await getWeatherData(targetLocation)
    return formatWeatherText(weather, 'html')
  } catch (_error) {
    return 'Something went wrong while fetching weather data.'
  }
}
