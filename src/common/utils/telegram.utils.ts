import type { Chat, Message, MessageEntity, User } from 'telegram-typings'

export const isLink = (text = '') => text.includes('https://')

export const findCommand = (text = ''): string =>
  text
    .replace(/(\r\n|\n|\r)/gm, '')
    .replace(/ .*/, '')
    .replace(/@.*/, '')

export const isBotCommand = (entities: MessageEntity[] = []): boolean =>
  entities.some((entity) => entity.type === 'bot_command')

export const getParsedText = (text = '') => {
  if (text.startsWith('/')) {
    return text.split(' ').slice(1).join(' ')
  }
  return text
}

export const getUserName = (user?: User | Chat) =>
  user?.username ||
  `${user?.first_name || ''} ${user?.last_name || ''}`.trim() ||
  String(user?.id ?? 'Unknown Chat')

export const getCommandData = (message?: Message) => {
  const { message_id, reply_to_message } = message ?? {}
  const parsedText = getParsedText(message?.text || message?.caption)

  const replyId = parsedText
    ? message_id || 0
    : (reply_to_message?.message_id ?? message_id ?? 0)
  const text =
    parsedText || reply_to_message?.text || reply_to_message?.caption || ''
  const messageText = parsedText
  const replyText = reply_to_message?.text || reply_to_message?.caption
  const combinedText =
    replyText && messageText ? `${replyText}\n${messageText}` : text

  const images = (message?.photo ?? []).concat(reply_to_message?.photo ?? [])
  const sticker = reply_to_message?.sticker

  if (sticker) {
    images.push(sticker)
  }

  return { text, sticker, combinedText, images, replyId }
}

export async function getImageBuffers(imagesUrls: string[]) {
  const imagesData = await Promise.all(
    imagesUrls.map(async (url) => {
      try {
        const res = await fetch(url)
        const arrayBuffer = await res.arrayBuffer()
        return Buffer.from(arrayBuffer)
      } catch (error) {
        console.error(error)
        return undefined
      }
    }),
  )

  return imagesData.filter((image) => image) as Buffer[]
}

export const getChatName = (chat?: Chat) => chat?.title || getUserName(chat)
