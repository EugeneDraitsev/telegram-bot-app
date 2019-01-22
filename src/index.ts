import { Handler } from 'aws-lambda'
import * as AWSXRay from 'aws-xray-sdk'

export let segment: any
export const segments: any = {
  commandSegment: null,
  statsSegment: null,
  querySegment: null,
}

AWSXRay.enableManualMode()

import { processQuery } from './commands/'
import { saveEvent, updateStatistics } from './core/'

const updateMessageStat = async (user_info: any, chat_id: any, date: number) => {
  try {
    segments.statsSegment = new AWSXRay.Segment('update-stats', segment.trace_id, segment.id)
    await Promise.all([
      updateStatistics(user_info, chat_id, segments.statsSegment),
      saveEvent(user_info, chat_id, date, segments.statsSegment),
    ])
  } catch (e) {
    console.log(e) // tslint:disable-line
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

    segments.commandSegment = new AWSXRay.Segment('process-query', segment.trace_id, segment.id)
    await Promise.all([
      processQuery(text, message_id, chat.id, reply_to_message || {}),
      updateMessageStat(from, chat.id, date),
    ])

    return 'done'
  } catch (e) {
    console.log(e) // tslint:disable-line
    segments.commandSegment.addError(e)
    return 'done with errors'
  } finally {
    if (segments.commandSegment) {
      segments.commandSegment.close()
    }
  }
}

export const handler: Handler = async (event: any) => {
  const body = event.body ? JSON.parse(event.body) : event
  segment = new AWSXRay.Segment('telegram-bot')

  try {
    const message = await processRequest(body)
    return {
      body: JSON.stringify({ body, message }),
      statusCode: 200,
    }
  } catch (e) {
    console.log(e) // tslint:disable-line
    segment.addError(e)
    return {
      body: JSON.stringify({ body, message: 'something going wrong :c' }),
      statusCode: 200,
    }
  } finally {
    const { statsSegment, commandSegment } = segments
    if (statsSegment && statsSegment.fault || commandSegment && commandSegment.fault) {
      segment.addFaultFlag()
      segment.addMetadata('body', body)
    }
    segment.close()
  }
}
