import type { SQSEvent } from 'aws-lambda'
import type { Chat, Message, User } from 'grammy/types'

import * as common from '@tg-bot/common'
import activityWorker from '../activity-worker'

const recordChatActivityMock = jest.spyOn(common, 'recordChatActivity')
const saveMessageMock = jest.spyOn(common, 'saveMessage')
const loggerErrorMock = jest.spyOn(common.logger, 'error')
const loggerWarnMock = jest.spyOn(common.logger, 'warn')
const lambdaContext = { awsRequestId: 'request-1' }

describe('activity worker', () => {
  beforeEach(() => {
    recordChatActivityMock.mockReset().mockResolvedValue({ recorded: true })
    saveMessageMock.mockReset().mockResolvedValue(undefined)
    loggerErrorMock.mockReset().mockImplementation(() => {})
    loggerWarnMock.mockReset().mockImplementation(() => {})
  })

  afterAll(() => {
    recordChatActivityMock.mockRestore()
    saveMessageMock.mockRestore()
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

    await activityWorker({ message, command: '/x' }, lambdaContext)

    expect(recordChatActivityMock).toHaveBeenCalledWith({
      userInfo: user,
      chat,
      command: '/x',
      date: 123456,
      messageId: 10,
    })
    expect(saveMessageMock).toHaveBeenCalledWith(message, 123)
  })

  test('returns early for invalid payload', async () => {
    const result = await activityWorker({}, lambdaContext)

    expect(result).toBeUndefined()
    expect(loggerWarnMock).toHaveBeenCalledWith(
      { hasMessage: false, chatId: undefined },
      'activity.invalid_payload',
    )
    expect(recordChatActivityMock).not.toHaveBeenCalled()
    expect(saveMessageMock).not.toHaveBeenCalled()
  })

  test('persists outgoing media without counting bot activity', async () => {
    const message: Message = {
      message_id: 11,
      date: 123457,
      chat: { id: 123, type: 'group', title: 'Test chat' },
      from: { id: 99, is_bot: true, first_name: 'Bot' },
      caption: '24h statistics',
      photo: [
        {
          file_id: 'stats-photo',
          file_unique_id: 'stats',
          width: 100,
          height: 100,
        },
      ],
    }

    await activityWorker({ message, historyOnly: true }, lambdaContext)

    expect(saveMessageMock).toHaveBeenCalledWith(message, 123)
    expect(recordChatActivityMock).not.toHaveBeenCalled()
  })

  test('retries a failed outgoing history write without resending Telegram media', async () => {
    saveMessageMock.mockRejectedValueOnce(new Error('Redis unavailable'))
    const event = {
      Records: [
        {
          messageId: 'outgoing-1',
          eventSource: 'aws:sqs',
          body: JSON.stringify({
            message: { message_id: 11, chat: { id: 123 }, caption: 'stats' },
            historyOnly: true,
          }),
        },
      ],
    } as SQSEvent

    await expect(activityWorker(event, lambdaContext)).resolves.toEqual({
      batchItemFailures: [{ itemIdentifier: 'outgoing-1' }],
    })
    await expect(activityWorker(event, lambdaContext)).resolves.toEqual({
      batchItemFailures: [],
    })
    expect(recordChatActivityMock).not.toHaveBeenCalled()
    expect(saveMessageMock).toHaveBeenCalledTimes(2)
  })

  test('delegates chat-history eligibility to saveMessage', async () => {
    const user = { id: 7, username: 'alice' } as User
    const chat = { id: 999, type: 'group', title: 'Test chat' } as Chat
    const message = {
      message_id: 10,
      date: 123456,
      from: user,
      chat,
      text: 'hello',
    } as Message

    await activityWorker({ message, command: '' }, lambdaContext)

    expect(recordChatActivityMock).toHaveBeenCalledWith({
      userInfo: user,
      chat,
      command: '',
      date: 123456,
      messageId: 10,
    })
    expect(saveMessageMock).toHaveBeenCalledWith(message, 999)
  })

  test('logs rejected activity tasks', async () => {
    const error = new Error('dynamo failed')
    recordChatActivityMock.mockRejectedValueOnce(error)

    const user = { id: 7, username: 'alice' } as User
    const chat = { id: 999, type: 'group', title: 'Test chat' } as Chat
    const message = {
      message_id: 10,
      date: 123456,
      from: user,
      chat,
      text: 'hello',
    } as Message

    await expect(
      activityWorker({ message, command: '' }, lambdaContext),
    ).rejects.toThrow('One or more activity tasks failed')

    expect(loggerErrorMock).toHaveBeenCalledWith(
      { err: error },
      'activity.track_failed',
    )
  })
})
