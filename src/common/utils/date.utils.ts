export const getRoundedDate = (minutes: number, d = new Date()) => {
  const ms = 1000 * 60 * minutes // convert minutes to ms
  return new Date(Math.round(d.getTime() / ms) * ms)
}
