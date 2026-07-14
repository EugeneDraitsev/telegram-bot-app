import type { Message } from 'grammy/types'

const IMAGE_COMMANDS = new Set(['e', 'ee', 'ge', 'gp', 'de'])
const IMAGE_INSTRUCTION = 'Generate or edit an image for this request'

function addImageInstruction(text: string | undefined): string {
  const request = text?.trim()
  return request
    ? `${IMAGE_INSTRUCTION}:\n${request}`
    : `${IMAGE_INSTRUCTION} using the attached or replied-to content.`
}

export function prepareAgentCommandMessage(
  message: Message,
  commandName?: string,
): Message {
  if (!commandName || !IMAGE_COMMANDS.has(commandName)) {
    return message
  }

  if (typeof message.caption === 'string') {
    return { ...message, caption: addImageInstruction(message.caption) }
  }

  return { ...message, text: addImageInstruction(message.text) }
}
