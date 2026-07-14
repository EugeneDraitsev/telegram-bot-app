import {
  tool as defineAiTool,
  type JSONSchema7,
  jsonSchema,
  type ModelMessage,
  type ToolSet,
  type UserModelMessage,
} from 'ai'
import type { Message } from 'grammy/types'

import type {
  AiModelConfig,
  HistoryMediaAttachment,
  MediaBuffer,
} from '@tg-bot/common'
import {
  AGENT_REACTION,
  type BotIdentity,
  cleanModelMessage,
  collectHistoryMediaFileRefs,
  collectMediaFileRefs,
  DEFAULT_AGENT_HISTORY_LIMIT,
  formatHistoryForDisplay,
  GEMINI_FLASH_LITE_IMAGE_MODEL,
  getAiSdkProviderOptions,
  getChatMemory,
  getGlobalMemory,
  getMessageLogMeta,
  getMetricStatusFromError,
  getRecentRawHistory,
  logger,
  type MetricStatus,
  recordMetric,
  resolveHistoryMediaAttachments,
  startThinkingRichDraftIndicator,
  startTypingIndicator,
} from '@tg-bot/common'
import { IMAGE_MODEL } from '../services/openai-image'
import { VOICE_MODEL } from '../services/openai-tts'
import { WEB_SEARCH_MODEL } from '../services/openai-web-search'
import {
  executeDynamicCommandFromMessage,
  getAgentTools,
  getBaseAgentTools,
  getCollectedResponses,
  getToolCommandName,
  runWithToolContext,
  withToolMediaBuffers,
} from '../tools'
import type { AgentResponse, AgentTool, TelegramApi } from '../types'
import {
  CONTENT_TOOLS,
  MAX_TOOL_ITERATIONS,
  TERMINAL_TOOLS,
  TOOL_CALL_TIMEOUT_MS,
} from './config'
import { buildContextBlock, buildMemoryBlock, splitResponses } from './context'
import { sendResponses } from './delivery'
import {
  type GenerateModelWithRetryResult,
  generateModelWithRetryWithInfo,
  isRetryableModelError,
  ModelCallTimeoutError,
} from './model-call'
import {
  CHAT_FALLBACK_REASONING_EFFORT,
  CHAT_MODEL_CONFIG,
  CHAT_MODEL_LABEL,
  CHAT_MODEL_REASONING_EFFORT,
  FAST_MODEL,
  HELPER_TEXT_MODEL_CONFIG,
  REPLY_GATE_MODEL,
} from './models'
import { shouldEngageWithMessage } from './reply-gate'
import { agentSystemInstructions } from './system-instructions'
import { withTimeout } from './utils'

// ── Helpers ──────────────────────────────────────────────────

function buildSystemInstruction(
  contextBlock: string,
  memoryBlock?: string,
): string {
  const parts = [agentSystemInstructions, contextBlock]
  if (memoryBlock) parts.push(memoryBlock)
  return parts.join('\n\n')
}

function getRecentHistoryContext(
  messages: Message[],
  currentMessageId?: number,
): string {
  const history = formatHistoryForDisplay(messages, {
    limit: DEFAULT_AGENT_HISTORY_LIMIT,
    includeHeader: false,
    excludeMessageId: currentMessageId,
  })
  return history === 'No message history available' ? '' : history
}

export function buildNativeTools(agentTools: AgentTool[]): ToolSet {
  return Object.fromEntries(
    agentTools
      .filter((tool) => tool.exposeToModel !== false)
      .map((tool) => [
        tool.declaration.name,
        defineAiTool({
          description: tool.declaration.description,
          inputSchema: jsonSchema(
            (tool.declaration.parameters ?? {
              type: 'object',
              properties: {},
              additionalProperties: false,
            }) as JSONSchema7,
          ),
        }),
      ]),
  )
}

/** Maps tool names to their underlying AI model for metrics */
const TOOL_MODELS: Record<string, string> = {
  web_search: WEB_SEARCH_MODEL,
  generate_or_edit_image: IMAGE_MODEL,
  generate_voice: VOICE_MODEL,
  search_video: WEB_SEARCH_MODEL,
  code_execution: FAST_MODEL,
}
const RATE_LIMITED_TOOLS = new Set(['web_search', 'search_video'])

const MAX_HISTORY_IMAGE_ATTACHMENTS = 4
const TOOL_RESULT_FALLBACK_MAX_CHARS = 3_500
const AGENT_PRELOAD_TIMEOUT_MS = 3_000
const AGENT_ROUTING_MODEL_TIMEOUT_MS = 20_000
const DIRECT_SVG_MODEL_TIMEOUT_MS = 15_000
const RENDER_SVG_TOOL_NAME = 'render_svg_to_png'
const RENDER_LATEX_TOOL_NAME = 'render_latex'
const GENERATE_IMAGE_TOOL_NAME = 'generate_or_edit_image'
const RENDER_REQUEST_REGEX =
  /\b(?:chart|plot|graph|diagram|svg|png|latex|formula)\b|график|диаграм|схем|формул|лате[хк]с|картинк|визуал/i
const SVG_RENDER_REQUEST_REGEX =
  /\b(?:chart|plot|graph|diagram|svg|png)\b|график|диаграм|схем|визуал/i
