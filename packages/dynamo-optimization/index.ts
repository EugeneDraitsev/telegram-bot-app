import * as https from 'https'
import * as AWS from 'aws-sdk'

// https://theburningmonk.com/2019/02/lambda-optimization-tip-enable-http-keep-alive/
const sslAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  rejectUnauthorized: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}) as any

sslAgent.setMaxListeners(0)

AWS.config.update({
  httpOptions: {
    agent: sslAgent,
  },
})
