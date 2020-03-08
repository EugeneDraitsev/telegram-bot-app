import fetch from 'node-fetch'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const updateChatS3Data = async (id?: number): Promise<any> => {
  const url = 'https://yxol1ml0oj.execute-api.eu-central-1.amazonaws.com/prod'
  return fetch(`${url}/updateChatData?chatId=${id}`)
}
