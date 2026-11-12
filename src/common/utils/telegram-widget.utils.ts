import { deflateSync } from 'node:zlib'
import type { Api } from 'grammy'
import type { Chat, Message } from 'grammy/types'

import { logger } from '../logger'

interface SendWidgetParams {
  chat_id: number
  html: string
  caption?: string
  parse_mode?: 'MarkdownV2'
  message_thread_id?: number
  reply_parameters?: { message_id: number }
}

/** grammY 1.46 predates Bot API 10.4; its raw API proxy forwards any method. */
type WidgetRawApi = {
  sendWidget(params: SendWidgetParams): Promise<Message>
}

// Telegram theme colors with light fallbacks, and the card every widget uses.
const BASE_STYLE = `
:root{--bg:var(--tg-theme-bg-color,#fff);--tx:var(--tg-theme-text-color,#111);--ht:var(--tg-theme-hint-color,#8e8e93);--ac:var(--tg-theme-button-color,#3390ec);--sf:var(--tg-theme-secondary-bg-color,#f1f1f4);--ln:var(--tg-theme-section-separator-color,#e2e2e6);--spring:cubic-bezier(.34,1.56,.64,1);--ease:cubic-bezier(.2,.9,.3,1)}
body{margin:0;padding:8px 8px var(--tg-content-safe-area-inset-bottom,0px);background:var(--bg);color:var(--tx);font:14px/1.3 system-ui,sans-serif;font-variant-numeric:tabular-nums}
.card{margin-bottom:8px;padding:12px;border-radius:16px;background:var(--sf);overflow:hidden}
.ttl{font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--ht)}
.hd{display:flex;gap:8px;justify-content:space-between;align-items:baseline;margin-bottom:10px;font-size:15px;font-weight:700;white-space:nowrap}
.hd small{font-size:12px;font-weight:400;color:var(--ht)}
#tip{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:600;color:var(--ac)}
`

/** A ranked row: label, value, percent and a share bar underneath. */
export const WIDGET_ROW_HEIGHT = 34
export const WIDGET_ROW_STYLE = `
.r{position:relative;display:flex;gap:8px;align-items:center;box-sizing:border-box;height:${WIDGET_ROW_HEIGHT}px;padding-bottom:5px}
.r i{position:absolute;left:0;bottom:2px;height:3px;border-radius:2px;background:var(--ac);transform-origin:left}
.l{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}
.v{color:var(--ht);font-size:12px;white-space:nowrap}.p{width:40px;text-align:right;font-weight:700}
`

// onShow plays an intro once, when the widget is actually on screen. Intros
// animate transforms only: Telegram stops a widget that has more than 16
// translucent elements at once.
const BASE_SCRIPT = `
const T=window.TelegramWidget,$=(i)=>document.getElementById(i),A=(el,k,o)=>{try{el.animate(k,o)}catch(e){}}
const tick=()=>T&&T.HapticFeedback.selectionChanged()
const tween=(ms,f)=>{const t0=Date.now(),s=()=>{const p=Math.min(1,(Date.now()-t0)/ms);f(1-Math.pow(1-p,3));if(p<1)requestAnimationFrame(s)};s()}
const grow=(el,axis,delay)=>A(el,[{transform:'scale'+axis+'(0)'},{transform:'scale'+axis+'(1.1)',offset:.6},{transform:'none'}],{duration:800,delay,easing:'cubic-bezier(.2,.8,.2,1)',fill:'backwards'})
const bounce=(el)=>A(el,[{transform:'none'},{transform:'scaleY(1.15)'},{transform:'none'}],{duration:400,easing:'cubic-bezier(.34,1.56,.64,1)'})
const say=(text)=>{const tip=$('tip');tip.textContent=text;A(tip,[{transform:'translateY(6px)'},{transform:'none'}],{duration:260});tick()}
let shown=0
const onShow=(f)=>{const go=()=>{if(!shown++&&!matchMedia('(prefers-reduced-motion: reduce)').matches)f()};if(!T||T.isActive)go();else T.onEvent('activated',go)}
`

/** JSON that is safe to inline in a widget script, whatever the text holds. */
export const widgetJson = (value: unknown) =>
  JSON.stringify(value).replaceAll('<', '\\u003c')

const WIDGET_MAX_BYTES = 32_768
/** Telegram measures a widget after zlib compression at level 9. */
export const WIDGET_MAX_COMPRESSED_BYTES = 4096

export const widgetCompressedSize = (html: string) =>
  deflateSync(html, { level: 9 }).length

export const fitsWidgetLimits = (html: string) =>
  Buffer.byteLength(html) <= WIDGET_MAX_BYTES &&
  widgetCompressedSize(html) <= WIDGET_MAX_COMPRESSED_BYTES

/** Wraps a widget in the shared theme and script helpers. */
export function buildWidgetHtml(parts: {
  style: string
  body: string
  script: string
}): string {
  return `<!doctype html><html><head><style>${BASE_STYLE}${parts.style}</style></head><body>${parts.body}<script>${BASE_SCRIPT}${parts.script}</script></body></html>`
}

/**
 * Sends an HTML widget. Resolves to undefined when the chat cannot show one or
 * Telegram rejects it, so the caller can fall back to its plain reply.
 */
export async function trySendWidget(params: {
  api: Pick<Api, 'raw'>
  chat: Pick<Chat, 'id' | 'type'>
  html: string
  /** MarkdownV2 text shown under the widget; fixed widgets send none. */
  caption?: string
  replyId?: number
  messageThreadId?: number
}): Promise<Message | undefined> {
  const { api, chat, html, caption, replyId, messageThreadId } = params
  // Production Telegram delivers widgets only in the private chat with the bot.
  if (chat.type !== 'private') return undefined

  try {
    return await (api.raw as unknown as WidgetRawApi).sendWidget({
      chat_id: chat.id,
      html,
      ...(caption ? { caption, parse_mode: 'MarkdownV2' as const } : {}),
      ...(replyId ? { reply_parameters: { message_id: replyId } } : {}),
      ...(typeof messageThreadId === 'number'
        ? { message_thread_id: messageThreadId }
        : {}),
    })
  } catch (error) {
    logger.warn({ chatId: chat.id, error }, 'telegram.widget_send_failed')
    return undefined
  }
}
