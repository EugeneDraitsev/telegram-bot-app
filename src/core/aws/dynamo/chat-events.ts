import { random } from 'lodash'

import { dynamoPutItem, invokeLambda } from '../../../utils'
import { IUserInfo } from '.'

const getBroadcastParams = (chatId: number) => ({
  FunctionName: 'telegram-websockets-prod-broadcastStats',
  Payload: JSON.stringify({
    queryStringParameters: {
      chatId,
      endpoint: '97cq41uoj7.execute-api.eu-central-1.amazonaws.com/prod',
    },
  }),
})

export const saveEvent = async (userInfo: IUserInfo, chat_id: number, date: number, command: string) => {
  const event = {
    userInfo,
    // trying to avoid lost messages
    date: date * 1000 + random(-500, 500),
    chatId: String(chat_id),
    command,
  }

  const params = {
    TableName: 'chat-events',
    Item: event,
  }

  return Promise.all([dynamoPutItem(params), invokeLambda(getBroadcastParams(chat_id))])
}
