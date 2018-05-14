const YEARS = {
  2017: '2k17',
  2018: '20!8',
}

export const yasnyfy = (text: string) => {
  const year = YEARS[new Date().getFullYear()]
  return `\n>${year}${text ? `\n>${text}` : ''}\nЯсно`
}
