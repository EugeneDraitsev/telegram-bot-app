import * as client from '../client'
import {
  chatMemoryKey,
  getChatMemory,
  getGlobalMemory,
  MEMORY_GLOBAL_KEY,
  MEMORY_MAX_LENGTH,
  MEMORY_TTL_SECONDS,
  setChatMemory,
  setGlobalMemory,
} from '../memory'

const mockGet = jest.fn()
const mockSet = jest.fn()

jest.spyOn(client, 'getRedisClient').mockReturnValue({
  get: mockGet,
  set: mockSet,
} as unknown as ReturnType<typeof client.getRedisClient>)

beforeEach(() => {
  mockGet.mockReset()
  mockSet.mockReset()
})

describe('chatMemoryKey', () => {
  test('should build correct key with number chatId', () => {
    expect(chatMemoryKey(12345)).toBe('memory:chat:12345')
  })

  test('should build correct key with string chatId', () => {
    expect(chatMemoryKey('abc')).toBe('memory:chat:abc')
  })
})

describe('getChatMemory', () => {
  test('should return stored memory', async () => {
    mockGet.mockResolvedValue('# Notes\n- user likes cats')
    const result = await getChatMemory(123)
    expect(result).toBe('# Notes\n- user likes cats')
    expect(mockGet).toHaveBeenCalledWith('memory:chat:123')
  })

  test('should return empty string when no memory exists', async () => {
    mockGet.mockResolvedValue(null)
    expect(await getChatMemory(123)).toBe('')
  })

  test('should return empty string on error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockGet.mockRejectedValue(new Error('redis down'))
    expect(await getChatMemory(123)).toBe('')
    consoleSpy.mockRestore()
  })
})

describe('setChatMemory', () => {
  test('should save content with correct TTL', async () => {
    mockSet.mockResolvedValue('OK')
    const result = await setChatMemory(456, '# Memory\n- important fact')
    expect(result).toBe(true)
    expect(mockSet).toHaveBeenCalledWith(
      'memory:chat:456',
      '# Memory\n- important fact',
      { ex: MEMORY_TTL_SECONDS },
    )
  })

  test('should reject empty content', async () => {
    expect(await setChatMemory(456, '')).toBe(false)
    expect(await setChatMemory(456, '   ')).toBe(false)
    expect(mockSet).not.toHaveBeenCalled()
  })

  test('should reject content exceeding max length', async () => {
    const hugeContent = 'x'.repeat(MEMORY_MAX_LENGTH + 1)
    expect(await setChatMemory(456, hugeContent)).toBe(false)
    expect(mockSet).not.toHaveBeenCalled()
  })

  test('should trim whitespace before saving', async () => {
    mockSet.mockResolvedValue('OK')
    await setChatMemory(456, '  hello  ')
    expect(mockSet).toHaveBeenCalledWith('memory:chat:456', 'hello', {
      ex: MEMORY_TTL_SECONDS,
    })
  })

  test('should return false on redis error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockSet.mockRejectedValue(new Error('redis down'))
    expect(await setChatMemory(456, 'content')).toBe(false)
    consoleSpy.mockRestore()
  })
})

describe('getGlobalMemory', () => {
  test('should return stored global memory', async () => {
    mockGet.mockResolvedValue('global notes')
    const result = await getGlobalMemory()
    expect(result).toBe('global notes')
    expect(mockGet).toHaveBeenCalledWith(MEMORY_GLOBAL_KEY)
  })

  test('should return empty string when no memory exists', async () => {
    mockGet.mockResolvedValue(null)
    expect(await getGlobalMemory()).toBe('')
  })

  test('should return empty string on error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockGet.mockRejectedValue(new Error('redis down'))
    expect(await getGlobalMemory()).toBe('')
    consoleSpy.mockRestore()
  })
})

describe('setGlobalMemory', () => {
  test('should save content with correct TTL', async () => {
    mockSet.mockResolvedValue('OK')
    const result = await setGlobalMemory('global knowledge')
    expect(result).toBe(true)
    expect(mockSet).toHaveBeenCalledWith(
      MEMORY_GLOBAL_KEY,
      'global knowledge',
      { ex: MEMORY_TTL_SECONDS },
    )
  })

  test('should reject empty content', async () => {
    expect(await setGlobalMemory('')).toBe(false)
    expect(await setGlobalMemory('   ')).toBe(false)
    expect(mockSet).not.toHaveBeenCalled()
  })

  test('should reject content exceeding max length', async () => {
    const hugeContent = 'x'.repeat(MEMORY_MAX_LENGTH + 1)
    expect(await setGlobalMemory(hugeContent)).toBe(false)
    expect(mockSet).not.toHaveBeenCalled()
  })

  test('should trim whitespace before saving', async () => {
    mockSet.mockResolvedValue('OK')
    await setGlobalMemory('  trimmed  ')
    expect(mockSet).toHaveBeenCalledWith(MEMORY_GLOBAL_KEY, 'trimmed', {
      ex: MEMORY_TTL_SECONDS,
    })
  })

  test('should return false on redis error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    mockSet.mockRejectedValue(new Error('redis down'))
    expect(await setGlobalMemory('content')).toBe(false)
    consoleSpy.mockRestore()
  })
})

describe('no redis client', () => {
  beforeEach(() => {
    jest.spyOn(client, 'getRedisClient').mockReturnValue(null)
  })

  test('getChatMemory returns empty string', async () => {
    expect(await getChatMemory(1)).toBe('')
  })

  test('setChatMemory returns false', async () => {
    expect(await setChatMemory(1, 'content')).toBe(false)
  })

  test('getGlobalMemory returns empty string', async () => {
    expect(await getGlobalMemory()).toBe('')
  })

  test('setGlobalMemory returns false', async () => {
    expect(await setGlobalMemory('content')).toBe(false)
  })
})