const LATEX_RENDER_REQUEST_REGEX = /\b(?:latex|formula)\b|формул|лате[хк]с/i
const DRAW_IMAGE_REQUEST_REGEX = /\b(?:draw|image)\b|нарис|картинк|изображ/i
const DIRECT_RENDER_ACTION_REGEX =
  /\b(?:draw|show|render|create|make|generate|plot|chart|diagram)\b|\u043d\u0430\u0440\u0438\u0441|\u043f\u043e\u043a\u0430\u0436|\u0441\u0433\u0435\u043d\u0435\u0440|\u0441\u043e\u0437\u0434\u0430|\u043f\u043e\u0441\u0442\u0440\u043e|\u043e\u0442\u0440\u0435\u043d\u0434\u0435\u0440/i
const HISTORY_MEDIA_REQUEST_REGEX =
  /\b(?:last|recent|previous|history)\b|последн|недавн|предыдущ|из истории|из чата|прошл/i

type ExecutableFunctionCall = {
  toolCallId: string
  name: string
  args: Record<string, unknown>
}

function getExecutableFunctionCalls(
  toolCalls:
    | Array<{ toolCallId: string; toolName: string; input: unknown }>
    | undefined,
): ExecutableFunctionCall[] {
  return (toolCalls ?? [])
    .filter(
      (
        call,
      ): call is { toolCallId: string; toolName: string; input: unknown } =>
        typeof call.toolName === 'string' && call.toolName.length > 0,
    )
    .map((call) => ({
      toolCallId: call.toolCallId,
      name: call.toolName,
      args:
        call.input &&
        typeof call.input === 'object' &&
        !Array.isArray(call.input)
          ? (call.input as Record<string, unknown>)
          : {},
    }))
}

function getHistoryMediaPrompt(message: Message): string {
  const sourceText = (message.caption || message.text || '').trim()
  return sourceText
    ? `Context image from recent chat history. Related message text: ${sourceText.slice(0, 200)}`
    : 'Context image from recent chat history.'
}

function getToolModel(toolName: string): string {
  if (toolName === GENERATE_IMAGE_TOOL_NAME && getToolCommandName() === 'ge') {
    return GEMINI_FLASH_LITE_IMAGE_MODEL.model
  }

  return TOOL_MODELS[toolName] ?? 'none'
}

export function filterToolsForRequest(
  agentTools: AgentTool[],
  textContent: string,
): AgentTool[] {
  if (!RENDER_REQUEST_REGEX.test(textContent)) {
    return agentTools
  }

  const allowedToolNames = new Set<string>()

  if (LATEX_RENDER_REQUEST_REGEX.test(textContent)) {
    allowedToolNames.add(RENDER_LATEX_TOOL_NAME)
  }

  if (SVG_RENDER_REQUEST_REGEX.test(textContent)) {
    allowedToolNames.add(RENDER_SVG_TOOL_NAME)
  }

  if (!allowedToolNames.size && DRAW_IMAGE_REQUEST_REGEX.test(textContent)) {
    allowedToolNames.add(GENERATE_IMAGE_TOOL_NAME)
  }

  if (!allowedToolNames.size) {
    allowedToolNames.add(RENDER_SVG_TOOL_NAME)
  }

  return agentTools.filter((tool) =>
    allowedToolNames.has(tool.declaration.name ?? ''),
  )
}

export function shouldIncludeHistoryMediaInModel(
  textContent: string,
  hasReplyTarget: boolean,
): boolean {
  return !hasReplyTarget && HISTORY_MEDIA_REQUEST_REGEX.test(textContent)
}

export function shouldUseDirectSvgRender(
  agentTools: AgentTool[],
  textContent: string,
  hasMedia: boolean,
  hasReplyTarget: boolean,
): boolean {
  return (
    !hasMedia &&
    !hasReplyTarget &&
    SVG_RENDER_REQUEST_REGEX.test(textContent) &&
    DIRECT_RENDER_ACTION_REGEX.test(textContent) &&
    agentTools.some((tool) => tool.declaration.name === RENDER_SVG_TOOL_NAME)
  )
}

function stripLeadingCommand(text: string): string {
  const normalized = text.trim()
  return normalized.replace(/^\/[A-Za-z0-9_]+(?:@[A-Za-z0-9_]+)?\s*/, '').trim()
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function wrapSvgText(text: string, maxLineLength = 42, maxLines = 4): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ')
  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (next.length > maxLineLength && current) {
      lines.push(current)
      current = word
      if (lines.length === maxLines) break
      continue
    }
    current = next
  }

  if (current && lines.length < maxLines) lines.push(current)
  return lines.length ? lines : ['SVG render']
}

