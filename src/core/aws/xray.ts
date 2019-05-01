import { invokeLambda } from '../../utils'

const url = 'https://epy9udvh20.execute-api.eu-central-1.amazonaws.com/prod/'

export const getXRayStats = async () => {
  const options = {
    FunctionName: 'screenshot-service-prod-png',
    Payload: JSON.stringify({ queryStringParameters: { url } }),
  }

  const result = await invokeLambda(options).promise()
  const image = Buffer.from(JSON.parse(result.Payload as any).body, 'base64')

  return { url, image }
}
