import type { Context } from 'grammy/web'

import { OPENAI_GPT_IMAGE_MODEL } from '@tg-bot/common'
import {
  GEMMA_MODEL,
  setupImageGenerationGeminiCommands,
  setupMultimodalGeminiCommands,
} from './google'
import {
  OPENAI_O_MODEL,
  OPENAI_O_REASONING_EFFORT,
  OPENAI_Q_MODEL,
  OPENAI_Q_REASONING_EFFORT,
  setupImageGenerationOpenAiCommands,
  setupMultimodalOpenAiCommands,
} from './open-ai'

type PhotoRoute = {
  prefix: string
  handler: (ctx: Context, deferredCommands: boolean) => Promise<unknown>
}

const photoRoutes: PhotoRoute[] = [
  {
    prefix: '/o',
    handler: (ctx, deferred) =>
      setupMultimodalOpenAiCommands(
        ctx,
        OPENAI_O_MODEL,
        deferred,
        '/o',
        OPENAI_O_REASONING_EFFORT,
      ),
  },
  {
    prefix: '/q',
    handler: (ctx, deferred) =>
      setupMultimodalOpenAiCommands(
        ctx,
        OPENAI_Q_MODEL,
        deferred,
        '/q',
        OPENAI_Q_REASONING_EFFORT,
      ),
  },
  {
    prefix: '/e',
    handler: (ctx, deferred) =>
      setupImageGenerationOpenAiCommands(ctx, OPENAI_GPT_IMAGE_MODEL, deferred),
  },
  {
    prefix: '/gemma',
    handler: (ctx, deferred) =>
      setupMultimodalGeminiCommands(ctx, deferred, GEMMA_MODEL, '/gemma'),
  },
  {
    prefix: '/ge',
    handler: (ctx, deferred) =>
      setupImageGenerationGeminiCommands(ctx, deferred),
  },
]

export const handlePhotoMessage = async (
  ctx: Context,
  deferredCommands: boolean,
): Promise<boolean> => {
  const caption = ctx.message?.caption

  if (!caption) return false

  // Sort by prefix length descending to match the longest prefix first (e.g. /gemma before /ge)
  const sortedRoutes = [...photoRoutes].sort(
    (a, b) => b.prefix.length - a.prefix.length,
  )

  for (const route of sortedRoutes) {
    if (caption.startsWith(route.prefix)) {
      await route.handler(ctx, deferredCommands)
      return true
    }
  }

  return false
}