function buildFallbackSvg(textContent: string): string {
  const prompt = stripLeadingCommand(textContent) || textContent.trim()
  const titleLines = wrapSvgText(prompt.slice(0, 180))
  const textSpans = titleLines
    .map(
      (line, index) =>
        `<tspan x="600" dy="${index === 0 ? 0 : 36}">${escapeXml(line)}</tspan>`,
    )
    .join('')

  if (
    !/(?:pelican|bicycle|bike|\u043f\u0435\u043b\u0438\u043a\u0430\u043d|\u0432\u0435\u043b\u043e)/i.test(
      prompt,
    )
  ) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800" role="img" aria-label="Generated SVG fallback">
  <rect width="1200" height="800" fill="#f8fafc"/>
  <rect x="90" y="90" width="1020" height="620" rx="28" fill="#ffffff" stroke="#1f2937" stroke-width="6"/>
  <path d="M170 570 C270 500 370 540 470 460 C570 380 680 445 780 350 C885 250 975 290 1030 210" fill="none" stroke="#2563eb" stroke-width="24" stroke-linecap="round"/>
  <circle cx="260" cy="520" r="30" fill="#f97316"/>
  <circle cx="470" cy="460" r="30" fill="#10b981"/>
  <circle cx="780" cy="350" r="30" fill="#8b5cf6"/>
  <circle cx="1030" cy="210" r="30" fill="#ef4444"/>
  <text x="600" y="190" text-anchor="middle" font-family="Arial, sans-serif" font-size="40" font-weight="700" fill="#102a43">${textSpans}</text>
  <text x="600" y="650" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" fill="#475569">SVG fallback render</text>
</svg>`
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800" role="img" aria-label="Generated SVG sketch">
  <rect width="1200" height="800" fill="#f7fbff"/>
  <circle cx="960" cy="150" r="86" fill="#ffe08a"/>
  <path d="M0 670 C180 590 330 650 505 600 C720 538 850 610 1200 535 L1200 800 L0 800 Z" fill="#b7e4c7"/>
  <path d="M0 710 C190 650 405 710 600 660 C790 612 960 660 1200 615 L1200 800 L0 800 Z" fill="#74c69d"/>
  <circle cx="430" cy="590" r="92" fill="none" stroke="#1f2937" stroke-width="18"/>
  <circle cx="760" cy="590" r="92" fill="none" stroke="#1f2937" stroke-width="18"/>
  <path d="M430 590 L560 455 L665 590 L515 590 L610 500 L760 590" fill="none" stroke="#1f2937" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M560 455 L545 405 M610 500 L655 405 M655 405 L710 405" stroke="#1f2937" stroke-width="16" stroke-linecap="round"/>
  <ellipse cx="590" cy="340" rx="155" ry="118" fill="#ffffff" stroke="#1f2937" stroke-width="12"/>
  <path d="M462 340 C395 410 385 500 468 535 C538 565 617 520 640 450 C575 458 510 425 462 340 Z" fill="#d8f3dc" stroke="#1f2937" stroke-width="10"/>
  <circle cx="700" cy="250" r="72" fill="#ffffff" stroke="#1f2937" stroke-width="12"/>
  <circle cx="724" cy="235" r="9" fill="#111827"/>
  <path d="M756 260 C875 250 944 285 1008 330 C920 365 825 350 752 306 Z" fill="#ffb703" stroke="#1f2937" stroke-width="10" stroke-linejoin="round"/>
  <path d="M768 304 C845 340 905 370 930 438 C850 428 790 382 752 318 Z" fill="#ffd166" stroke="#1f2937" stroke-width="8"/>
  <path d="M625 442 C620 520 575 548 552 592 M660 438 C672 508 725 532 757 592" stroke="#1f2937" stroke-width="14" stroke-linecap="round"/>
  <text x="600" y="120" text-anchor="middle" font-family="Arial, sans-serif" font-size="38" font-weight="700" fill="#102a43">${textSpans}</text>
</svg>`
}

export function extractSvgMarkup(text: string): string {
  const fencedMatch = text.match(
    /```(?:svg|xml)?\s*([\s\S]*?<svg[\s\S]*?<\/svg>)\s*```/i,
  )
  const candidate = fencedMatch?.[1] ?? text
  const svgMatch = candidate.match(/<svg[\s\S]*?<\/svg>/i)
  return svgMatch?.[0]?.trim() ?? ''
}

async function generateDirectSvg(
  textContent: string,
  chatId: number,
): Promise<{ svg: string; source: 'model' | 'fallback' }> {
  const userRequest = stripLeadingCommand(textContent) || textContent.trim()

  try {
    const result = await generateModelWithRetryWithInfo(
      {
        prompt: [
          'Create exactly one complete, self-contained SVG for a Telegram image reply.',
          'Return only raw SVG markup. Do not use Markdown fences or explanations.',
          'Use width="1200", height="800", viewBox="0 0 1200 800", and xmlns.',
          'Use only inline SVG shapes, paths, gradients, and text. No scripts, foreignObject, external href/src, image tags, data URLs, or external fonts.',
          'Make the composition readable at Telegram chat size.',
          `User request: ${userRequest}`,
        ].join('\n'),
        providerOptions: getChatProviderOptions(
          HELPER_TEXT_MODEL_CONFIG,
          chatId,
        ),
      },
      chatId,
      'direct_svg',
      HELPER_TEXT_MODEL_CONFIG,
      DIRECT_SVG_MODEL_TIMEOUT_MS,
    )

    const svg = extractSvgMarkup(result.response.text)
    if (svg) {
      return { svg, source: 'model' }
    }

    logger.warn(
      {
        chatId,
        model: result.model,
        textLength: result.response.text.length,
      },
      'loop.direct_svg_empty',
    )
  } catch (error) {
    logger.warn(
      { chatId, error: extractErrorInfo(error) },
      'loop.direct_svg_model_failed',
    )
  }

  return { svg: buildFallbackSvg(textContent), source: 'fallback' }
}

async function runDirectSvgRender(
  textContent: string,
  toolByName: Map<string, AgentTool>,
  chatId: number,
): Promise<string> {
  const renderTool = toolByName.get(RENDER_SVG_TOOL_NAME)
  if (!renderTool) {
    return 'Error rendering SVG: render tool is not available'
  }

  const { svg, source } = await generateDirectSvg(textContent, chatId)
  logger.info({ chatId, source }, 'loop.direct_svg_generated')
  return renderTool.execute({
    svg,
    width: 1200,
    height: 800,
    backgroundColor: '#ffffff',
    caption: stripLeadingCommand(textContent).slice(0, 1000),
  })
}

