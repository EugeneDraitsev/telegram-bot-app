import '../load-config.js'

import { Handler } from 'aws-lambda'
import { get, noop } from 'lodash'

// tslint:disable-next-line
// const AWSXRay = require('aws-xray-sdk')

import { processQuery } from './commands/'
import { closeConnection, openConnection, updateStatistic } from './core'

function updateMessageStat(user_info: any, chat_id: any) {
  return openConnection().then(() => updateStatistic(user_info, chat_id))
}

// function processRequest(req: any) {
//   return new Promise((resolve, reject) => {
//     const segment = new AWSXRay.Segment('telegram-bot')
//     const namespace = AWSXRay.getNamespace()
//     namespace.run(() => {
//       AWSXRay.setSegment(segment)
//       AWSXRay.captureAsyncFunc('processRequest', (subsegment: any) => {
//         if (!req || !req.message || !req.message.chat || !req.message.text) {
//           return Promise.resolve('not a telegram message')
//         }
//
//         const { message: { message_id, from, chat, text, reply_to_message } } = req
//         const replyText = get(reply_to_message, 'text')
//
//         return Promise.all([
//           processQuery(text, message_id, chat.id, replyText).catch(noop),
//           updateMessageStat(from, chat.id).catch(noop),
//         ])
//           .then(closeConnection)
//           .then((res: any) => resolve(res))
//           .catch(reject)
//           .finally(() => {
//             subsegment.close()
//             segment.close()
//           })
//       })
//     })
//   })
// }

function processRequest(req: any) {
  if (!req || !req.message || !req.message.chat || !req.message.text) {
    return Promise.resolve('not a telegram message')
  }

  const { message: { message_id, from, chat, text, reply_to_message } } = req
  const replyText = get(reply_to_message, 'text')

  return Promise.all([
    processQuery(text, message_id, chat.id, replyText).catch(noop),
    updateMessageStat(from, chat.id).catch(noop),
  ])
    .then(closeConnection)
}


export const handler: Handler = async (event: any) => {
  const body = event.body ? JSON.parse(event.body) : event
  console.log(body) // tslint:disable-line:no-console

  try {
    const message = await processRequest(body)
    return {
      body: JSON.stringify({ body, message }),
      statusCode: 200,
    }

  } catch (e) {
    return {
      body: JSON.stringify({ body, message: 'something going wrong :c' }),
      statusCode: 200,
    }
  }
}
