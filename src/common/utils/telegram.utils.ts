import { some, split, toLower } from 'lodash'
import type { Chat, Message, MessageEntity, User } from 'telegram-typings'

export const isLink = (text = '') => text.includes('https://')

export const findCommand = (text = ''): string =>
  text
    .replace(/(\r\n|\n|\r)/gm, '')
    .replace(/ .*/, '')
    .replace(/@.*/, '')

export const checkCommand =
  (command: string) =>
  // biome-ignore lint: we have to enforce any type here due to the strange typing of the Telegraf library
  (text = ''): any =>
    findCommand(toLower(text)) === toLower(command)

export const isBotCommand = (entities: MessageEntity[] = []): boolean =>
  some(entities, (entity) => entity.type === 'bot_command')

export const getParsedText = (text = '') => {
  if (text.startsWith('/')) {
    return split(text, ' ').slice(1).join(' ')
  }
  return text
}

export const getUserName = (user?: User | Chat) =>
  user?.username ||
  `${user?.first_name || ''} ${user?.last_name || ''}`.trim() ||
  String(user?.id ?? 'Unknown Chat')

export const getCommandData = (message: Message) => {
  const { message_id, reply_to_message } = message
  const parsedText = getParsedText(message.text || message.caption)

  const replyId = parsedText
    ? message_id
    : (reply_to_message?.message_id ?? message_id)
  const text =
    parsedText || reply_to_message?.text || reply_to_message?.caption || ''

  return { text, replyId }
}

export const getChatName = (chat?: Chat) => chat?.title || getUserName(chat)
