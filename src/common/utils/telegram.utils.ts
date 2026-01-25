import type { Context } from 'grammy/web'
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

export const getCommandData = (
  message?: Message,
  extraMessages: Message[] = [],
) => {
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

  const getLargestPhoto = (m?: Message) =>
    (m?.photo ?? []).slice().sort((a, b) => b.width - a.width)[0]

  const messagePhoto = getLargestPhoto(message)
  const replyPhoto = getLargestPhoto(reply_to_message)
  const extraPhotos = extraMessages.map(getLargestPhoto)

  const allImages = [messagePhoto, replyPhoto, ...extraPhotos].filter(
    (image) => image,
  )

  // Deduplicate by file_unique_id
  const uniqueImagesMap = new Map()
  for (const img of allImages) {
    if (!uniqueImagesMap.has(img.file_unique_id)) {
      uniqueImagesMap.set(img.file_unique_id, img)
    }
  }
  const images = Array.from(uniqueImagesMap.values())

  const sticker = reply_to_message?.sticker

  if (sticker) {
    images.push(sticker)
  }

  return { text, sticker, combinedText, images, replyId }
}

export const getMultimodalCommandData = async (
  ctx: Context,
  extraMessages: Message[] = [],
) => {
  const { combinedText, images, replyId } = getCommandData(
    ctx.message,
    extraMessages,
  )
  const chatId = ctx?.chat?.id ?? ''

  const fileResults = await Promise.allSettled(
    images?.map((image) => ctx.api.getFile(image.file_id)) ?? [],
  )

  const files: Array<{ file_path?: string }> = []
  for (const result of fileResults) {
    if (result.status === 'fulfilled') {
      files.push(result.value as { file_path?: string })
    } else {
      console.warn('getFile error: ', result.reason)
    }
  }

  const imagesUrls = files
    .map((file) =>
      file.file_path
        ? `https://api.telegram.org/file/bot${process.env.TOKEN || ''}/${file.file_path}`
        : undefined,
    )
    .filter((url): url is string => Boolean(url))

  const imagesData = await getImageBuffers(imagesUrls)

  return {
    combinedText,
    imagesData,
    replyId,
    chatId,
    message: ctx.message,
  }
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