function getToolResultStatus(result: string): MetricStatus {
  const normalized = result.trim().toLowerCase()
  if (normalized.includes('timed out')) return 'timeout'
  if (
    normalized.startsWith('error ') ||
    normalized.startsWith('error:') ||
    normalized.startsWith('error generating image:') ||
    normalized.startsWith('error generating voice:') ||
    normalized.startsWith('url read failed:') ||
    normalized.startsWith('code execution failed:') ||
    normalized.includes('the user provided python code') ||
    normalized.includes('the tool_code block executed') ||
    normalized.includes(
      'i have no further questions and the output is generated',
    ) ||
    normalized.startsWith('could not ') ||
    normalized.includes(' failed:') ||
    normalized.includes(' no output') ||
    normalized.includes('cannot be empty')
  ) {
    return 'error'
  }
  return 'success'
}

export function extractFallbackTextFromToolResults(
  toolResults: string[],
): string {
  const successfulResults = toolResults
    .map((result) => result.trim())
    .filter(Boolean)
    .filter((result) => getToolResultStatus(result) === 'success')

  if (!successfulResults.length) {
    return ''
  }

  return cleanModelMessage(successfulResults.join('\n\n'))
    .slice(0, TOOL_RESULT_FALLBACK_MAX_CHARS)
    .trim()
}

function parseToolArguments(
  rawArguments: Record<string, unknown>,
  chatId: number,
  toolName: string,
): { ok: true; args: Record<string, unknown> } | { ok: false; result: string } {
  if (
    !rawArguments ||
    typeof rawArguments !== 'object' ||
    Array.isArray(rawArguments)
  ) {
    const result = `Error: invalid tool arguments for "${toolName}". Arguments must be an object.`
    logger.warn(
      { chatId, tool: toolName, rawArguments },
      'tool.arguments_parse_failed',
    )
    return { ok: false, result }
  }

  return { ok: true, args: rawArguments }
}

async function executeToolCall(
  toolCall: ExecutableFunctionCall,
  toolByName: Map<string, AgentTool>,
  chatId: number,
): Promise<{ name: string; result: string }> {
  const name = toolCall.name
  const tool = toolByName.get(name)
  if (!tool) return { name, result: `Error: tool "${name}" not found` }

  const model = getToolModel(name)
  const parsedArgs = parseToolArguments(toolCall.args, chatId, name)
  if (!parsedArgs.ok) {
    void recordMetric({
      type: 'tool_call',
      source: 'agentic',
      name,
      model,
      chatId,
      durationMs: 0,
      success: false,
      status: 'error',
      timestamp: Date.now(),
    })
    return { name, result: parsedArgs.result }
  }

  const args = parsedArgs.args
  logger.info({ chatId, tool: name, model, payload: args }, 'tool.call')

  const toolStart = Date.now()
  try {
    const timeout = tool.timeoutMs ?? TOOL_CALL_TIMEOUT_MS
    const result = await withTimeout(
      tool.execute(args),
      timeout,
      `Tool timed out after ${timeout}ms`,
    )

    const durationMs = Date.now() - toolStart
    const status = getToolResultStatus(result)
    if (status === 'success') {
      logger.info(
        { chatId, tool: name, model, durationMs, result },
        'tool.done',
      )
    } else {
      logger.warn(
        { chatId, tool: name, model, durationMs, result, status },
        'tool.done_non_success',
      )
    }
    void recordMetric({
      type: 'tool_call',
      source: 'agentic',
      name,
      model,
      chatId,
      durationMs,
      success: status === 'success',
      status,
      timestamp: Date.now(),
    })
    return { name, result }
  } catch (error) {
    const durationMs = Date.now() - toolStart
    const errorMsg = error instanceof Error ? error.message : String(error)
    const status = getMetricStatusFromError(error)
    logger.error(
      { chatId, tool: name, model, durationMs, error: errorMsg, status },
      'tool.failed',
    )
    void recordMetric({
      type: 'tool_call',
      source: 'agentic',
      name,
      model,
      chatId,
      durationMs,
      success: false,
      status,
      timestamp: Date.now(),
    })
    return { name, result: `Error: ${errorMsg}` }
  }
}

async function executeToolCalls(
  calls: ExecutableFunctionCall[],
  toolByName: Map<string, AgentTool>,
  chatId: number,
): Promise<
  Array<{ call: ExecutableFunctionCall; name: string; result: string }>
> {
  const run = (call: ExecutableFunctionCall) =>
    executeToolCall(call, toolByName, chatId).then((r) => ({
      call,
      ...r,
    }))

  // Run sequentially when search-backed tools are present (rate limiting).
  if (calls.some((c) => RATE_LIMITED_TOOLS.has(c.name))) {
    const results: Array<{
      call: ExecutableFunctionCall
      name: string
      result: string
    }> = []
    for (const call of calls) results.push(await run(call))
    return results
  }

  return Promise.all(calls.map(run))
}

function extractErrorInfo(error: unknown): unknown {
  if (!(error instanceof Error)) return error
  const record = error as unknown as Record<string, unknown>
  return {
    name: error.name,
    message: error.message,
    ...('status' in error ? { status: record.status } : {}),
    ...('statusText' in error ? { statusText: record.statusText } : {}),
    ...('errorDetails' in error ? { errorDetails: record.errorDetails } : {}),
  }
}

