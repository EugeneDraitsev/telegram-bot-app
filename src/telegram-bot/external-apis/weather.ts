import {
  formatWeatherText,
  getErrorMessage,
  getWeather as getWeatherData,
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

export const getWeather = async (location: string) => {
  const targetLocation = location?.trim()
  if (!targetLocation) {
    return 'Please provide a valid location to get the weather information.'
  }

  try {
    const weather = await getWeatherData(targetLocation)
    return formatWeatherText(weather, 'html')
  } catch (error) {
    return getWeatherErrorMessage(error)
  }
}
