import * as client from '../client'
import {
  clearDynamicToolsCache,
  getDynamicToolsRawByScope,
  saveDynamicToolsRaw,
} from '../dynamic-tools'

const mockGet = jest.fn()
const mockSet = jest.fn()
const getRedisClientSpy = jest.spyOn(client, 'getRedisClient')

beforeEach(() => {
  clearDynamicToolsCache()
  mockGet.mockReset()
  mockSet.mockReset()
  getRedisClientSpy.mockReturnValue({
    get: mockGet,
    set: mockSet,
  } as unknown as ReturnType<typeof client.getRedisClient>)
})

afterAll(() => {
  getRedisClientSpy.mockRestore()
})

test('caches tools by scope in a warm Lambda instance', async () => {
  mockGet.mockResolvedValue([{ name: 'weather' }])

  await expect(getDynamicToolsRawByScope(123)).resolves.toEqual([
    { name: 'weather' },
  ])
  await expect(getDynamicToolsRawByScope(123)).resolves.toEqual([
    { name: 'weather' },
  ])

  expect(mockGet).toHaveBeenCalledTimes(1)
  expect(mockGet).toHaveBeenCalledWith('agent-dynamic-tools:123')
})

test('refreshes the local cache after saving tools', async () => {
  mockSet.mockResolvedValue('OK')
  const tools = [{ name: 'search' }]

  await expect(saveDynamicToolsRaw(tools, 123)).resolves.toBe(true)
  await expect(getDynamicToolsRawByScope(123)).resolves.toEqual(tools)

  expect(mockGet).not.toHaveBeenCalled()
})
