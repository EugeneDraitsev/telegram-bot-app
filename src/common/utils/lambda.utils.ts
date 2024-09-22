import { InvokeCommand, LambdaClient } from '@aws-sdk/client-lambda'

const lambdaOptions = { apiVersion: '2015-03-31', region: process.env.region }
const client = new LambdaClient(lambdaOptions)

// biome-ignore lint: we literally can pass any payload here
export const invokeLambda = (name: string, payload: Record<string, any>) => {
  const options = {
    FunctionName: name,
    Payload: Buffer.from(JSON.stringify(payload)),
  }
  const command = new InvokeCommand(options)
  return client.send(command)
}
