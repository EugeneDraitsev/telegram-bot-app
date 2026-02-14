import * as aiUtils from '../../utils/ai.utils'
import {
  getAgenticChatIds,
  isAgenticChatEnabled,
  toggleAgenticChat,
} from '../agentic-chats'
import * as client from '../client'

const mockGet = jest.fn()
const mockSet = jest.fn()

jest.spyOn(client, 'getRedisClient').mockReturnValue({
  get: mockGet,
  set: mockSet,
} as unknown as ReturnType<typeof client.getRedisClient>)

const mockIsAiEnabledChat = jest.spyOn(aiUtils, 'isAiEnabledChat')

beforeEach(() => {
  mockGet.mockReset()
  mockSet.mockReset()
  mockIsAiEnabledChat.mockReset()
})

describe('getAgenticChatIds', () => {
  test('should return stored chat ids', async () => {
    mockGet.mockResolvedValue(['123', '456'])
    const result = await getAgenticChatIds()
    expect(result).toEqual(['123', '456'])
  })

  test('should return empty array when no data', async () => {
    mockGet.mockResolvedValue(null)
    expect(await getAgenticChatIds()).toEqual([])
  })

  test('should return empty array on error', async () => {
    mockGet.mockRejectedValue(new Error('redis down'))
    expect(await getAgenticChatIds()).toEqual([])
  })
})

describe('isAgenticChatEnabled', () => {
  test('should return false when chatId is undefined', async () => {
    mockIsAiEnabledChat.mockReturnValue(true)
    mockGet.mockResolvedValue(['123'])
    expect(await isAgenticChatEnabled(undefined)).toBe(false)
  })

  test('should return false when chat is NOT in OPENAI_CHAT_IDS', async () => {
    mockIsAiEnabledChat.mockReturnValue(false)
    mockGet.mockResolvedValue(['999']) // Chat IS in Redis
    expect(await isAgenticChatEnabled(999)).toBe(false)
    // Should not even check Redis if AI is not enabled
    expect(mockGet).not.toHaveBeenCalled()
  })

  test('should return false when chat IS in OPENAI_CHAT_IDS but NOT in Redis', async () => {
    mockIsAiEnabledChat.mockReturnValue(true)
    mockGet.mockResolvedValue(['456', '789']) // Different chats in Redis
    expect(await isAgenticChatEnabled(123)).toBe(false)
  })

  test('should return true ONLY when chat is in BOTH OPENAI_CHAT_IDS AND Redis', async () => {
    mockIsAiEnabledChat.mockReturnValue(true)
    mockGet.mockResolvedValue(['123', '456'])
    expect(await isAgenticChatEnabled(123)).toBe(true)
  })

  test('should work with string chatId', async () => {
    mockIsAiEnabledChat.mockReturnValue(true)
    mockGet.mockResolvedValue(['123'])
    expect(await isAgenticChatEnabled('123')).toBe(true)
  })

  test('should work with negative chatId (group chats)', async () => {
    mockIsAiEnabledChat.mockReturnValue(true)
    mockGet.mockResolvedValue(['-1001234567890'])
    expect(await isAgenticChatEnabled(-1001234567890)).toBe(true)
  })
})

