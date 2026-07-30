import {
  parseDestinationUsers,
  parseLegacyUsers,
  summarizeMigration,
} from './statistics-migration'

describe('statistics migration', () => {
  test('maps legacy chat users to per-user records', () => {
    expect(
      parseLegacyUsers([
        {
          chatId: '-100',
          chatInfo: { id: -100, title: 'Chat' },
          users: [
            { id: 1, msgCount: 4, username: 'alice', optedOut: true },
          ],
        },
      ]),
    ).toEqual([
      {
        chatId: '-100',
        userId: 1,
        msgCount: 4,
        username: 'alice',
        optedOut: true,
        chatInfo: { id: -100, title: 'Chat' },
      },
    ])
  })

  test('reports missing, stale and incomplete destination users', () => {
    const legacyItems = [
      {
        chatId: '-100',
        chatInfo: { id: -100 },
        users: [
          { id: 1, msgCount: 4, username: 'alice' },
          { id: 2, msgCount: 2, username: 'bob' },
          { id: 3, msgCount: 1, username: 'carol' },
        ],
      },
    ]
    const legacyUsers = parseLegacyUsers(legacyItems)
    const destinationUsers = parseDestinationUsers([
      {
        chatId: '-100',
        userId: 1,
        msgCount: 6,
        username: 'alice',
        chatInfo: { id: -100 },
      },
      { chatId: '-100', userId: 2, msgCount: 1, username: 'bob' },
    ])

    expect(
      summarizeMigration(legacyItems, legacyUsers, destinationUsers),
    ).toEqual({
      legacyChats: 1,
      legacyUsers: 3,
      destinationUsers: 2,
      missingUsers: 1,
      usersBelowLegacyCount: 1,
      usersMissingChatInfo: 1,
    })
  })

  test('rejects duplicate legacy users', () => {
    expect(() =>
      parseLegacyUsers([
        {
          chatId: '-100',
          users: [
            { id: 1, msgCount: 1, username: 'alice' },
            { id: 1, msgCount: 2, username: 'alice' },
          ],
        },
      ]),
    ).toThrow('Duplicate legacy user')
  })
})
