import { Lambda } from 'aws-sdk'

const lambdaOptions = { apiVersion: '2015-03-31', region: 'eu-central-1' }
const lambda = new Lambda(lambdaOptions)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const invokeLambda = (options: Lambda.Types.InvocationRequest): Promise<any> =>
  lambda.invoke(options).promise()