async function preloadWithFallback<T>(params: {
  chatId: number
  name: string
  load: () => Promise<T>
  fallback: T
}): Promise<T> {
  const startedAt = Date.now()
  try {
    return await withTimeout(
      params.load(),
      AGENT_PRELOAD_TIMEOUT_MS,
      new Error(
        `${params.name} preload timed out after ${AGENT_PRELOAD_TIMEOUT_MS}ms`,
      ),
    )
  } catch (error) {
    logger.warn(
      {
        chatId: params.chatId,
        name: params.name,
        durationMs: Date.now() - startedAt,
        error: extractErrorInfo(error),
      },
      'loop.preload_failed',
    )
    return params.fallback
  }
}

function getLoopFailureReply(error: unknown): string {
  if (error instanceof ModelCallTimeoutError || isRetryableModelError(error)) {
    return 'Сервис ответа сейчас перегружен. Попробуй ещё раз чуть позже.'
  }
  return 'Что-то пошло не так 😵'
}

// ── Content building ─────────────────────────────────────────

function hasOwnTextContent(message: Message): boolean {
  return Boolean((message.text || message.caption || '').trim())
}

export function getAgentDeliveryReplyMessageId(
  message: Message,
  preferReplyTargetForEmptyText = false,
): number | undefined {
  const messageId = message.message_id
  const replyMessageId = message.reply_to_message?.message_id

  if (
    preferReplyTargetForEmptyText &&
    typeof replyMessageId === 'number' &&
    !hasOwnTextContent(message)
  ) {
    return replyMessageId
  }

  return typeof messageId === 'number' ? messageId : replyMessageId
}

type UserContentPart = Exclude<UserModelMessage['content'], string>[number]

function pushImageContent(
  parts: UserContentPart[],
  label: string,
  media: MediaBuffer,
) {
  parts.push({ type: 'text', text: label })
  parts.push({
    type: 'image',
    image: media.buffer,
    mediaType: media.mimeType,
  })
}

function buildInitialInput(
  message: Message,
  textContent: string,
  mediaBuffers: MediaBuffer[] | undefined,
  historyMediaAttachments: HistoryMediaAttachment[],
): ModelMessage[] {
  const parts: UserContentPart[] = []

  for (const media of mediaBuffers ?? []) {
    pushImageContent(parts, media.label || 'Request media', media)
  }

  if (message.reply_to_message) {
    const replyText =
      message.reply_to_message.text || message.reply_to_message.caption
    const replyId = message.reply_to_message.message_id
    const replyLabel =
      typeof replyId === 'number'
        ? `Telegram reply target message_id=${replyId}`
        : 'Telegram reply target'

    parts.push({
      type: 'text',
      text: `${replyLabel}: ${replyText || '[media]'}`,
    })
  }

  for (const { media, message: srcMsg } of historyMediaAttachments) {
    pushImageContent(parts, getHistoryMediaPrompt(srcMsg), media)
  }

  parts.push({
    type: 'text',
    text: textContent || '[User sent media without text]',
  })

  return [{ role: 'user', content: parts }]
}

// ── Model loop ───────────────────────────────────────────────

function buildFunctionResponsePart(
  call: ExecutableFunctionCall,
  output: string,
) {
  return {
    type: 'tool-result' as const,
    toolCallId: call.toolCallId,
    toolName: call.name,
    output: { type: 'text' as const, value: output },
  }
}

function getChatProviderOptions(modelConfig: AiModelConfig, chatId: number) {
  const isPrimaryChatModel =
    modelConfig.provider === CHAT_MODEL_CONFIG.provider &&
    modelConfig.model === CHAT_MODEL_CONFIG.model

  return getAiSdkProviderOptions(modelConfig, {
    reasoningEffort: isPrimaryChatModel
      ? CHAT_MODEL_REASONING_EFFORT
      : CHAT_FALLBACK_REASONING_EFFORT,
    chatId,
    store: false,
    serviceTier: modelConfig.provider === 'google' ? 'priority' : undefined,
  })
}

