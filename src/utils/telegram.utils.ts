import { Chat, Message, MessageEntity, User } from 'telegram-typings'
import { some, split, toLower } from 'lodash'

interface CommandData {
  text: string
  replyId: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isLink = (text = ''): any => text.includes('https://')

export const findCommand = (text = ''): string =>
  text
    .replace(/(\r\n|\n|\r)/gm, '')
    .replace(/ .*/, '')
    .replace(/@.*/, '')

export const checkCommand =
  (command: string) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (text = ''): any =>
    findCommand(toLower(text)) === toLower(command)

export const isBotCommand = (entities: MessageEntity[] = []): boolean =>
  some(entities, (entity) => entity.type === 'bot_command')

export const getParsedText = (text = ''): string => split(text, ' ').slice(1).join(' ')

export const getUserName = (user?: User | Chat): string =>
  user?.username ||
  `${user?.first_name || ''} ${user?.last_name || ''}`.trim() ||
  String(user?.id ?? 'Unknown Chat')

export const getCommandData = (message: Message): CommandData => {
  const { message_id, reply_to_message } = message
  const parsedText = getParsedText(message.text)

  const replyId = parsedText ? message_id : reply_to_message?.message_id ?? message_id
  const text = parsedText || reply_to_message?.text || ''

  return { text, replyId }
}

export const getChatName = (chat?: Chat): string => chat?.title || getUserName(chat)
