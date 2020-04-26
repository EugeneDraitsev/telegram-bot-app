import { invokeLambda } from '../../../utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const updateChatMetaData = async (chatId?: number): Promise<any> => {
  const options = {
    FunctionName: 'telegram-websockets-prod-updateChatData',
    Payload: JSON.stringify({ queryStringParameters: { chatId } }),
  }

  return invokeLambda(options)
}
