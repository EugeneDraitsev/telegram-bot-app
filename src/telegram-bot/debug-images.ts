import type { Context } from 'grammy/web'
import type { Message } from 'telegram-typings'

import {
  collectMessageImageFileIds,
  getCommandData,
  getLargestPhoto,
  getMediaGroupMessages,
  getMediaGroupMessagesFromHistory,
  getRawHistory,
} from '@tg-bot/common'

function shortId(id?: string): string {
  if (!id) {
    return 'n/a'
  }
  return id.length > 10 ? `${id.slice(0, 10)}...` : id
}

function formatMessageSummary(message: Message): string {
  const largest = getLargestPhoto(message)
  return [
    `id=${message.message_id}`,
    `mg=${message.media_group_id || '-'}`,
    `photo=${shortId(largest?.file_id)}`,
  ].join(' ')
}

export async function handleDebugImages(ctx: Context) {
  const message = ctx.message as Message | undefined
  if (!message) {
    return
  }

  const chatId = ctx.chat?.id || 0
  const replyId = message.reply_to_message?.message_id || message.message_id
  const currentMediaGroupId = message.media_group_id
  const replyMediaGroupId = message.reply_to_message?.media_group_id

  const [rawHistory, commandExtraMessages, agentExtraMessages] =
    await Promise.all([
      getRawHistory(chatId),
      getMediaGroupMessages(ctx),
      getMediaGroupMessagesFromHistory(
        chatId,
        message.message_id,
        currentMediaGroupId,
        replyMediaGroupId,
        true,
      ),
    ])

  const commandData = getCommandData(message, commandExtraMessages)
  const commandImageIds = commandData.images
    .map((img) => (img as { file_id?: string }).file_id)
    .filter((id): id is string => Boolean(id))

  const agentImageIds = [
    ...new Set([
      ...collectMessageImageFileIds(message),
      ...agentExtraMessages
        .map((m) => getLargestPhoto(m)?.file_id)
        .filter((id): id is string => Boolean(id)),
    ]),
  ]

  const currentGroupCount = currentMediaGroupId
    ? rawHistory.filter((m) => m.media_group_id === currentMediaGroupId).length
    : 0
  const replyGroupCount = replyMediaGroupId
    ? rawHistory.filter((m) => m.media_group_id === replyMediaGroupId).length
    : 0

  const lines = [
    'DEBUG IMAGES',
    `chatId: ${chatId}`,
    `message: ${formatMessageSummary(message)}`,
    `reply: id=${message.reply_to_message?.message_id || '-'} mg=${replyMediaGroupId || '-'}`,
    '',
    `history.total: ${rawHistory.length}`,
    `history.current_group_count: ${currentGroupCount}`,
    `history.reply_group_count: ${replyGroupCount}`,
    '',
    `reply_path.extra_messages: ${commandExtraMessages.length}`,
    `reply_path.images: ${commandImageIds.length}`,
    `reply_path.image_ids: ${commandImageIds.map(shortId).join(', ') || '-'}`,
    '',
    `agent_path.extra_messages: ${agentExtraMessages.length}`,
    `agent_path.images: ${agentImageIds.length}`,
    `agent_path.image_ids: ${agentImageIds.map(shortId).join(', ') || '-'}`,
    '',
    'extra_messages (reply path):',
    ...(commandExtraMessages.length
      ? commandExtraMessages.map((m) => `- ${formatMessageSummary(m)}`)
      : ['- none']),
  ]

  const response = lines.join('\n').slice(0, 3900)

  return ctx.reply(response, {
    reply_parameters: { message_id: replyId },
  })
}
