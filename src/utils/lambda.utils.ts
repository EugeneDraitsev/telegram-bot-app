import { Lambda } from 'aws-sdk'
import { captureAWSClient } from 'aws-xray-sdk'

const lambdaOptions = { apiVersion: '2015-03-31', region: 'eu-central-1' }
const lambda = process.env.IS_LOCAL ?
  new Lambda(lambdaOptions) : captureAWSClient(new Lambda(lambdaOptions))

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const invokeLambda = (options: Lambda.Types.InvocationRequest) =>
  lambda.invoke(options).promise()
