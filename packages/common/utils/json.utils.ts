import { _Blob } from 'aws-sdk/clients/apigateway'

export const safeJSONParse = (src?: string | _Blob) => {
  try {
    return JSON.parse(src?.toString() as string)
  } catch (e) {
    return null
  }
}