async function runToolLoop(
  input: ModelMessage[],
  systemInstruction: string,
  tools: ToolSet,
  toolByName: Map<string, AgentTool>,
  chatId: number,
): Promise<{ finalText: string; toolResults: string[] }> {
  let finalText = ''
  const toolResults: string[] = []
  let activeModelConfig = CHAT_MODEL_CONFIG
  let activeModel = CHAT_MODEL_LABEL

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    let modelResult: GenerateModelWithRetryResult<ToolSet>
    try {
      modelResult = await generateModelWithRetryWithInfo(
        {
          messages: input,
          system: systemInstruction,
          tools: Object.keys(tools).length ? tools : undefined,
          toolChoice: 'auto',
          providerOptions: getChatProviderOptions(activeModelConfig, chatId),
        },
        chatId,
        iteration === 0 ? 'routing' : `iteration_${iteration}`,
        activeModelConfig,
        AGENT_ROUTING_MODEL_TIMEOUT_MS,
      )
    } catch (error) {
      if (
        iteration > 0 &&
        (toolResults.length || getCollectedResponses().length)
      ) {
        logger.warn(
          {
            chatId,
            iteration,
            model: activeModel,
            error: extractErrorInfo(error),
          },
          'loop.model_iteration_failed_after_tools',
        )
        break
      }

      throw error
    }
    activeModelConfig = modelResult.modelConfig
    activeModel = modelResult.model
    const { response } = modelResult

    const responseMessages = response.response.messages as ModelMessage[]
    const functionCalls = getExecutableFunctionCalls(response.toolCalls)
    logger.info(
      {
        chatId,
        model: activeModel,
        ...(modelResult.fallbackFrom
          ? { fallbackFrom: modelResult.fallbackFrom }
          : {}),
        iteration,
        outputTypes: response.content.map((part) => part.type),
        functionCalls: functionCalls.map((call) => call.name),
        usedWebSearch: functionCalls.some((call) => call.name === 'web_search'),
      },
      'loop.model_response',
    )
    const text = response.text.trim()

    if (text) finalText = text
    if (functionCalls.length === 0) break

    // If a round has both data-gathering and content-creating tools, defer
    // content tools so they run after data is available in the next iteration.
    const dataCalls = functionCalls.filter((fc) => !CONTENT_TOOLS.has(fc.name))
    const contentCalls = functionCalls.filter((fc) =>
      CONTENT_TOOLS.has(fc.name),
    )
    const hasDeferred = dataCalls.length > 0 && contentCalls.length > 0
    const callsToExecute = hasDeferred ? dataCalls : functionCalls

    if (hasDeferred) {
      logger.info(
        {
          chatId,
          model: activeModel,
          iteration,
          deferred: contentCalls.map((fc) => fc.name),
        },
        'loop.deferred_content_tools',
      )
    }

    input.push(...responseMessages)

    const executionResults = await executeToolCalls(
      callsToExecute,
      toolByName,
      chatId,
    )
    toolResults.push(...executionResults.map((tr) => tr.result))

    const functionResponses = [
      ...executionResults.map((tr) =>
        buildFunctionResponsePart(tr.call, tr.result),
      ),
      ...(hasDeferred
        ? contentCalls.map((fc) =>
            buildFunctionResponsePart(
              fc,
              'NOT EXECUTED YET - data was just fetched. Call this tool again now with the actual data.',
            ),
          )
        : []),
    ]

    const allTerminal = callsToExecute.every((fc) =>
      TERMINAL_TOOLS.has(fc.name),
    )
    if (allTerminal && getCollectedResponses().length > 0 && !hasDeferred) {
      logger.info(
        {
          chatId,
          model: activeModel,
          tools: callsToExecute.map((fc) => fc.name),
        },
        'loop.terminal_tools_skip',
      )
      break
    }

    input.push({ role: 'tool', content: functionResponses })
  }

  // If no text came out of the loop, force a final synthesis pass without tools.
  if (!finalText.trim()) {
    try {
      const finalizeResult = await generateModelWithRetryWithInfo(
        {
          messages: [
            ...input,
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Provide the final user-facing answer now. Use plain text only and do not call tools. Use successful tool results as the primary evidence. If any tool failed or timed out, explicitly say you could not verify that part instead of guessing.',
                },
              ],
            },
          ],
          system: systemInstruction,
          toolChoice: 'none',
          providerOptions: getChatProviderOptions(activeModelConfig, chatId),
        },
        chatId,
        'finalize',
        activeModelConfig,
      )
      activeModelConfig = finalizeResult.modelConfig
      activeModel = finalizeResult.model
      const finalizeResponse = finalizeResult.response
      const finalizeText = finalizeResponse.text.trim()
      if (finalizeText) {
        finalText = finalizeText
      } else {
        logger.warn({ chatId, model: activeModel }, 'loop.finalize_empty')
      }
    } catch (error) {
      logger.warn(
        { chatId, model: activeModel, error: extractErrorInfo(error) },
        'loop.finalize_failed',
      )
    }
  }

  return { finalText, toolResults }
}

// ── Main entry ───────────────────────────────────────────────

