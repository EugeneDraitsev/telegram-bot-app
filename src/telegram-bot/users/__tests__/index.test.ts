import {
  buildAllMentionBatches,
  filterMentionableUsers,
  isTelegramUsername,
} from '../index'

describe('users /all helpers', () => {
  test('isTelegramUsername enforces Telegram username length rules', () => {
    expect(isTelegramUsername('alpha1')).toBe(true)
    expect(isTelegramUsername('@bravo_2')).toBe(true)
    expect(isTelegramUsername('shrt')).toBe(false)
    expect(isTelegramUsername('a'.repeat(33))).toBe(false)
    expect(isTelegramUsername('bad name')).toBe(false)
  })

  test('filterMentionableUsers keeps only users with valid Telegram usernames', () => {
    expect(
      filterMentionableUsers([
        { id: 1, username: 'alpha1' },
        { id: 2, username: '@bravo_2' },
        { id: 3, username: 'shrt' },
        { id: 4, username: 'bad name' },
        { id: 0, username: 'charlie_3' },
      ]),
    ).toEqual([
      { id: 1, username: 'alpha1' },
      { id: 2, username: '@bravo_2' },
    ])
  })

  test('buildAllMentionBatches batches by five and keeps query only in the first batch', () => {
    expect(
      buildAllMentionBatches(
        [
          { id: 1, username: 'alpha1' },
          { id: 2, username: '@bravo_2' },
          { id: 3, username: 'charlie_3' },
          { id: 4, username: 'delta_4' },
          { id: 5, username: 'echo_5' },
          { id: 6, username: 'foxtrot_6' },
          { id: 7, username: 'shrt' },
        ],
        'wake up',
      ),
    ).toEqual([
      '@alpha1 @bravo_2 @charlie_3 @delta_4 @echo_5\nwake up',
      '@foxtrot_6',
    ])
  })
})
