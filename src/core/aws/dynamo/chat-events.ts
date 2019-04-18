import { random } from 'lodash'

import { dynamoPutItem } from '../../../utils'
import { IUserInfo } from '.'

export const saveEvent =
  async (userInfo: IUserInfo, chat_id: string, date: number, command: string, XRaySegment: any) => {
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

    if (!process.env.IS_LOCAL) {
      (params as any).XRaySegment = XRaySegment
    }

    return dynamoPutItem(params)
  }
