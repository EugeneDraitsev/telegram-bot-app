export const OPENAI_GPT_IMAGE_SIZE = 'auto' as const

const SAFE_FRAMING_NOTE =
  'Unless the user explicitly asks for a close-up or cropped framing, keep the full intended composition inside the canvas with comfortable safe margins. Do not accidentally crop faces, heads, limbs, hands, feet, main objects, borders, or any requested text. If the image is cover art, a poster, album art, or another design with typography, ensure the entire design and all text are fully visible inside the frame.'

export function buildOpenAiImagePrompt(prompt: string): string {
  const trimmedPrompt = prompt.trim()

  if (!trimmedPrompt) {
    return ''
  }

  if (trimmedPrompt.includes(SAFE_FRAMING_NOTE)) {
    return trimmedPrompt
  }

  return `${trimmedPrompt}\n\nComposition note: ${SAFE_FRAMING_NOTE}`
}
