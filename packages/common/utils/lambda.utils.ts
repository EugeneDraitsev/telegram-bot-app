import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import type { InvocationRequest } from '@aws-sdk/client-lambda'

const lambdaOptions = { apiVersion: '2015-03-31', region: process.env.region }
const client = new LambdaClient(lambdaOptions)

export const invokeLambda = (options: InvocationRequest) => {
  const command = new InvokeCommand(options)
  return client.send(command)
}
