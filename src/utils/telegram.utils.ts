import { MessageEntity } from 'telegram-typings'
import { some, split } from 'lodash-es'

export const isLink = (text = ''): boolean => text.includes('https://')

export const findCommand = (text = ''): string =>
  text.replace(/ .*/, '').replace(/@.*/, '')

export const checkCommand = (command: string) => (text = ''): boolean =>
  findCommand(text) === command

export const isBotCommand = (entities: MessageEntity[]): boolean =>
  some(entities, (entity) => entity.type === 'bot_command')

export const parseMessage = (text = ''): [string, string] => {
  const command = findCommand(text)
  const parsedText = split(text, ' ').slice(1).join(' ')
  return [command, parsedText]
}
