import { invokeLambda } from '../../utils'

export const updateChatMetaData = async (chatId?: number) => {
  const options = {
    FunctionName: `telegram-websockets-${process.env.stage}-updateChatData`,
    Payload: JSON.stringify({ queryStringParameters: { chatId } }),
  }

  return invokeLambda(options)
}
