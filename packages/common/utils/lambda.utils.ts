import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'

const lambdaOptions = { apiVersion: '2015-03-31', region: process.env.region }
const client = new LambdaClient(lambdaOptions)

export const invokeLambda = (name: string, payload: Record<string, any>) => {
  const options = {
    FunctionName: name,
    Payload: Buffer.from(JSON.stringify(payload)),
  }
  const command = new InvokeCommand(options)
  return client.send(command)
}
