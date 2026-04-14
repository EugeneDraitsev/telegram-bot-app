import { InputFile } from 'grammy/web'
import type { Bot } from 'grammy/web'

import {
  getChatName,
  getChatUsers,
  getCommandData,
  getFormattedChatStatistics,
  getFormattedMetrics,
  isAiEnabledChat,
} from '@tg-bot/common'
import { getDailyStatistics } from './daily-statistics'

const USERNAME_REGEX = /^[A-Za-z0-9_]{3,}$/
const ALL_MENTION_BATCH_SIZE = 5

function getMentionLabel(user: { username: string }): string {
  const normalized = user.username.trim()
  return normalized.startsWith('@') ? normalized : `@${normalized}`
}

function isTelegramUsername(username: string): boolean {
  return USERNAME_REGEX.test(username.trim().replace(/^@/, ''))
}

function buildMentionMessage(users: Array<{ username: string }>) {
  return users.map((user) => getMentionLabel(user)).join(' ')
}

function chunkUsers<T>(users: T[], chunkSize: number): T[][] {
  const chunks: T[][] = []

  for (let index = 0; index < users.length; index += chunkSize) {
    chunks.push(users.slice(index, index + chunkSize))
  }

  return chunks
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
    const users = (await getChatUsers(ctx.chat?.id ?? '')).filter(
      (user) =>
        user.id && user.username?.trim() && isTelegramUsername(user.username),
    )

    if (users.length === 0) {
      return ctx.reply('Error while fetching users', {
        reply_parameters: { message_id: replyId },
      })
    }

    const userChunks = chunkUsers(users, ALL_MENTION_BATCH_SIZE)
    const query = text.trim()
    const [firstChunk, ...restChunks] = userChunks

    const firstMentions = buildMentionMessage(firstChunk)
    const firstMessage = query ? `${firstMentions}\n${query}` : firstMentions

    let lastMessage = await ctx.api.sendMessage(ctx.chat.id, firstMessage, {
      reply_parameters: { message_id: replyId },
    })

    for (const userChunk of restChunks) {
      const mentions = buildMentionMessage(userChunk)
      const message = query ? `${mentions}\n${query}` : mentions

      lastMessage = await ctx.api.sendMessage(ctx.chat.id, message)
    }

    return lastMessage
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
