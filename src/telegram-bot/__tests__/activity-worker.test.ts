import type { Chat, Message, User } from 'grammy/types'

import activityWorker from '../activity-worker'

const updateStatisticsMock = jest.fn()
const saveEventMock = jest.fn()
const saveMessageMock = jest.fn()
const loggerErrorMock = jest.fn()
const loggerWarnMock = jest.fn()

jest.mock('@tg-bot/common', () => ({
  isAiEnabledChat: (chatId: number | string | undefined) => chatId === 123,
  logger: {
    info: jest.fn(),
    error: (...args: unknown[]) => loggerErrorMock(...args),
    warn: (...args: unknown[]) => loggerWarnMock(...args),
  },
  saveEvent: (...args: unknown[]) => saveEventMock(...args),
  saveMessage: (...args: unknown[]) => saveMessageMock(...args),
  updateStatistics: (...args: unknown[]) => updateStatisticsMock(...args),
}))

describe('activity worker', () => {
  beforeEach(() => {
    updateStatisticsMock.mockReset().mockResolvedValue(undefined)
    saveEventMock.mockReset().mockResolvedValue(undefined)
    saveMessageMock.mockReset().mockResolvedValue(undefined)
    loggerErrorMock.mockReset()
    loggerWarnMock.mockReset()
  })

  test('tracks statistics, events and AI chat history outside ingress', async () => {
    const user = { id: 7, username: 'alice' } as User
    const chat = { id: 123, type: 'group', title: 'Test chat' } as Chat
    const message = {
      message_id: 10,
      date: 123456,
      from: user,
      chat,
      text: 'hello',
    } as Message

    await activityWorker({ message, command: '/x' }, {} as never, jest.fn())

    expect(updateStatisticsMock).toHaveBeenCalledWith(user, chat)
    expect(saveEventMock).toHaveBeenCalledWith(user, 123, '/x', 123456)
    expect(saveMessageMock).toHaveBeenCalledWith(message, 123)
  })

  test('returns early for invalid payload', async () => {
    const result = await activityWorker({}, {} as never, jest.fn())

    expect(result).toBeUndefined()
    expect(loggerWarnMock).toHaveBeenCalledWith(
      { hasMessage: false, chatId: undefined },
      'activity.invalid_payload',
    )
    expect(updateStatisticsMock).not.toHaveBeenCalled()
    expect(saveEventMock).not.toHaveBeenCalled()
    expect(saveMessageMock).not.toHaveBeenCalled()
  })

  test('does not save AI chat history for non-AI chats', async () => {
    const user = { id: 7, username: 'alice' } as User
    const chat = { id: 999, type: 'group', title: 'Test chat' } as Chat
    const message = {
      message_id: 10,
      date: 123456,
      from: user,
      chat,
      text: 'hello',
    } as Message

    await activityWorker({ message, command: '' }, {} as never, jest.fn())

    expect(updateStatisticsMock).toHaveBeenCalledWith(user, chat)
    expect(saveEventMock).toHaveBeenCalledWith(user, 999, '', 123456)
    expect(saveMessageMock).not.toHaveBeenCalled()
  })

  test('logs rejected activity tasks', async () => {
    const error = new Error('dynamo failed')
    updateStatisticsMock.mockRejectedValueOnce(error)

    const user = { id: 7, username: 'alice' } as User
    const chat = { id: 999, type: 'group', title: 'Test chat' } as Chat
    const message = {
      message_id: 10,
      date: 123456,
      from: user,
      chat,
      text: 'hello',
    } as Message

    await activityWorker({ message, command: '' }, {} as never, jest.fn())

    expect(loggerErrorMock).toHaveBeenCalledWith(
      { err: error },
      'activity.track_failed',
    )
  })
})
