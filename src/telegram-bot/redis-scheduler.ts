import type { APIGatewayProxyHandler } from 'aws-lambda'

import { clearOldMessages, logger } from '@tg-bot/common'

const redisSchedulerHandler: APIGatewayProxyHandler = async () => {
  try {
    await clearOldMessages()

    return { body: '', statusCode: 200 }
  } catch (e) {
    logger.error({ error: e }, 'redisSchedulerHandler error')
    return {
      body: JSON.stringify({ message: 'Something went wrong' }),
      // we need to send 200 here to avoid issue with telegram attempts to resend you a message
      statusCode: 200,
    }
  }
}

export default redisSchedulerHandler
