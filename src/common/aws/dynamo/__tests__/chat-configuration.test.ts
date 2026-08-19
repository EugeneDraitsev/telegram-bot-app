import * as utils from '../../../utils'
import {
  CHAT_CONFIGURATION_CACHE_TTL_MS,
  clearChatConfigurationCache,
  getChatConfiguration,
  isAgenticBotGloballyEnabled,
  isAgenticChatEnabled,
  isAiAllowedChat,
  isBotOwner,
  setChatAiAllowed,
  setChatConfigurationFlags,
  toggleAgenticChat,
} from '../chat-configuration'

const getSpy = jest.spyOn(utils, 'dynamoGetItem')
const updateSpy = jest.spyOn(utils, 'dynamoUpdateItem')
const originalSwitch = process.env.AGENTIC_BOT_ENABLED
const originalOwnerId = process.env.BOT_OWNER_ID
const originalOffline = process.env.IS_OFFLINE

beforeEach(() => {
  clearChatConfigurationCache()
  getSpy.mockReset()
  updateSpy.mockReset()
  getSpy.mockResolvedValue({} as never)
  updateSpy.mockResolvedValue({} as never)
  delete process.env.AGENTIC_BOT_ENABLED
  delete process.env.BOT_OWNER_ID
  delete process.env.IS_OFFLINE
})

afterAll(() => {
  getSpy.mockRestore()
  updateSpy.mockRestore()
  if (originalSwitch === undefined) {
    delete process.env.AGENTIC_BOT_ENABLED
  } else {
    process.env.AGENTIC_BOT_ENABLED = originalSwitch
  }
  if (originalOwnerId === undefined) {
    delete process.env.BOT_OWNER_ID
  } else {
    process.env.BOT_OWNER_ID = originalOwnerId
  }
  if (originalOffline === undefined) {
    delete process.env.IS_OFFLINE
  } else {
    process.env.IS_OFFLINE = originalOffline
  }
})

describe('global agentic switch and owner identity', () => {
  test('global switch defaults to enabled', () => {
    expect(isAgenticBotGloballyEnabled()).toBe(true)
  })

  test.each(['false', '0', 'off', 'disabled'])(
    'treats %s as disabled',
    (value) => {
      process.env.AGENTIC_BOT_ENABLED = value
      expect(isAgenticBotGloballyEnabled()).toBe(false)
    },
  )

  test('owner check fails closed and matches only the configured Telegram id', () => {
    expect(isBotOwner(7)).toBe(false)
    process.env.BOT_OWNER_ID = '42'
    expect(isBotOwner(42)).toBe(true)
    expect(isBotOwner('42')).toBe(true)
    expect(isBotOwner(7)).toBe(false)
  })
})

describe('chat configuration reads', () => {
  test('reads both permanent DynamoDB gates', async () => {
    getSpy.mockResolvedValue({
      Item: {
        chatId: '-100',
        aiAllowed: true,
        agenticEnabled: true,
        version: 2,
      },
    } as never)

    await expect(isAgenticChatEnabled(-100)).resolves.toBe(true)
    expect(getSpy).toHaveBeenCalledWith({
      TableName: 'chat-configuration',
      Key: { chatId: '-100' },
      ConsistentRead: true,
    })
  })

  test('requires both owner allow and administrator toggle', async () => {
    getSpy.mockResolvedValue({
      Item: {
        chatId: '123',
        aiAllowed: true,
        agenticEnabled: false,
      },
    } as never)

    await expect(isAiAllowedChat(123)).resolves.toBe(true)
    await expect(isAgenticChatEnabled(123)).resolves.toBe(false)
    expect(getSpy).toHaveBeenCalledTimes(1)
  })

  test('defaults missing configuration to both flags disabled', async () => {
    await expect(getChatConfiguration(123)).resolves.toEqual({
      chatId: '123',
      aiAllowed: false,
      agenticEnabled: false,
      version: 0,
    })
  })

  test('uses the warm-instance cache', async () => {
    getSpy.mockResolvedValue({
      Item: {
        chatId: '123',
        aiAllowed: true,
        agenticEnabled: true,
      },
    } as never)

    await isAgenticChatEnabled(123)
    await isAgenticChatEnabled(123)

    expect(getSpy).toHaveBeenCalledTimes(1)
    expect(getSpy).toHaveBeenCalledWith(
      expect.objectContaining({ ConsistentRead: true }),
    )
  })

  test('refreshes the cross-instance view after the five-second TTL', async () => {
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000)
    getSpy
      .mockResolvedValueOnce({
        Item: { chatId: '123', aiAllowed: true, agenticEnabled: true },
      } as never)
      .mockResolvedValueOnce({
        Item: { chatId: '123', aiAllowed: true, agenticEnabled: false },
      } as never)

    await expect(isAgenticChatEnabled(123)).resolves.toBe(true)
    dateNowSpy.mockReturnValue(1_000 + CHAT_CONFIGURATION_CACHE_TTL_MS + 1)
    await expect(isAgenticChatEnabled(123)).resolves.toBe(false)
    dateNowSpy.mockRestore()

    expect(getSpy).toHaveBeenCalledTimes(2)
  })

  test('fails closed when DynamoDB cannot be read', async () => {
    getSpy.mockRejectedValue(new Error('dynamo unavailable'))

    await expect(isAgenticChatEnabled(123)).resolves.toBe(false)
  })

  test('fails closed without reading DynamoDB when globally disabled', async () => {
    process.env.AGENTIC_BOT_ENABLED = 'false'

    await expect(isAgenticChatEnabled(123)).resolves.toBe(false)
    expect(getSpy).not.toHaveBeenCalled()
  })

  test('allows local offline requests without reading DynamoDB', async () => {
    process.env.IS_OFFLINE = 'true'

    await expect(isAiAllowedChat(123)).resolves.toBe(true)
    await expect(isAgenticChatEnabled(123)).resolves.toBe(true)
    expect(getSpy).not.toHaveBeenCalled()
  })

  test('keeps the global switch effective during local offline runs', async () => {
    process.env.IS_OFFLINE = 'true'
    process.env.AGENTIC_BOT_ENABLED = 'false'

    await expect(isAgenticChatEnabled(123)).resolves.toBe(false)
    expect(getSpy).not.toHaveBeenCalled()
  })
})

