export interface ForecastDay {
  tempHigh: number
  tempLow: number
  description: string
  icon: string
}

export interface HourlyForecast {
  /** Local hour at the location, 0-23. */
  hour: number
  temperature: number
  description: string
  icon: string
  /** Chance of precipitation, 0-100. */
  precipitationChance: number
}

export interface WeatherData {
  city: string
  country: string
  countryFlag: string
  temperature: number
  feelsLike: number
  humidity: number
  windSpeed: number
  windDirection: string
  description: string
  icon: string
  /** The next 24 hours in 3-hour steps. */
  hourly: HourlyForecast[]
  forecast: ForecastDay[]
}
