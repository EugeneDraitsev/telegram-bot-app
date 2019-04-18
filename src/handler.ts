import * as AWSXRay from 'aws-xray-sdk'
import 'source-map-support/register' // eslint-disable-line import/no-extraneous-dependencies

import { processQuery, findCommand } from './commands'
import { saveEvent, updateStatistics } from './core'

export let segment: any // eslint-disable-line import/no-mutable-exports
export const segments: any = {
  commandSegment: null,
  statsSegment: null,
  querySegment: null,
}

AWSXRay.enableManualMode()

const updateMessageStat = async (user_info: any, chat_id: any, command: string, date: number) => {
  try {
    segments.statsSegment = new AWSXRay.Segment('update-stats', segment.trace_id, segment.id)
    await Promise.all([
      updateStatistics(user_info, chat_id, segments.statsSegment),
      saveEvent(user_info, chat_id, date, command, segments.statsSegment),
    ])
  } catch (e) {
    console.log(e) // eslint-disable-line no-console
    segments.statsSegment.addError(e)
  } finally {
    segments.statsSegment.close()
  }
}

const processRequest = async (req: any) => {
  try {
    if (!req || !req.message || !req.message.chat || !req.message.text) {
      return 'not a telegram message'
    }

    const { message: { date, message_id, from, chat, text, reply_to_message } } = req
    const command = findCommand(text)

    segments.commandSegment = new AWSXRay.Segment('process-query', segment.trace_id, segment.id)

    await Promise.all([
      processQuery(text, message_id, chat.id, reply_to_message || {}),
      updateMessageStat(from, chat.id, command!, date),
    ])

    return 'done'
  } catch (e) {
    console.log(e) // eslint-disable-line no-console
    segments.commandSegment.addError(e)
    return 'done with errors'
  } finally {
    if (segments.commandSegment) {
      segments.commandSegment.close()
    }
  }
}

export default async (event: any) => {
  const body = event.body ? JSON.parse(event.body) : event
  segment = new AWSXRay.Segment('telegram-bot')

  try {
    const message = await processRequest(body)
    return {
      body: JSON.stringify({ body, message }),
      statusCode: 200,
    }
  } catch (e) {
    console.log(e) // eslint-disable-line no-console
    segment.addError(e)
    return {
      body: JSON.stringify({ body, message: 'something going wrong :c' }),
      statusCode: 200,
    }
  } finally {
    const { statsSegment, commandSegment } = segments
    if ((statsSegment && statsSegment.fault) || (commandSegment && commandSegment.fault)) {
      segment.addFaultFlag()
      segment.addMetadata('body', body)
    }
    if (segment && segment.close) {
      segment.close()
    }
  }
}
