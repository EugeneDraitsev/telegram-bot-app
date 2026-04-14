import { InputFile } from 'grammy/web'
import type { Bot } from 'grammy/web'

import {
  getChatName,
  getChatUsersOrThrow,
  getCommandData,
  getFormattedChatStatistics,
  getFormattedMetrics,
  isAiEnabledChat,
  logger,
} from '@tg-bot/common'
import { getDailyStatistics } from './daily-statistics'

const USERNAME_REGEX = /^[A-Za-z0-9_]+$/
const TELEGRAM_USERNAME_MIN_LENGTH = 5
const TELEGRAM_USERNAME_MAX_LENGTH = 32
const ALL_MENTION_BATCH_SIZE = 5

interface MentionableUser {
  username?: string
}

function normalizeTelegramUsername(username: string): string {
  return username.trim().replace(/^@/, '')
}

export function isTelegramUsername(username: string): boolean {
  const normalized = normalizeTelegramUsername(username)
  return (
    normalized.length >= TELEGRAM_USERNAME_MIN_LENGTH &&
    normalized.length <= TELEGRAM_USERNAME_MAX_LENGTH &&
    USERNAME_REGEX.test(normalized)
  )
}

function buildMentionMessage(users: Array<{ username: string }>) {
  return users
    .map(({ username }) => `@${normalizeTelegramUsername(username)}`)
    .join(' ')
}

function buildAllMessage(
  users: Array<{ username: string }>,
  query = '',
): string {
  const mentions = buildMentionMessage(users)
  const normalizedQuery = query.trim()
  return normalizedQuery ? `${mentions}\n${normalizedQuery}` : mentions
}

export function filterMentionableUsers(users: MentionableUser[]) {
  return users.filter((user): user is { username: string } =>
    Boolean(user.username?.trim() && isTelegramUsername(user.username)),
  )
}

function normalizeChunkSize(chunkSize: number): number {
  if (!Number.isFinite(chunkSize)) {
    return ALL_MENTION_BATCH_SIZE
  }

  const normalizedChunkSize = Math.trunc(chunkSize)
  return normalizedChunkSize > 0 ? normalizedChunkSize : ALL_MENTION_BATCH_SIZE
}

function chunkUsers<T>(users: T[], chunkSize: number): T[][] {
  const chunks: T[][] = []
  const safeChunkSize = normalizeChunkSize(chunkSize)

  for (let index = 0; index < users.length; index += safeChunkSize) {
    chunks.push(users.slice(index, index + safeChunkSize))
  }

  return chunks
}

export function buildAllMentionBatches(
  users: MentionableUser[],
  query = '',
  chunkSize = ALL_MENTION_BATCH_SIZE,
): string[] {
  const validUsers = filterMentionableUsers(users)
  return chunkUsers(validUsers, chunkSize).map((userChunk, index) =>
    buildAllMessage(userChunk, index === 0 ? query : ''),
  )
}

export function buildBatchSendOptions(
  replyToMessageId?: number,
  messageThreadId?: number,
) {
  return {
    ...(typeof replyToMessageId === 'number'
      ? { reply_parameters: { message_id: replyToMessageId } }
      : {}),
    ...(typeof messageThreadId === 'number'
      ? { message_thread_id: messageThreadId }
      : {}),
  }
}

const setupUsersCommands = (bot: Bot) => {
  bot.command('z', async (ctx) =>
    ctx.reply(await getFormattedChatStatistics(ctx?.chat?.id ?? '')),
  )

  bot.command('s', async (ctx) => {
    const { replyId } = getCommandData(ctx.message)
    const chatName = getChatName(ctx?.chat)
    const chatId = ctx?.chat?.id ?? ''

    const { message, image } = await getDailyStatistics(chatId, chatName)

    if (image) {
      return ctx.replyWithPhoto(new InputFile(image, 'stats.png'), {
        reply_parameters: { message_id: replyId },
        caption: message,
      })
    }

    return ctx.reply(
      `${chatName} chat statistics: https://telegram-bot-ui.vercel.app/chat/${chatId}`,
      {
        reply_parameters: { message_id: replyId },
        parse_mode: 'HTML',
      },
    )
  })

  bot.command('all', async (ctx) => {
    const { text, replyId } = getCommandData(ctx.message)
    const chatId = ctx.chat?.id
    const messageThreadId = ctx.message?.message_thread_id
    const replyOptions = buildBatchSendOptions(replyId, messageThreadId)
    if (!chatId) {
      return
    }

    let mentionBatches: string[]
    try {
      mentionBatches = buildAllMentionBatches(
        await getChatUsersOrThrow(chatId),
        text,
      )
    } catch (error) {
      logger.error({ chatId, error }, 'Failed to fetch /all chat users')
      return ctx.reply('Error while fetching users', replyOptions)
    }

    const [firstMessage, ...restMessages] = mentionBatches
    if (!firstMessage) {
      return ctx.reply('No valid usernames found', replyOptions)
    }

    try {
      let lastMessage = await ctx.api.sendMessage(
        chatId,
        firstMessage,
        replyOptions,
      )

      for (const message of restMessages) {
        lastMessage = await ctx.api.sendMessage(
          chatId,
          message,
          buildBatchSendOptions(lastMessage.message_id, messageThreadId),
        )
      }

      return lastMessage
    } catch (error) {
      logger.error({ chatId, error }, 'Failed to send /all mention batches')
      return ctx.reply('Failed to send all mention batches', replyOptions)
    }
  })

  bot.command('x', async (ctx) => {
    if (!isAiEnabledChat(ctx.chat?.id)) return
    const { text, replyId } = getCommandData(ctx.message)
    const rawHours = text.trim()
    const parsedHours = rawHours ? Number(rawHours) : Number.NaN
    const hours = Number.isFinite(parsedHours) ? Math.trunc(parsedHours) : 24
    return ctx.reply(await getFormattedMetrics(hours), {
      reply_parameters: { message_id: replyId },
      parse_mode: 'HTML',
    })
  })
}

export default setupUsersCommands
