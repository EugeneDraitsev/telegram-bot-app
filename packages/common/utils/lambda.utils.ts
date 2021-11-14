import { Lambda } from 'aws-sdk'

const lambdaOptions = { apiVersion: '2015-03-31', region: process.env.region }
const lambda = new Lambda(lambdaOptions)

export const invokeLambda = (options: Lambda.Types.InvocationRequest) =>
  lambda.invoke(options).promise()
