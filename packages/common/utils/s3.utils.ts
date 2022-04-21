import { S3 } from 'aws-sdk'

const s3 = new S3({
  region: process.env.region,
  apiVersion: '2006-03-01',
})

export const getFile = async (
  Bucket: S3.Bucket | string,
  Key: string,
): Promise<S3.Types.GetObjectOutput> =>
  s3.getObject({ Bucket, Key } as S3.GetObjectRequest).promise()

export const saveFile = async (
  Bucket: S3.Bucket | string,
  Key: string,
  Body: Buffer,
): Promise<S3.Types.PutObjectOutput> =>
  s3.putObject({ Bucket, Key, Body } as S3.PutObjectRequest).promise()
