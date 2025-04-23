import type { APIGatewayProxyHandler } from 'aws-lambda'

import { clearOldMessages } from './upstash'

const redisSchedulerHandler: APIGatewayProxyHandler = async () => {
  try {
    await clearOldMessages()

    return { body: '', statusCode: 200 }
  } catch (e) {
    console.error('redisSchedulerHandler error: ', e)
    return {
      body: JSON.stringify({ message: 'Something went wrong' }),
      // we need to send 200 here to avoid issue with telegram attempts to resend you a message
      statusCode: 200,
    }
  }
}

export default redisSchedulerHandler