describe('toggleAgenticChat', () => {
  test('should return error when chat is NOT in OPENAI_CHAT_IDS', async () => {
    mockIsAiEnabledChat.mockReturnValue(false)
    mockGet.mockResolvedValue([])

    const result = await toggleAgenticChat(999)

    expect(result).toEqual({
      enabled: false,
      error: 'AI not allowed for this chat',
    })
    // Should not modify Redis
    expect(mockSet).not.toHaveBeenCalled()
  })

  test('should add chat to Redis when in OPENAI_CHAT_IDS and not yet enabled', async () => {
    mockIsAiEnabledChat.mockReturnValue(true)
    mockGet.mockResolvedValue(['456']) // Other chat already enabled
    mockSet.mockResolvedValue('OK')

    const result = await toggleAgenticChat(123)

    expect(result).toEqual({ enabled: true })
    expect(mockSet).toHaveBeenCalledWith('bot-config:agentic-chats', [
      '456',
      '123',
    ])
  })

  test('should not dedupe other chats when enabling', async () => {
    mockIsAiEnabledChat.mockReturnValue(true)
    mockGet.mockResolvedValue(['123', '123', '456'])
    mockSet.mockResolvedValue('OK')

    const result = await toggleAgenticChat(999)

    expect(result).toEqual({ enabled: true })
    expect(mockSet).toHaveBeenCalledWith('bot-config:agentic-chats', [
      '123',
      '123',
      '456',
      '999',
    ])
  })

  test('should remove chat from Redis when disabling', async () => {
    mockIsAiEnabledChat.mockReturnValue(true)
    mockGet.mockResolvedValue(['123', '456'])
    mockSet.mockResolvedValue('OK')

    const result = await toggleAgenticChat(123)

    expect(result).toEqual({ enabled: false })
    expect(mockSet).toHaveBeenCalledWith('bot-config:agentic-chats', ['456'])
  })

  test('should handle Redis errors on set', async () => {
    mockIsAiEnabledChat.mockReturnValue(true)
    mockGet.mockResolvedValue([]) // Empty list - will try to add
    mockSet.mockRejectedValue(new Error('connection failed'))

    const result = await toggleAgenticChat(123)

    expect(result).toEqual({ enabled: false, error: 'connection failed' })
  })
})

describe('no redis client', () => {
  let originalMock: jest.SpyInstance

  beforeAll(() => {
    originalMock = jest.spyOn(client, 'getRedisClient').mockReturnValue(null)
  })

  afterAll(() => {
    originalMock.mockRestore()
    jest.spyOn(client, 'getRedisClient').mockReturnValue({
      get: mockGet,
      set: mockSet,
    } as unknown as ReturnType<typeof client.getRedisClient>)
  })

  test('getAgenticChatIds returns empty array', async () => {
    expect(await getAgenticChatIds()).toEqual([])
  })

  test('isAgenticChatEnabled returns false', async () => {
    mockIsAiEnabledChat.mockReturnValue(true)
    expect(await isAgenticChatEnabled(123)).toBe(false)
  })

  test('toggleAgenticChat returns error', async () => {
    mockIsAiEnabledChat.mockReturnValue(true)
    const result = await toggleAgenticChat(123)
    expect(result).toEqual({ enabled: false, error: 'Redis not available' })
  })
})

describe('critical: OPENAI_CHAT_IDS + Redis combination required', () => {
  // These tests explicitly verify the AND condition

  test('chat ONLY in Redis (not in OPENAI_CHAT_IDS) → NOT enabled', async () => {
    mockIsAiEnabledChat.mockReturnValue(false) // Not in OPENAI_CHAT_IDS
    mockGet.mockResolvedValue(['123']) // But IS in Redis

    expect(await isAgenticChatEnabled(123)).toBe(false)
  })

  test('chat ONLY in OPENAI_CHAT_IDS (not in Redis) → NOT enabled', async () => {
    mockIsAiEnabledChat.mockReturnValue(true) // IS in OPENAI_CHAT_IDS
    mockGet.mockResolvedValue([]) // But NOT in Redis

    expect(await isAgenticChatEnabled(123)).toBe(false)
  })

  test('chat in BOTH OPENAI_CHAT_IDS AND Redis → enabled', async () => {
    mockIsAiEnabledChat.mockReturnValue(true) // IS in OPENAI_CHAT_IDS
    mockGet.mockResolvedValue(['123']) // AND in Redis

    expect(await isAgenticChatEnabled(123)).toBe(true)
  })

  test('toggle prevents enabling chat not in OPENAI_CHAT_IDS', async () => {
    mockIsAiEnabledChat.mockReturnValue(false)

    const result = await toggleAgenticChat(999)

    expect(result.error).toBe('AI not allowed for this chat')
    expect(mockSet).not.toHaveBeenCalled()
  })
})
