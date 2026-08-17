import type { Message } from 'grammy/types'

const IMAGE_COMMANDS = new Set(['e', 'ee', 'ge', 'gp', 'de'])
const IMAGE_INSTRUCTION = 'Generate or edit an image for this request'
const COMMAND_INSTRUCTIONS = new Map<string, string>([
  [
    'omni',
    'Generate or edit a video for this request with the generate_video_with_omni tool. Default to a 5-second vertical video with native audio unless the user specifies another 3-10 second duration or aspect ratio',
  ],
  [
    'lyria',
    'Generate a 30-second music clip for this request with the generate_music_with_lyria tool using mode="clip"',
  ],
  [
    'lyriapro',
    'Generate a full-length structured song for this request with the generate_music_with_lyria tool using mode="pro"',
  ],
])

function addInstruction(instruction: string, text: string | undefined): string {
  const request = text?.trim()
  return request
    ? `${instruction}:\n${request}`
    : `${instruction} using the attached or replied-to content.`
}

export function prepareAgentCommandMessage(
  message: Message,
  commandName?: string,
): Message {
  const instruction = commandName
    ? IMAGE_COMMANDS.has(commandName)
      ? IMAGE_INSTRUCTION
      : COMMAND_INSTRUCTIONS.get(commandName)
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
