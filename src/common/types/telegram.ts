import type { Message } from 'telegram-typings'

export interface ExtendedMessage extends Message {
  quote?: {
    text: string
  }
}
