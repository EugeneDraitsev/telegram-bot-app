import type { Context } from 'grammy/web'

import { setupGemmaDat1coCommands } from './dat1co'
import {
  setupImageGenerationGeminiCommands,
  setupMultimodalGeminiCommands,
} from './google'
import { setupImageGenerationOpenAiCommands } from './open-ai'

type PhotoRoute = {
  prefix: string
  excludePrefix?: string
  handler: (ctx: Context, deferredCommands: boolean) => Promise<unknown>
}

const photoRoutes: PhotoRoute[] = [
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
    excludePrefix: '/gemma',
    handler: (ctx, deferred) =>
      setupImageGenerationGeminiCommands(ctx, deferred),
  },
]

export const handlePhotoMessage = (
  ctx: Context,
  deferredCommands: boolean,
): Promise<unknown> | undefined => {
  const caption = ctx.message?.caption

  if (!caption) return undefined

  for (const route of photoRoutes) {
    if (caption.startsWith(route.prefix)) {
      if (route.excludePrefix && caption.startsWith(route.excludePrefix)) {
        continue
      }
      return route.handler(ctx, deferredCommands)
    }
  }

  return undefined
}
