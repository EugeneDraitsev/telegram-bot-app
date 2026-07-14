import type { Chat, Message, User } from 'grammy/types'

import * as common from '@tg-bot/common'
import activityWorker from '../activity-worker'

const updateStatisticsMock = jest.spyOn(common, 'updateStatistics')
const saveEventMock = jest.spyOn(common, 'saveEvent')
const saveMessageMock = jest.spyOn(common, 'saveMessage')
const isAiEnabledChatMock = jest.spyOn(common, 'isAiEnabledChat')
const loggerErrorMock = jest.spyOn(common.logger, 'error')
const loggerWarnMock = jest.spyOn(common.logger, 'warn')

describe('activity worker', () => {
  beforeEach(() => {
    updateStatisticsMock.mockReset().mockResolvedValue(undefined)
    saveEventMock.mockReset().mockResolvedValue(undefined)
    saveMessageMock.mockReset().mockResolvedValue(undefined)
    isAiEnabledChatMock
      .mockReset()
      .mockImplementation((chatId) => chatId === 123)
    loggerErrorMock.mockReset().mockImplementation(() => {})
    loggerWarnMock.mockReset().mockImplementation(() => {})
  })

  afterAll(() => {
    updateStatisticsMock.mockRestore()
    saveEventMock.mockRestore()
    saveMessageMock.mockRestore()
    isAiEnabledChatMock.mockRestore()
    loggerErrorMock.mockRestore()
    loggerWarnMock.mockRestore()
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
    expect(saveEventMock).toHaveBeenCalledWith(user, 123, '/x', 123456, 10)
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
    expect(saveEventMock).toHaveBeenCalledWith(user, 999, '', 123456, 10)
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
