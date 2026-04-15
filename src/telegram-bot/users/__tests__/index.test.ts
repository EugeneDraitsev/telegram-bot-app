import {
  buildAllMentionBatches,
  buildBatchSendOptions,
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
        { username: 'alpha1' },
        { username: '@bravo_2' },
        { username: 'shrt' },
        { username: 'bad name' },
        {},
      ]),
    ).toEqual([{ username: 'alpha1' }, { username: '@bravo_2' }])
  })

  test('filterMentionableUsers excludes users with optedOut set to true', () => {
    const result = filterMentionableUsers([
      { username: 'alpha1' },
      { username: 'bravo_2', optedOut: true },
      { username: 'charlie_3', optedOut: false },
      { username: 'delta_44', optedOut: undefined },
    ])
    expect(result.map((u) => u.username)).toEqual([
      'alpha1',
      'charlie_3',
      'delta_44',
    ])
  })

  test('buildAllMentionBatches never includes opted-out users', () => {
    const users = filterMentionableUsers([
      { username: 'alpha1' },
      { username: 'bravo_2', optedOut: true },
      { username: 'charlie_3' },
    ])
    const batches = buildAllMentionBatches(users, 'hello')
    const combined = batches.join(' ')
    expect(combined).toContain('@alpha1')
    expect(combined).toContain('@charlie_3')
    expect(combined).not.toContain('@bravo_2')
  })

  test('buildAllMentionBatches batches by five and keeps query only in the first batch', () => {
    expect(
      buildAllMentionBatches(
        [
          { username: 'alpha1' },
          { username: '@bravo_2' },
          { username: 'charlie_3' },
          { username: 'delta_4' },
          { username: 'echo_5' },
          { username: 'foxtrot_6' },
        ],
        'wake up',
      ),
    ).toEqual([
      '@alpha1 @bravo_2 @charlie_3 @delta_4 @echo_5\nwake up',
      '@foxtrot_6',
    ])
  })

  test('buildAllMentionBatches falls back to the default batch size when chunk size is invalid', () => {
    expect(
      buildAllMentionBatches(
        [
          { username: 'alpha1' },
          { username: 'bravo_2' },
          { username: 'charlie_3' },
          { username: 'delta_4' },
          { username: 'echo_5' },
          { username: 'foxtrot_6' },
        ],
        'wake up',
        0,
      ),
    ).toEqual([
      '@alpha1 @bravo_2 @charlie_3 @delta_4 @echo_5\nwake up',
      '@foxtrot_6',
    ])
  })

  test('buildBatchSendOptions preserves reply and topic context for follow-up batches', () => {
    expect(buildBatchSendOptions(91, 777)).toEqual({
      reply_parameters: { message_id: 91 },
      message_thread_id: 777,
    })
    expect(buildBatchSendOptions(undefined, 777)).toEqual({
      message_thread_id: 777,
    })
  })
})
