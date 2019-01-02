const YEARS = {
  2017: '2k17',
  2018: '20!8',
}

export const yasnyfy = (text: string, year: string) => {
  const formattedYear = YEARS[year] || year.replace('0', 'k')
  return `\n>${formattedYear}${text ? `\n>${text}` : ''}\nЯсно`
}
