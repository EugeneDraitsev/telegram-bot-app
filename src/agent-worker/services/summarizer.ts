import { generateText } from './gemini'

type SummaryLength = 'short' | 'medium' | 'long'

const LENGTH_INSTRUCTIONS: Record<SummaryLength, string> = {
  short: 'Keep it short: up to 5 bullet points.',
  medium: 'Give a medium summary: 1 short intro and 6-10 bullet points.',
  long: 'Give a detailed summary with key sections and bullet points.',
}

export async function summarizeContent(params: {
  target: string
  length: SummaryLength
  language?: string
}): Promise<string> {
  const target = params.target.trim()
  if (!target) {
    throw new Error('Target cannot be empty')
  }

  const prompt = [
    'You are a summarization tool for Telegram.',
    'Use fresh web search data and summarize only what can be validated.',
    'If the target is a video URL, summarize the text/image/video/ content if available; otherwise summarize reliable metadata and clearly say it.',
    `Target: ${target}`,
    LENGTH_INSTRUCTIONS[params.length],
    `Language: ${params.language?.trim() || 'same as user input'}`,
    'Output format: plain text with bullets, concise and factual.',
  ].join('\n')

  return generateText(prompt, true)
}
