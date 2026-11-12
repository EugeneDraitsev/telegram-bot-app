import {
  formatWeatherText,
  getErrorMessage,
  getWeather as getWeatherData,
  type WeatherData,
} from '@tg-bot/common'

const getWeatherErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    if (error.message === 'Location cannot be empty') {
      return 'Please provide a valid location to get the weather information.'
    }

    if (error.message === 'OpenWeatherMap token not configured') {
      return 'Weather token is not configured.'
    }

    if (error.message === 'Location not found') {
      return 'Location not found. Please check the city name.'
    }

    if (error.name === 'TimeoutError') {
      return 'Weather request timed out. Please try again.'
    }
  }

  const message = getErrorMessage(error).toLowerCase()
  if (message.includes('timeout')) {
    return 'Weather request timed out. Please try again.'
  }

  return 'Something went wrong while fetching weather data.'
}

/** The text reply for /f, plus the weather behind it when the lookup worked. */
export const getWeather = async (
  location: string,
): Promise<{ text: string; weather?: WeatherData }> => {
  const targetLocation = location?.trim()
  if (!targetLocation) {
    return {
      text: 'Please provide a valid location to get the weather information.',
    }
  }

  try {
    const weather = await getWeatherData(targetLocation)
    return { text: formatWeatherText(weather, 'html'), weather }
  } catch (error) {
    return { text: getWeatherErrorMessage(error) }
  }
}
