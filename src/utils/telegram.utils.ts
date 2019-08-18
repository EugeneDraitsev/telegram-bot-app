import { MessageEntity } from 'telegram-typings'
import { some, split } from 'lodash'

export const isLink = (text = '') => text.includes('https://')

export const findCommand = (text = '') =>
  text.replace(/ .*/, '').replace(/@.*/, '')

export const checkCommand = (command: string) => (text = '') =>
  findCommand(text) === command

export const isBotCommand = (entities: MessageEntity[]) =>
  some(entities, (entity) => entity.type === 'bot_command')

export const parseMessage = (text = '') => {
  const command = findCommand(text)
  const parsedText = split(text, ' ').slice(1).join(' ')
  return [command, parsedText]
}
