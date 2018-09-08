import * as uuidv4 from 'uuid/v4'
import { dynamoPutItem } from '../../../utils'

export const saveEvent = async (userInfo: any, chat_id: string, date: number, XRaySegment: any) => {
  const event = {
    id: uuidv4(),
    date: new Date(date).toISOString(),
    chatId: String(chat_id),
    userId: String(userInfo.id),
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
