import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3'

const client = new S3Client({ region: process.env.region })

export const getFile = async (Bucket: string, Key: string) => {
  const command = new GetObjectCommand({ Bucket, Key })
  const data = await client.send(command)
  return data.Body?.transformToString()
}

export const saveFile = async (Bucket: string, Key: string, Body: Buffer) => {
  const command = new PutObjectCommand({ Bucket, Key, Body })
  return client.send(command)
}
