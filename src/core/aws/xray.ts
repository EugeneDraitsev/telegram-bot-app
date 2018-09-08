import * as AWS from 'aws-sdk'
import * as AWSXRay from 'aws-xray-sdk'

const lambdaOptions = { apiVersion: '2015-03-31', region: 'eu-central-1' }
const lambda = process.env.IS_LOCAL ?
  new AWS.Lambda(lambdaOptions) :
  AWSXRay.captureAWSClient(new AWS.Lambda(lambdaOptions))

const url = 'https://epy9udvh20.execute-api.eu-central-1.amazonaws.com/prod/'

export const getXRayStats = async (XRaySegment: any) => {
  const options = {
    FunctionName: 'screenshot-service-prod-png',
    Payload: JSON.stringify({ queryStringParameters: { url } }),
  }

  if (!process.env.IS_LOCAL) {
    (options as any).XRaySegment = XRaySegment
  }

  const result = await lambda.invoke(options).promise()
  const image = Buffer.from(JSON.parse(result.Payload as any).body, 'base64')

  return { url, image }
}
