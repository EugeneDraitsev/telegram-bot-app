import { padStart, sample } from 'lodash'

const whDate = (): string => {
  // https://warhammer40k.fandom.com/wiki/Imperial_Dating_System
  const date = new Date(
    new Date().toLocaleString('en-US', {
      timeZone: 'Europe/Minsk',
    }),
  )
  const startOfYear = new Date(date.getFullYear(), 1, 1, 0, 0, 0).valueOf()
  const endOfYear = new Date(date.getFullYear(), 11, 31, 23, 59, 59).valueOf()
  const secondsInCurrentYear = Math.ceil((endOfYear - startOfYear) / 1000)
  const secondsInFraction = Math.ceil(secondsInCurrentYear / 1000)
  const currentTime = date.valueOf()
  const yearFraction = Math.floor(
    (currentTime - startOfYear) / 1000 / secondsInFraction,
  )
  const currentYear = date.getFullYear()
  const millenium = Math.floor(currentYear / 1000) + 1
  return `0 ${padStart(String(yearFraction), 3, '0')} ${String(
    currentYear,
  ).slice(1, 4)}.M${millenium}`
}

const YEARS = {
  2017: () => '2k17',
  2018: () => '20!8',
  2019: () => '2k19',
  2020: whDate,
  2021: () => '2️⃣0️⃣2️⃣1️⃣',
  2022: () => sample(['² ⁰ ² ²', '２０２２']),
  2023: () => `||${sample(['202 :3', '2023', 'MMXXIII', whDate()])}||`,
}

type Year = keyof typeof YEARS

export const yasnyfy = (text: string): string => {
  const date = new Date(
    new Date().toLocaleString('en-US', {
      timeZone: 'Europe/Minsk',
    }),
  )
  const [month, day, year, weekDay] = [
    date.getMonth(),
    date.getDate(),
    date.getFullYear(),
    date.getDay(),
  ]

  const formattedYear = YEARS[year as Year]?.() ?? year
  const quotedText = text ? `\n\\>${text}` : ''

  if (month === 3 && day === 1) {
    return `\n\\>1 Апреля ${String(year).slice(2)} года${quotedText}\nЯсно😐`
  } else if (weekDay === 4) {
    return `\n\\>${formattedYear}${quotedText}\nЯсна`
  }
  return `\n\\>${formattedYear}${quotedText}\nЯсно`
}
