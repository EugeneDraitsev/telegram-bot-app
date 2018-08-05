import { Lambda } from 'aws-sdk'

const lambda = new Lambda({ apiVersion: '2015-03-31', region: 'eu-central-1' })
const url = 'https://epy9udvh20.execute-api.eu-central-1.amazonaws.com/prod/'

export const getXRayStats = async () => {
  const options = {
    FunctionName: 'screenshot-service-prod-png',
    Payload: JSON.stringify({ queryStringParameters: { url } }),
  }
  const result = await lambda.invoke(options).promise()
  const image = Buffer.from(JSON.parse(result.Payload as any).body, 'base64')
  console.log(result) // tslint:disable-line
  console.log(image) // tslint:disable-line

  return { url, image }
}