describe('setChatAiAllowed', () => {
  test('owner allow initializes but does not enable the administrator switch', async () => {
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(123456)
    updateSpy.mockResolvedValue({
      Attributes: {
        chatId: '-100',
        aiAllowed: true,
        agenticEnabled: false,
        version: 1,
        allowUpdatedAt: 123456,
        allowUpdatedBy: 7,
      },
    } as never)

    await expect(setChatAiAllowed(-100, true, 7)).resolves.toEqual({
      configuration: {
        chatId: '-100',
        aiAllowed: true,
        agenticEnabled: false,
        version: 1,
        allowUpdatedAt: 123456,
        allowUpdatedBy: 7,
      },
    })
    dateNowSpy.mockRestore()

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: 'chat-configuration',
        Key: { chatId: '-100' },
        UpdateExpression: expect.stringContaining(
          'agenticEnabled = if_not_exists(agenticEnabled, :disabled)',
        ),
        ReturnValues: 'ALL_NEW',
      }),
    )
  })

  test('owner disallow also turns agentic mode off', async () => {
    updateSpy.mockResolvedValue({
      Attributes: {
        chatId: '123',
        aiAllowed: false,
        agenticEnabled: false,
        version: 3,
      },
    } as never)

    await setChatAiAllowed(123, false, 7)

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        UpdateExpression: expect.stringContaining('agenticEnabled = :disabled'),
      }),
    )
    await expect(isAgenticChatEnabled(123)).resolves.toBe(false)
    expect(getSpy).not.toHaveBeenCalled()
  })

  test('does not expose DynamoDB write errors', async () => {
    updateSpy.mockRejectedValue(new Error('role arn and table details'))

    await expect(setChatAiAllowed(123, true, 7)).resolves.toEqual({
      error: 'Could not update chat configuration; please try again',
    })
  })
})

