import { getRoundedDate } from '../'

describe('getRoundedDate', () => {
  it('should return the same date if it is already rounded', () => {
    const date = new Date(Date.UTC(2018, 0, 1, 0, 0, 0, 0))
    expect(getRoundedDate(5, date)).toEqual(date)
  })

  it('should round the date to the nearest 5 min', () => {
    const date = new Date(Date.UTC(2018, 0, 1, 1, 1, 1, 1))
    expect(getRoundedDate(5, date).valueOf()).toEqual(1514768400000)
  })

  it('should round the date to the nearest 5 min current date', () => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date(Date.UTC(2018, 0, 1, 1, 1, 1, 1)))

    expect(getRoundedDate(5).valueOf()).toEqual(1514768400000)
  })
})
