type UnknownRecord = Record<string, unknown>

export interface MigratedUser {
  chatId: string
  userId: number
  msgCount: number
  username: string
  optedOut?: boolean
  chatInfo?: unknown
  updatedAt?: number
}

export interface MigrationSummary {
  legacyChats: number
  legacyUsers: number
  destinationUsers: number
  missingUsers: number
  usersBelowLegacyCount: number
  usersMissingChatInfo: number
}

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null

const userKey = ({ chatId, userId }: Pick<MigratedUser, 'chatId' | 'userId'>) =>
  JSON.stringify([chatId, userId])

const parseUser = (
  value: unknown,
  chatId: string,
  chatInfo: unknown,
): MigratedUser => {
  if (
    !isRecord(value) ||
    typeof value.id !== 'number' ||
    !Number.isSafeInteger(value.id) ||
    typeof value.msgCount !== 'number' ||
    !Number.isSafeInteger(value.msgCount) ||
    value.msgCount < 0 ||
    typeof value.username !== 'string' ||
    (value.optedOut !== undefined && typeof value.optedOut !== 'boolean')
  ) {
    throw new Error(`Invalid legacy user in chat ${chatId}`)
  }

  return {
    chatId,
    userId: value.id,
    msgCount: value.msgCount,
    username: value.username,
    optedOut: value.optedOut,
    chatInfo,
  }
}

export const parseLegacyUsers = (items: unknown[]): MigratedUser[] => {
  const users = new Map<string, MigratedUser>()

  for (const value of items) {
    if (!isRecord(value) || typeof value.chatId !== 'string') {
      throw new Error('Invalid legacy chat statistics item')
    }
    if (value.users !== undefined && !Array.isArray(value.users)) {
      throw new Error(`Invalid users list in chat ${value.chatId}`)
    }

    for (const userValue of value.users ?? []) {
      const user = parseUser(userValue, value.chatId, value.chatInfo)
      const key = userKey(user)
      if (users.has(key)) {
        throw new Error(
          `Duplicate legacy user ${user.userId} in chat ${user.chatId}`,
        )
      }
      users.set(key, user)
    }
  }

  return [...users.values()]
}

export const parseDestinationUsers = (items: unknown[]): MigratedUser[] =>
  items.map((value) => {
    if (
      !isRecord(value) ||
      typeof value.chatId !== 'string' ||
      typeof value.userId !== 'number' ||
      !Number.isSafeInteger(value.userId) ||
      typeof value.msgCount !== 'number' ||
      !Number.isSafeInteger(value.msgCount) ||
      value.msgCount < 0 ||
      typeof value.username !== 'string' ||
      (value.optedOut !== undefined && typeof value.optedOut !== 'boolean') ||
      (value.updatedAt !== undefined && typeof value.updatedAt !== 'number')
    ) {
      throw new Error('Invalid destination user statistics item')
    }

    return {
      chatId: value.chatId,
      userId: value.userId,
      msgCount: value.msgCount,
      username: value.username,
      optedOut: value.optedOut,
      chatInfo: value.chatInfo,
      updatedAt: value.updatedAt,
    }
  })

export const indexUsers = (users: MigratedUser[]) =>
  new Map(users.map((user) => [userKey(user), user]))

export const summarizeMigration = (
  legacyItems: unknown[],
  legacyUsers: MigratedUser[],
  destinationUsers: MigratedUser[],
): MigrationSummary => {
  const destinationByKey = indexUsers(destinationUsers)
  let missingUsers = 0
  let usersBelowLegacyCount = 0
  let usersMissingChatInfo = 0

  for (const legacyUser of legacyUsers) {
    const destinationUser = destinationByKey.get(userKey(legacyUser))
    if (!destinationUser) {
      missingUsers += 1
      continue
    }
    if (destinationUser.msgCount < legacyUser.msgCount) {
      usersBelowLegacyCount += 1
    }
    if (
      legacyUser.chatInfo !== undefined &&
      destinationUser.chatInfo === undefined
    ) {
      usersMissingChatInfo += 1
    }
  }

  return {
    legacyChats: legacyItems.length,
    legacyUsers: legacyUsers.length,
    destinationUsers: destinationUsers.length,
    missingUsers,
    usersBelowLegacyCount,
    usersMissingChatInfo,
  }
}