export async function runAgenticLoop(
  message: Message,
  api: TelegramApi,
  mediaBuffers?: MediaBuffer[],
  botInfo?: BotIdentity,
  options: { bypassReplyGate?: boolean; commandName?: string } = {},
): Promise<void> {
  const startedAt = Date.now()
  const chatId = message.chat?.id
  if (!chatId) {
    logger.error({ reason: 'missing_chat_id' }, 'loop.invalid_input')
    return
  }

  const messageMeta = getMessageLogMeta(message)
  const deliveryReplyMessageId = getAgentDeliveryReplyMessageId(
    message,
    Boolean(options.bypassReplyGate),
  )
  logger.info(
    {
      ...messageMeta,
      model: CHAT_MODEL_LABEL,
      reasoningEffort: CHAT_MODEL_REASONING_EFFORT,
      replyGateModel: REPLY_GATE_MODEL,
    },
    'loop.start',
  )

  let stopTyping: (() => void) | undefined
  let stopThinkingDraft: (() => void) | undefined
  const runInToolContext = <T>(callback: () => Promise<T>): Promise<T> =>
    runWithToolContext(
      message,
      mediaBuffers,
      callback,
      api,
      options.commandName,
    )

  try {
    await runInToolContext(async () => {
      const textContent = message.text || message.caption || ''
      const hasMedia =
        !!mediaBuffers?.length || collectMediaFileRefs(message).length > 0

      const dynamicCommand = await executeDynamicCommandFromMessage(message)
      if (dynamicCommand.matched) {
        const responsesToSend: AgentResponse[] = [...getCollectedResponses()]
        const hasTextResponse = responsesToSend.some(
          (response) => response.type === 'text',
        )
        if (!hasTextResponse) {
          responsesToSend.push({
            type: 'text',
            text: cleanModelMessage(
              dynamicCommand.result ||
                `Команда /${dynamicCommand.name} ничего не вернула.`,
            ),
          })
        }

        const deliveryStart = Date.now()
        await sendResponses({
          responses: responsesToSend,
          chatId,
          replyToMessageId: deliveryReplyMessageId,
          api,
        })

        logger.info(
          {
            ...messageMeta,
            durationMs: Date.now() - startedAt,
            deliveryDurationMs: Date.now() - deliveryStart,
            commandName: dynamicCommand.name,
            ...(dynamicCommand.model ? { model: dynamicCommand.model } : {}),
            responseCount: responsesToSend.length,
          },
          'loop.dynamic_command_done',
        )
        return
      }

      // Load memory first — needed by the reply gate
      const [chatMemory, globalMemory] = await Promise.all([
        preloadWithFallback({
          chatId,
          name: 'chat_memory',
          load: () => getChatMemory(chatId),
          fallback: '',
        }),
        preloadWithFallback({
          chatId,
          name: 'global_memory',
          load: getGlobalMemory,
          fallback: '',
        }),
      ])
      const memoryBlock = buildMemoryBlock(chatMemory, globalMemory)

      if (options.bypassReplyGate) {
        logger.info(
          { ...messageMeta, reason: 'explicit_command' },
          'loop.reply_gate_bypassed',
        )
      } else {
        const shouldRespond = await shouldEngageWithMessage({
          message,
          textContent,
          hasMedia,
          memoryBlock,
          botInfo,
        })
        if (!shouldRespond) {
          logger.info(
            { ...messageMeta, reason: 'reply_gate', model: REPLY_GATE_MODEL },
            'loop.skipped',
          )
          return
        }
      }

      void api
        .setMessageReaction?.(chatId, message.message_id, [
          { type: 'emoji', emoji: AGENT_REACTION },
        ])
        .catch(() => undefined)

      stopThinkingDraft = startThinkingRichDraftIndicator({
        api,
        message,
        onError: (error) =>
          logger.warn({ chatId, error }, 'rich_thinking.failed'),
      })

      stopTyping = startTypingIndicator({
        chatId,
        sendChatAction: api.sendChatAction?.bind(api),
        onError: (error) => logger.warn({ chatId, error }, 'typing.failed'),
      })

      // Load tools + history in parallel (only after gate confirms we'll respond)
      const preloadStartedAt = Date.now()
      logger.info({ ...messageMeta }, 'loop.preload_start')
      const [loadedAgentTools, rawHistory] = await Promise.all([
        preloadWithFallback({
          chatId,
          name: 'agent_tools',
          load: () => getAgentTools(chatId),
          fallback: getBaseAgentTools(),
        }),
        preloadWithFallback({
          chatId,
          name: 'recent_history',
          load: () =>
            getRecentRawHistory(chatId, DEFAULT_AGENT_HISTORY_LIMIT + 1),
          fallback: [] as Message[],
        }),
      ])
      const agentTools = filterToolsForRequest(loadedAgentTools, textContent)
      logger.info(
        {
          ...messageMeta,
          durationMs: Date.now() - preloadStartedAt,
          toolCount: agentTools.length,
          filteredToolCount: loadedAgentTools.length - agentTools.length,
          historyCount: rawHistory.length,
        },
        'loop.preload_done',
      )

      const recentHistory = getRecentHistoryContext(
        rawHistory,
        message.message_id,
      )
      const requestMediaFileIds = new Set(
        (mediaBuffers ?? [])
          .map(({ fileId }) => fileId)
          .filter((id): id is string => Boolean(id)),
      )
      const requestMediaFileUniqueIds = new Set(
        (mediaBuffers ?? [])
          .map(({ fileUniqueId }) => fileUniqueId)
          .filter((id): id is string => Boolean(id)),
      )

      const historyImageRefs = collectHistoryMediaFileRefs(rawHistory, {
        excludeMessageId: message.message_id,
        excludeFileIds: requestMediaFileIds,
        excludeFileUniqueIds: requestMediaFileUniqueIds,
        limit: DEFAULT_AGENT_HISTORY_LIMIT,
        mediaTypes: ['image'],
      }).slice(-MAX_HISTORY_IMAGE_ATTACHMENTS)

      const historyMediaAttachments = historyImageRefs.length
        ? await resolveHistoryMediaAttachments(historyImageRefs, api).catch(
            (error) => {
              logger.warn({ chatId, error }, 'history.media_preload_failed')
              return [] as HistoryMediaAttachment[]
            },
          )
        : []

      const historyMediaBuffers = historyMediaAttachments.map(
        ({ media, message: sourceMessage }) => ({
          ...media,
          label: getHistoryMediaPrompt(sourceMessage),
        }),
      )
      const allMediaBuffers = [...(mediaBuffers ?? []), ...historyMediaBuffers]
      const includeHistoryMediaInModel = shouldIncludeHistoryMediaInModel(
        textContent,
        Boolean(message.reply_to_message),
      )
      const modelMediaBuffers = includeHistoryMediaInModel
        ? allMediaBuffers
        : (mediaBuffers ?? [])
      const modelHistoryMediaAttachments = includeHistoryMediaInModel
        ? historyMediaAttachments
        : []
      await withToolMediaBuffers(allMediaBuffers, async () => {
        const contextBlock = buildContextBlock(
          message,
          textContent,
          hasMedia,
          modelMediaBuffers,
          {
            recentHistory,
          },
        )
        const systemInstruction = buildSystemInstruction(
          contextBlock,
          memoryBlock,
        )
        const tools = buildNativeTools(agentTools)
        const toolByName = new Map<string, AgentTool>(
          agentTools
            .filter(
              (t) => t.exposeToModel !== false && t.declaration.name != null,
            )
            .map((t) => [t.declaration.name ?? '', t]),
        )
        logger.info(
          {
            chatId,
            model: CHAT_MODEL_LABEL,
            reasoningEffort: CHAT_MODEL_REASONING_EFFORT,
            exposedTools: Object.keys(tools),
            hiddenTools: agentTools
              .filter((tool) => tool.exposeToModel === false)
              .map((tool) => tool.declaration.name),
          },
          'loop.tools_ready',
        )

        if (
          shouldUseDirectSvgRender(
            agentTools,
            textContent,
            hasMedia,
            Boolean(message.reply_to_message),
          )
        ) {
          const directToolResult = await runDirectSvgRender(
            textContent,
            toolByName,
            chatId,
          )
          const { textDrafts, mediaResponses } = splitResponses(
            getCollectedResponses(),
          )
          const responsesToSend: AgentResponse[] = [...mediaResponses]
          const combinedText =
            textDrafts.join('\n\n').trim() ||
            (mediaResponses.length ? '' : cleanModelMessage(directToolResult))

          if (combinedText) {
            responsesToSend.push({ type: 'text', text: combinedText })
          }

          if (responsesToSend.length === 0) {
            responsesToSend.push({
              type: 'text',
              text: 'Could not render SVG for this request.',
            })
          }

          const deliveryStart = Date.now()
          await sendResponses({
            responses: responsesToSend,
            chatId,
            replyToMessageId: deliveryReplyMessageId,
            api,
          })

          logger.info(
            {
              ...messageMeta,
              model: CHAT_MODEL_LABEL,
              reasoningEffort: CHAT_MODEL_REASONING_EFFORT,
              durationMs: Date.now() - startedAt,
              deliveryDurationMs: Date.now() - deliveryStart,
              responseCount: responsesToSend.length,
              inputMediaCount: modelMediaBuffers.length,
              outputMediaCount: mediaResponses.length,
              hasFinalText: Boolean(combinedText),
            },
            'loop.direct_svg_done',
          )
          return
        }

        const input = buildInitialInput(
          message,
          textContent,
          mediaBuffers,
          modelHistoryMediaAttachments,
        )

        const { finalText, toolResults } = await runToolLoop(
          input,
          systemInstruction,
          tools,
          toolByName,
          chatId,
        )

        // Collect any responses produced by tools (media, text drafts, etc.)
        const { textDrafts, mediaResponses } = splitResponses(
          getCollectedResponses(),
        )
        const responsesToSend: AgentResponse[] = [...mediaResponses]

        const allTextParts: string[] = [...textDrafts]
        if (finalText.trim()) {
          allTextParts.push(cleanModelMessage(finalText))
        } else if (allTextParts.length === 0 && mediaResponses.length === 0) {
          const fallbackText = extractFallbackTextFromToolResults(toolResults)
          if (fallbackText) {
            allTextParts.push(fallbackText)
            logger.warn(
              {
                ...messageMeta,
                model: CHAT_MODEL_LABEL,
                toolResultCount: toolResults.length,
              },
              'loop.tool_result_fallback_text',
            )
          }
        }

        const combinedText = allTextParts.join('\n\n').trim()
        if (combinedText)
          responsesToSend.push({ type: 'text', text: combinedText })

        if (responsesToSend.length === 0) {
          responsesToSend.push({
            type: 'text',
            text: 'Не смог собрать ответ по этому запросу. Попробуй переформулировать.',
          })
          logger.warn(
            {
              ...messageMeta,
              model: CHAT_MODEL_LABEL,
              durationMs: Date.now() - startedAt,
            },
            'loop.no_response_fallback_text',
          )
        }

        const deliveryStart = Date.now()
        await sendResponses({
          responses: responsesToSend,
          chatId,
          replyToMessageId: deliveryReplyMessageId,
          api,
        })

        logger.info(
          {
            ...messageMeta,
            model: CHAT_MODEL_LABEL,
            reasoningEffort: CHAT_MODEL_REASONING_EFFORT,
            durationMs: Date.now() - startedAt,
            deliveryDurationMs: Date.now() - deliveryStart,
            responseCount: responsesToSend.length,
            inputMediaCount: modelMediaBuffers.length,
            outputMediaCount: mediaResponses.length,
            hasFinalText: Boolean(combinedText),
          },
          'loop.done',
        )
      })
    })
  } catch (error) {
    logger.error(
      {
        ...messageMeta,
        model: CHAT_MODEL_LABEL,
        reasoningEffort: CHAT_MODEL_REASONING_EFFORT,
        durationMs: Date.now() - startedAt,
        error: extractErrorInfo(error),
      },
      'loop.failed',
    )
    try {
      const replyOptions =
        typeof deliveryReplyMessageId === 'number'
          ? { reply_parameters: { message_id: deliveryReplyMessageId } }
          : undefined
      await api.sendMessage(chatId, getLoopFailureReply(error), replyOptions)
    } catch (sendError) {
      logger.error({ chatId, sendError }, 'loop.error_reply_failed')
    }
  } finally {
    stopThinkingDraft?.()
    stopTyping?.()
  }
}
