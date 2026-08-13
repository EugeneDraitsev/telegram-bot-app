import * as client from '../client'
import {
  chatMemoryKey,
  clearMemoryCache,
  getChatMemory,
  getGlobalMemory,
  MEMORY_GLOBAL_KEY,
  MEMORY_MAX_LENGTH,
  setChatMemory,
} from '../memory'

const mockGet = jest.fn()
const mockSet = jest.fn()

jest.spyOn(client, 'getRedisClient').mockReturnValue({
  get: mockGet,
  set: mockSet,
} as unknown as ReturnType<typeof client.getRedisClient>)

beforeEach(() => {
  clearMemoryCache()
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

  test('caches chat memory inside a warm Lambda instance', async () => {
    mockGet.mockResolvedValue('cached notes')

    await expect(getChatMemory(123)).resolves.toBe('cached notes')
    await expect(getChatMemory(123)).resolves.toBe('cached notes')

    expect(mockGet).toHaveBeenCalledTimes(1)
  })
})

describe('setChatMemory', () => {
  test('should save content without TTL', async () => {
    mockSet.mockResolvedValue('OK')
    const result = await setChatMemory(456, '# Memory\n- important fact')
    expect(result).toBe(true)
    expect(mockSet).toHaveBeenCalledWith(
      'memory:chat:456',
      '# Memory\n- important fact',
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
    expect(mockSet).toHaveBeenCalledWith('memory:chat:456', 'hello')
  })

  test('updates the local cache after saving', async () => {
    mockSet.mockResolvedValue('OK')

    await expect(setChatMemory(456, 'new notes')).resolves.toBe(true)
    await expect(getChatMemory(456)).resolves.toBe('new notes')

    expect(mockGet).not.toHaveBeenCalled()
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

  test('caches global memory inside a warm Lambda instance', async () => {
    mockGet.mockResolvedValue('global notes')

    await getGlobalMemory()
    await getGlobalMemory()

    expect(mockGet).toHaveBeenCalledTimes(1)
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
})
