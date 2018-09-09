import { random } from 'lodash'

import { dynamoPutItem } from '../../../utils'
import { getUserName, IUserInfo } from './'

export const saveEvent = async (userInfo: IUserInfo, chat_id: string, date: number, XRaySegment: any) => {
  const event = {
    // trying to avoid lost messages
    date: date * 1000 + random(-500, 500),
    chatId: String(chat_id),
    userId: String(userInfo.id),
    name: getUserName(userInfo),
  }

  const params = {
    TableName: 'chat-events',
    Item: event,
  }

  if (!process.env.IS_LOCAL) {
    (params as any).XRaySegment = XRaySegment
  }

  return dynamoPutItem(params)
}
