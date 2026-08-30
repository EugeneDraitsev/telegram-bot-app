import type { Message } from 'grammy/types'

const IMAGE_INSTRUCTION = 'Generate or edit an image for this request'
const COMMAND_INSTRUCTIONS = new Map<string, string>([
  ['e', IMAGE_INSTRUCTION],
  ['ee', IMAGE_INSTRUCTION],
  ['ge', IMAGE_INSTRUCTION],
  ['gp', IMAGE_INSTRUCTION],
  ['de', IMAGE_INSTRUCTION],
  [
    'omni',
    'Generate, animate, edit, or continue a video for this request with the generate_video_with_omni tool. Default to an 8-second vertical video with native audio unless the user specifies another 3-10 second duration or another aspect ratio',
  ],
  [
    'lyria',
    'Generate a 30-second music clip for this request with the generate_music_with_lyria tool',
  ],
  [
    'lyriapro',
    'Generate a full-length structured song for this request with the generate_music_with_lyria tool',
  ],
])

function addInstruction(instruction: string, text: string | undefined): string {
  const request = text?.trim()
  return request
    ? `${instruction}:\n${request}`
    : `${instruction}. Use attached or replied-to media when available.`
}

export function prepareAgentCommandMessage(
  message: Message,
  commandName?: string,
): Message {
  const instruction = commandName
    ? COMMAND_INSTRUCTIONS.get(commandName)
    : undefined
  if (!instruction) {
    return message
  }

  if (typeof message.caption === 'string') {
    return {
      ...message,
      caption: addInstruction(instruction, message.caption),
    }
  }

  return { ...message, text: addInstruction(instruction, message.text) }
}
