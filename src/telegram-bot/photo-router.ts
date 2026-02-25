import type { Context } from 'grammy/web'

import { setupGemmaDat1coCommands } from './dat1co'
import { handleDebugImages } from './debug-images'
import {
  setupImageGenerationGeminiCommands,
  setupMultimodalGeminiCommands,
} from './google'
import { setupImageGenerationOpenAiCommands } from './open-ai'

type PhotoRoute = {
  prefix: string
  handler: (ctx: Context, deferredCommands: boolean) => Promise<unknown>
}

const photoRoutes: PhotoRoute[] = [
  {
    prefix: '/debugImages',
    handler: async (ctx) => handleDebugImages(ctx),
  },
  {
    prefix: '/o',
    handler: (ctx, deferred) =>
      setupMultimodalGeminiCommands(ctx, deferred, 'gemini-3.1-pro-preview'),
  },
  {
    prefix: '/q',
    handler: (ctx, deferred) =>
      setupMultimodalGeminiCommands(ctx, deferred, 'gemini-3-flash-preview'),
  },
  {
    prefix: '/e',
    handler: (ctx, deferred) =>
      setupImageGenerationOpenAiCommands(ctx, 'gpt-image-1.5', deferred),
  },
  {
    prefix: '/gemma',
    handler: (ctx, deferred) => setupGemmaDat1coCommands(ctx, deferred),
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
