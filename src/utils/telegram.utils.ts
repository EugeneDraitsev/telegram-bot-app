import { MessageEntity } from 'telegram-typings'
import { some, split, toLower } from 'lodash'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const isLink = (text = ''): any => text.includes('https://')

export const findCommand = (text = ''): string => text.replace(/ .*/, '').replace(/@.*/, '')

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const checkCommand = (command: string) => (text = ''): any =>
  findCommand(toLower(text)) === toLower(command)

export const isBotCommand = (entities: MessageEntity[] = []): boolean =>
  some(entities, (entity) => entity.type === 'bot_command')

export const parseMessage = (text = ''): [string, string] => {
  const command = findCommand(text)
  const parsedText = split(text, ' ').slice(1).join(' ')
  return [command, parsedText]
}
