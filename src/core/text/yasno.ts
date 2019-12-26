import { DateTime } from 'luxon'

const YEARS = {
  2017: '2k17',
  2018: '20!8',
  2019: '2k19',
}

const whDate = (): string => { // https://warhammer40k.fandom.com/wiki/Imperial_Dating_System
  const secondsInYear = 31556926
  const secondsInFraction = 31557
  const currentTimeInSeconds = Math.floor(DateTime.local().setZone('Europe/Minsk').toMillis() / 1000)
  const yearsFromEpochStart = Math.floor(currentTimeInSeconds / secondsInYear)
  const currentYearStart = yearsFromEpochStart * secondsInYear
  const yearFraction = Math.floor((currentTimeInSeconds - currentYearStart) / secondsInFraction)
  const currentYear = yearsFromEpochStart + 1970
  const millenium = Math.floor(currentYear / 1000) + 1
  return `0 ${yearFraction} ${String(currentYear).slice(1, 4)}.M${millenium}`
}
export const yasnyfy = (text: string): string => {
  const { month, day, year } = DateTime.local().setZone('Europe/Minsk').toObject()
  const stringYear = String(year)
  const formattedYear = YEARS[stringYear] || whDate()

  if (month === 4 && day === 1) {
    return `\n>1 Апреля ${stringYear.slice(2)} года${text ? `\n>${text}` : ''}\nЯсно😐`
  }
  return `\n>${formattedYear}${text ? `\n>${text}` : ''}\nЯсно`
}
