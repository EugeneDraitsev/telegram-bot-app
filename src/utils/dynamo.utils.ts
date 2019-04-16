import { DynamoDB, AWSError } from 'aws-sdk'
import { captureAWSClient } from 'aws-xray-sdk'

const documentClient = new DynamoDB.DocumentClient({
  apiVersion: '2012-08-10',
  region: process.env.region,
  service: new DynamoDB({ apiVersion: '2012-08-10', region: process.env.region }),
})

if (!process.env.IS_LOCAL) {
  captureAWSClient((documentClient as any).service)
}

export const dynamoScan = (params: DynamoDB.DocumentClient.ScanInput) =>
  new Promise((resolve, reject) => {
    const scanParams = { ...params }

    const results: any[] = []

    const onScan = (err: AWSError, data: DynamoDB.ScanOutput) => {
      if (err) {
        reject(err)
      } else {
        results.push(...data.Items!)
        // continue scanning if we have more records, because
        // scan can retrieve a maximum of 1MB of data
        if (typeof data.LastEvaluatedKey !== 'undefined') {
          scanParams.ExclusiveStartKey = data.LastEvaluatedKey
          documentClient.scan(scanParams, onScan)
        } else {
          resolve(results)
        }
      }
    }

    documentClient.scan(scanParams, onScan)
  })

export const dynamoQuery = (params: DynamoDB.DocumentClient.QueryInput) => documentClient.query(params).promise()
export const dynamoPutItem = (params: DynamoDB.DocumentClient.PutItemInput) => documentClient.put(params).promise()
