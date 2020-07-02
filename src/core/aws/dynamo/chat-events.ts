import { Lambda } from 'aws-sdk'
import { random } from 'lodash'

import { dynamoPutItem, invokeLambda } from '../../../utils'
import { UserInfo } from '.'

const getBroadcastParams = (chatId: number): Lambda.Types.InvocationRequest => ({
  FunctionName: 'telegram-websockets-prod-broadcastStats',
  Payload: JSON.stringify({
    queryStringParameters: {
      chatId,
      endpoint: '97cq41uoj7.execute-api.eu-central-1.amazonaws.com/prod',
    },
  }),
})

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const saveEvent = async (
  userInfo?: UserInfo,
  chat_id?: number,
  date = Date.now(),
  command?: string,
) => {
  if (userInfo && chat_id) {
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

  return Promise.resolve()
}
