import '../load-config.js'

import { Callback, Context, Handler } from 'aws-lambda'
import { get, noop } from 'lodash'
import { processQuery } from './commands/'
import { closeConnection, openConnection, updateStatistic } from './core'

interface IResponse {
  statusCode: number
  body: string
}

function updateMessageStat(user_info: any, chat_id: any) {
  return openConnection().then(() => updateStatistic(user_info, chat_id))
}

function processRequest(req: any) {
  if (!req || !req.message || !req.message.chat || !req.message.text) {
    return Promise.resolve('not a telegram message')
  }

  const { message: { message_id, from, chat, text, reply_to_message } } = req
  const replyText = get(reply_to_message, 'text')

  return Promise.all([processQuery(text, message_id, chat.id, replyText).catch(noop),
    updateMessageStat(from, chat.id).catch(noop)])
    .then(closeConnection)
}

function sendResponse(message: any, input: string, callback: (obj: any, response: IResponse) => void) {
  const response = {
    body: JSON.stringify({ message, input }),
    statusCode: 200,
  }

  return callback(null, response)
}

export const handler: Handler = (event: any, context: Context, callback: Callback) => {
  const body = event.body ? JSON.parse(event.body) : event
  console.log(body) // tslint:disable-line:no-console

  return processRequest(body)
    .then(message => sendResponse(message, body, callback))
    .catch(() => sendResponse('something going wrong :c', body, callback))
}
