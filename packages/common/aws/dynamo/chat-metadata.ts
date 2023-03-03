import { invokeLambda } from '../../utils'

const UPDATE_CHAT_LAMBDA_NAME = `telegram-websockets-${process.env.stage}-updateChatData`

export const updateChatMetaData = async (chatId?: number) =>
  invokeLambda(UPDATE_CHAT_LAMBDA_NAME, { queryStringParameters: { chatId } })
