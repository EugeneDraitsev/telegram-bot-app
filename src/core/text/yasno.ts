import { DateTime } from 'luxon'

const YEARS = {
  2017: '2k17',
  2018: '20!8',
}

export const yasnyfy = (text: string): string => {
  const { month, day, year } = DateTime.local().setZone('Europe/Minsk').toObject()
  const stringYear = String(year)
  const formattedYear = YEARS[stringYear] || stringYear.replace('0', 'k')

  if (month === 4 && day === 1) {
    return `\n>1 Апреля ${stringYear.slice(2)} года${text ? `\n>${text}` : ''}\nЯсно😐`
  }
  return `\n>${formattedYear}${text ? `\n>${text}` : ''}\nЯсно`
}