describe('toggleAgenticChat', () => {
  test('rejects a chat outside the owner allowlist without writing', async () => {
    getSpy.mockResolvedValue({
      Item: {
        chatId: '123',
        aiAllowed: false,
        agenticEnabled: false,
        version: 1,
      },
    } as never)

    await expect(toggleAgenticChat(123, 7)).resolves.toEqual({
      enabled: false,
      error: 'This chat is not AI-allowed by the bot owner',
    })
    expect(updateSpy).not.toHaveBeenCalled()
  })

  test('toggles only the administrator flag with optimistic locking', async () => {
    getSpy.mockResolvedValue({
      Item: {
        chatId: '123',
        aiAllowed: true,
        agenticEnabled: false,
        version: 4,
      },
    } as never)

    await expect(toggleAgenticChat(123, 7)).resolves.toEqual({ enabled: true })

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        Key: { chatId: '123' },
        ConditionExpression:
          'aiAllowed = :allowed AND (attribute_not_exists(#version) OR #version = :expectedVersion)',
        ExpressionAttributeValues: expect.objectContaining({
          ':allowed': true,
          ':enabled': true,
          ':expectedVersion': 4,
          ':nextVersion': 5,
          ':updatedBy': 7,
        }),
      }),
    )
    await expect(isAgenticChatEnabled(123)).resolves.toBe(true)
    expect(getSpy).toHaveBeenCalledTimes(1)
  })

  test('retries a concurrent configuration update', async () => {
    getSpy
      .mockResolvedValueOnce({
        Item: {
          chatId: '123',
          aiAllowed: true,
          agenticEnabled: false,
          version: 1,
        },
      } as never)
      .mockResolvedValueOnce({
        Item: {
          chatId: '123',
          aiAllowed: true,
          agenticEnabled: true,
          version: 2,
        },
      } as never)
    updateSpy
      .mockRejectedValueOnce(
        Object.assign(new Error('conflict'), {
          name: 'ConditionalCheckFailedException',
        }),
      )
      .mockResolvedValueOnce({} as never)

    await expect(toggleAgenticChat(123, 7)).resolves.toEqual({
      enabled: false,
    })
    expect(getSpy).toHaveBeenCalledTimes(2)
    expect(updateSpy).toHaveBeenCalledTimes(2)
  })

  test('does not expose DynamoDB write errors', async () => {
    getSpy.mockResolvedValue({
      Item: {
        chatId: '123',
        aiAllowed: true,
        agenticEnabled: false,
        version: 1,
      },
    } as never)
    updateSpy.mockRejectedValue(new Error('dynamo down'))

    await expect(toggleAgenticChat(123)).resolves.toEqual({
      enabled: false,
      error: 'Could not update chat configuration; please try again',
    })
  })
})

describe('setChatConfigurationFlags', () => {
  test('sets explicit flags and records both audit timestamps', async () => {
    const dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(123456)
    getSpy.mockResolvedValue({
      Item: {
        chatId: '123',
        aiAllowed: false,
        agenticEnabled: false,
        version: 2,
      },
    } as never)
    updateSpy.mockResolvedValue({
      Attributes: {
        chatId: '123',
        aiAllowed: true,
        agenticEnabled: true,
        version: 3,
        allowUpdatedAt: 123456,
        allowUpdatedBy: 7,
        toggledAt: 123456,
        toggledBy: 7,
      },
    } as never)

    await expect(
      setChatConfigurationFlags(
        123,
        { aiAllowed: true, agenticEnabled: true },
        7,
        2,
      ),
    ).resolves.toEqual({
      configuration: expect.objectContaining({
        chatId: '123',
        aiAllowed: true,
        agenticEnabled: true,
        version: 3,
      }),
    })
    dateNowSpy.mockRestore()

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        ConditionExpression:
          'attribute_not_exists(#version) OR #version = :expectedVersion',
        ExpressionAttributeValues: expect.objectContaining({
          ':aiAllowed': true,
          ':agenticEnabled': true,
          ':expectedVersion': 2,
          ':nextVersion': 3,
          ':updatedBy': 7,
        }),
        ReturnValues: 'ALL_NEW',
      }),
    )
  })

  test('disallowing AI also disables the agentic flag', async () => {
    getSpy.mockResolvedValue({
      Item: {
        chatId: '123',
        aiAllowed: true,
        agenticEnabled: true,
        version: 4,
      },
    } as never)
    updateSpy.mockResolvedValue({
      Attributes: {
        chatId: '123',
        aiAllowed: false,
        agenticEnabled: false,
        version: 5,
      },
    } as never)

    await setChatConfigurationFlags(123, { aiAllowed: false }, 7, 4)

    expect(updateSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        ExpressionAttributeValues: expect.objectContaining({
          ':aiAllowed': false,
          ':agenticEnabled': false,
        }),
      }),
    )
  })

  test('rejects stale UI writes before updating DynamoDB', async () => {
    getSpy.mockResolvedValue({
      Item: {
        chatId: '123',
        aiAllowed: true,
        agenticEnabled: false,
        version: 5,
      },
    } as never)

    await expect(
      setChatConfigurationFlags(123, { agenticEnabled: true }, 7, 4),
    ).resolves.toEqual({
      error: 'Chat configuration changed; refresh and try again',
      conflict: true,
    })
    expect(updateSpy).not.toHaveBeenCalled()
  })

  test('does not enable agentic mode outside the owner allowlist', async () => {
    getSpy.mockResolvedValue({
      Item: {
        chatId: '123',
        aiAllowed: false,
        agenticEnabled: false,
        version: 1,
      },
    } as never)

    await expect(
      setChatConfigurationFlags(123, { agenticEnabled: true }, 7, 1),
    ).resolves.toEqual({
      error: 'Allow AI access before enabling the agentic bot',
    })
    expect(updateSpy).not.toHaveBeenCalled()
  })
})
