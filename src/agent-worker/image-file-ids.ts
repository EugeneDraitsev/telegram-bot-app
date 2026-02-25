// import type { Message } from 'telegram-typings'
//
// import {
//   collectMessageImageFileIds,
//   getLargestPhoto,
//   getMediaGroupMessagesFromHistory,
// } from '@tg-bot/common'
//
// async function collectMediaGroupImageFileIds(
//   message: Message,
// ): Promise<string[]> {
//   const chatId = message.chat?.id
//   const messageId = message.message_id
//   if (!chatId || !messageId) {
//     return []
//   }
//
//   const currentMediaGroupId = message.media_group_id
//   const replyMediaGroupId = message.reply_to_message?.media_group_id
//   if (!currentMediaGroupId && !replyMediaGroupId) {
//     return []
//   }
//
//   const mediaGroupMessages = await getMediaGroupMessagesFromHistory(
//     chatId,
//     messageId,
//     currentMediaGroupId,
//     replyMediaGroupId,
//     true,
//   )
//
//   return mediaGroupMessages
//     .map((m) => getLargestPhoto(m)?.file_id)
//     .filter((id): id is string => Boolean(id))
// }
//
// export async function collectEffectiveImageFileIds(
//   message: Message,
//   incomingFileIds?: string[],
// ): Promise<string[]> {
//   const directImageFileIds = collectMessageImageFileIds(
//     message,
//     incomingFileIds,
//   )
//   const mediaGroupImageFileIds = await collectMediaGroupImageFileIds(message)
//
//   return [...new Set([...directImageFileIds, ...mediaGroupImageFileIds])]
// }
