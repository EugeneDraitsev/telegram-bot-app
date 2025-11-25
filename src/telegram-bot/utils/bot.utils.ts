// Wrapper that sets `duplex: 'half'` whenever a request has a body
import { Bot } from 'grammy/web'

// biome-ignore lint/suspicious/noExplicitAny: <>
const fetchWithDuplex: typeof fetch = (input: any, init: any = {}) => {
  // If there is a body and no duplex specified, set duplex to 'half'
  if (init?.body && typeof init.duplex === 'undefined') {
    init.duplex = 'half'
  }
  return fetch(input, init)
}

export const createBot = () =>
  new Bot(process.env.TOKEN || '', {
    client: {
      // biome-ignore lint/suspicious/noExplicitAny: <Grammy fetch typing is incorrect>
      fetch: fetchWithDuplex as any,
    },
  })
