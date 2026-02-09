export interface ForecastDay {
  tempHigh: number
  tempLow: number
  description: string
  icon: string
}

export interface WeatherData {
  city: string
  country: string
  countryFlag: string
  temperature: number
  humidity: number
  windSpeed: number
  windDirection: string
  description: string
  icon: string
  forecast: ForecastDay[]
}
