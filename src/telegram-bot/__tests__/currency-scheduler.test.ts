import { sendScheduledCurrencyMessages } from '../currency-scheduler'

describe('currency scheduler', () => {
  test('sends scheduled currency updates through rich currency delivery', async () => {
    const api = { sendMessage: jest.fn() }
    const messages = {
      sections: [],
      richMessage: { html: '<b>Rates</b>' },
      text: '<b>Rates:</b>',
    }
    const getMessages = jest.fn().mockResolvedValue(messages)
    const sendMessages = jest.fn().mockResolvedValue({ message_id: 1 })

    await sendScheduledCurrencyMessages({
      api,
      chatIds: ['chat-1'],
      getMessages,
      sendMessages,
    })

    expect(getMessages).toHaveBeenCalledTimes(1)
    expect(sendMessages).toHaveBeenCalledWith({
      api,
      chatId: 'chat-1',
      messages,
    })
    expect(api.sendMessage).not.toHaveBeenCalled()
  })
})
