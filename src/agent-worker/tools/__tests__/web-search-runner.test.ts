import type { Message } from 'grammy/types'

import {
  WEB_SEARCH_FALLBACK_MODEL_CONFIG,
  WEB_SEARCH_MODEL_CONFIG,
} from '../../agent/models'
import type { searchWebOpenAi } from '../../services/openai-web-search'
import { runWithToolContext } from '../context'
import { searchWebWithFallback } from '../web-search-runner'

const message = {
  message_id: 1,
  chat: { id: 777, type: 'group' },
} as Message

describe('searchWebWithFallback', () => {
  test('uses Luna as the default web search model', () => {
    expect(WEB_SEARCH_MODEL_CONFIG).toEqual({
      provider: 'openai',
      model: 'gpt-5.6-luna',
    })
    expect(WEB_SEARCH_FALLBACK_MODEL_CONFIG).toEqual({
      provider: 'openai',
      model: 'gpt-5.4-nano',
    })
  })

  test('returns the primary result without invoking fallback', async () => {
    const search = jest
      .fn<
        ReturnType<typeof searchWebOpenAi>,
        Parameters<typeof searchWebOpenAi>
      >()
      .mockResolvedValue('fresh')

    await expect(
      runWithToolContext(message, undefined, () =>
        searchWebWithFallback(
          'latest news',
          'brief',
          { chatId: 777 },
          {},
          search,
        ),
      ),
    ).resolves.toBe('fresh')

    expect(search).toHaveBeenCalledTimes(1)
    expect(search).toHaveBeenCalledWith(
      'latest news',
      'brief',
      { chatId: 777 },
      WEB_SEARCH_MODEL_CONFIG,
    )
  })

  test('falls back to nano after a failed Luna attempt', async () => {
    const search = jest
      .fn<
        ReturnType<typeof searchWebOpenAi>,
        Parameters<typeof searchWebOpenAi>
      >()
      .mockRejectedValueOnce(new Error('Luna unavailable'))
      .mockResolvedValueOnce('fallback result')

    await expect(
      runWithToolContext(message, undefined, () =>
        searchWebWithFallback(
          'latest news',
          'brief',
          { chatId: 777 },
          {},
          search,
        ),
      ),
    ).resolves.toBe('fallback result')

    expect(search).toHaveBeenCalledTimes(2)
    expect(search).toHaveBeenNthCalledWith(
      2,
      'latest news',
      'brief',
      { chatId: 777 },
      WEB_SEARCH_FALLBACK_MODEL_CONFIG,
    )
  })
})
