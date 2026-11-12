import type { Message } from 'grammy/types'
import type { Api } from 'grammy/web'

import {
  escapeHtml,
  fmtMs,
  type MetricGroupSummary,
  type MetricsReport,
  shortModelName,
} from '@tg-bot/common'

const MAX_ROWS = 4
const ROW_HEIGHT = 34
const OK = '#34c759'
const TIMEOUT = '#ff9f0a'
const ERROR = '#ff3b30'
const HOUR_MS = 60 * 60 * 1000
const AXIS_STEPS = [1, 2, 3, 4, 5, 6, 8, 10]

interface SendWidgetParams {
  chat_id: number
  html: string
  message_thread_id?: number
  reply_parameters?: { message_id: number }
}

/** grammY 1.46 predates Bot API 10.4; its raw API proxy forwards any method. */
type WidgetRawApi = {
  sendWidget(params: SendWidgetParams): Promise<Message>
}

/** Whole units keep the HTML low-entropy for the 4 KB compressed limit. */
const share = (part: number, total: number, scale = 100) =>
  total ? Math.round((part / total) * scale) : 0

const healthClass = (ratio: number) =>
  ratio >= 0.95 ? 'ok' : ratio >= 0.8 ? 'to' : 'er'

const formatCount = (value: number) =>
  value >= 1000
    ? `${Number((value / 1000).toFixed(value >= 10_000 ? 0 : 1))}k`
    : String(Number(value.toFixed(1)))

/** Rounds the busiest bucket up to a readable axis maximum: 71 → 80. */
function chartMax(report: MetricsReport) {
  const value = Math.max(1, ...report.timeline.map((bucket) => bucket.count))
  const magnitude = 10 ** Math.floor(Math.log10(value))
  const step = AXIS_STEPS.find((candidate) => candidate * magnitude >= value)
  return (step ?? 10) * magnitude
}

/** Degrees where the success and timeout arcs of the health ring end. */
function ringStops(report: MetricsReport): [number, number] {
  const { success, timeout } = report.outcomes
  const total = report.totalOperations
  return [share(success, total, 360), share(success + timeout, total, 360)]
}

function renderHero(report: MetricsReport) {
  const { timeout, error } = report.outcomes
  const [okEnd, timeoutEnd] = ringStops(report)
  const ring = `conic-gradient(${OK} 0 ${okEnd}deg,${TIMEOUT} ${okEnd}deg ${timeoutEnd}deg,${ERROR} ${timeoutEnd}deg)`
  // Floor so a single failure never rounds up to a perfect 100%.
  const health = Math.floor(report.successRate * 1000) / 10
  const stat = (value: string, label: string, dot = '') =>
    `<div><b>${value}</b><small>${dot ? `<i class="d ${dot}"></i>` : ''}${label}</small></div>`

  return `<div class="card hero"><div class="ring" id="ring" style="background:${ring}"><div class="hole"><b>${health}%</b><small>healthy</small></div></div>
<div class="hs"><div class="ttl">AI operations · ${report.hours}h</div><div class="big"><b id="tot">${report.totalOperations}</b>ops</div>
<div class="kp">${stat(fmtMs(report.medianMs), 'median')}${stat(String(timeout), 'timeouts', timeout ? 'to' : '')}${stat(String(error), 'errors', error ? 'er' : '')}</div></div></div>`
}

function renderChart(report: MetricsReport) {
  const max = chartMax(report)
  const bucketHours = Math.round(
    (report.toMs - report.fromMs) / report.timeline.length / HOUR_MS,
  )
  const unit = bucketHours === 1 ? 'ops per hour' : `ops per ${bucketHours}h`

  return `<div class="card"><div class="hd"><span>Activity <small>${unit}</small></span><span id="tip"></span></div>
<div class="plot"><i class="gl" style="top:0"></i><i class="gl" style="top:50%"></i><i class="gl" style="bottom:0;border-top-style:solid"></i>
<span class="yl" style="top:0">${formatCount(max)}</span><span class="yl" style="top:50%">${formatCount(max / 2)}</span><span class="yl" style="top:100%">0</span>
<div class="bars" id="bars"></div></div>
<div class="ax"><span id="x0">-${report.hours}h</span><span id="x1">-${Math.round(report.hours / 2)}h</span><span><i class="lv"></i>now</span></div></div>`
}

function renderRows(groups: MetricGroupSummary[]) {
  const rows = groups.slice(0, MAX_ROWS)
  const max = Math.max(1, ...rows.map((group) => group.count))
  return rows
    .map((group) => {
      const ratio = group.count ? group.success / group.count : 0
      const fallback = group.fallback ? ` ↪${group.fallback}` : ''
      return `<div class="r"><span class="l">${escapeHtml(group.label)}</span><span class="v">${formatCount(group.count)} · ${fmtMs(group.medianMs)}${fallback}</span><span class="p ${healthClass(ratio)}">${Math.round(ratio * 100)}%</span><i style="width:${share(group.count, max)}%"></i></div>`
    })
    .join('')
}

function renderTabs(report: MetricsReport) {
  const tabs = [
    {
      key: 'm',
      title: 'Models',
      groups: report.models.map((group) => ({
        ...group,
        label: shortModelName(group.label),
      })),
    },
    { key: 't', title: 'Tools', groups: report.tools },
  ].filter((tab) => tab.groups.length)
  if (!tabs.length) return { html: '', keys: [] }

  const rows = Math.max(
    ...tabs.map((tab) => Math.min(MAX_ROWS, tab.groups.length)),
  )
  const buttons = tabs
    .map(
      (tab, index) =>
        `<button id="b${tab.key}"${index ? '' : ' class="on"'}>${tab.title}</button>`,
    )
    .join('')
  // Panels overlap in a box sized for the longest one, so switching never
  // resizes the bubble. Telegram's renderer ignores grid-area stacking.
  const panels = tabs
    .map(
      (tab, index) =>
        `<div id="p${tab.key}" class="pn${index ? '' : ' on'}">${renderRows(tab.groups)}</div>`,
    )
    .join('')

  return {
    html: `<div class="card"><div class="tabs" style="--n:${tabs.length}"><b id="ind"></b>${buttons}</div><div class="pns" style="height:${rows * ROW_HEIGHT}px">${panels}</div></div>`,
    keys: tabs.map((tab) => tab.key),
  }
}

const STYLE = `
:root{--bg:var(--tg-theme-bg-color,#fff);--tx:var(--tg-theme-text-color,#111);--ht:var(--tg-theme-hint-color,#8e8e93);--ac:var(--tg-theme-button-color,#3390ec);--sf:var(--tg-theme-secondary-bg-color,#f1f1f4);--ln:var(--tg-theme-section-separator-color,#e2e2e6);--spring:cubic-bezier(.34,1.56,.64,1);--ease:cubic-bezier(.2,.9,.3,1)}
body{margin:0;padding:8px 8px calc(8px + var(--tg-content-safe-area-inset-bottom,0px));background:var(--bg);color:var(--tx);font:14px/1.3 system-ui,sans-serif;font-variant-numeric:tabular-nums}
.hero{display:flex;gap:16px;align-items:center;margin-top:0;padding:14px}
.ring{position:relative;flex:none;width:88px;height:88px;border-radius:50%}
.hole{position:absolute;top:8px;left:8px;right:8px;bottom:8px;border-radius:50%;background:var(--sf);display:flex;flex-direction:column;align-items:center;justify-content:center}
.hole b{font-size:20px;line-height:1;font-weight:800}.hole small{margin-top:3px;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:var(--ht)}
.hs{flex:1;min-width:0}.ttl{font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--ht)}
.big{font-size:15px;color:var(--ht);margin:0 0 8px}.big b{font-size:34px;line-height:1.1;font-weight:800;margin-right:5px;color:var(--tx)}
.kp{display:flex;gap:14px}.kp b{display:block;font-size:17px;font-weight:700}
.kp small{display:block;font-size:11px;white-space:nowrap;color:var(--ht)}
.d{display:inline-block;width:7px;height:7px;margin-right:4px;border-radius:50%;background:currentColor}
.d.to{color:${TIMEOUT}}.d.er{color:${ERROR}}
.card{margin-top:8px;padding:12px;border-radius:16px;background:var(--sf);overflow:hidden}
.hd{display:flex;gap:8px;justify-content:space-between;align-items:baseline;margin-bottom:10px;font-size:15px;font-weight:700}
.hd small{font-size:12px;font-weight:400;color:var(--ht)}
#tip{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;font-weight:600;color:var(--ac)}
.plot{position:relative;height:88px;margin-left:30px}
.gl{position:absolute;left:0;right:0;height:0;border-top:1px dashed var(--ln)}
.yl{position:absolute;left:-30px;width:24px;margin-top:-7px;text-align:right;font-size:11px;line-height:14px;color:var(--ht)}
.bars{position:absolute;top:0;left:0;right:0;bottom:0;display:flex;align-items:flex-end;gap:3px}
.bars i{flex:1;height:100%;display:flex;align-items:flex-end;cursor:pointer}
.bars b{width:100%;border-radius:3px 3px 1px 1px;pointer-events:none;background:var(--ac);transform-origin:bottom}
.bars i.on b{background:var(--tx)!important}
.ax{display:flex;justify-content:space-between;margin:6px 0 0 30px;color:var(--ht);font-size:11px}
.lv{display:inline-block;width:6px;height:6px;margin-right:5px;border-radius:50%;background:${OK};vertical-align:1px;animation-name:ping;animation-duration:1.8s;animation-iteration-count:infinite}
.tabs{position:relative;display:flex;margin-bottom:6px;padding:3px;border-radius:12px;background:var(--bg)}
#ind{position:absolute;top:3px;bottom:3px;left:3px;width:calc((100% - 6px)/var(--n));border-radius:9px;background:var(--ac);transition:transform .5s var(--spring)}
.tabs button{position:relative;flex:1;border:0;padding:7px 0;background:transparent;color:var(--ht);font:600 13px system-ui,sans-serif;cursor:pointer;transition:color .3s,transform .15s}
.tabs button:active{transform:scale(.92)}
.tabs button.on{color:var(--tg-theme-button-text-color,#fff)}
.pns{position:relative}
.pn{position:absolute;top:0;left:0;right:0;visibility:hidden;opacity:0;transform:translateX(28px);transition:opacity .25s,transform .45s var(--ease),visibility .25s}
.pn.l{transform:translateX(-28px)}.pn.on{visibility:visible;opacity:1;transform:none}
.r{position:relative;display:flex;gap:8px;align-items:center;box-sizing:border-box;height:${ROW_HEIGHT}px;padding-bottom:5px;transform:translateX(18px);transition:transform .5s var(--spring)}
.pn.on .r{transform:none}.r:nth-child(2){transition-delay:.05s}.r:nth-child(3){transition-delay:.1s}.r:nth-child(4){transition-delay:.15s}
.r i{position:absolute;left:0;bottom:2px;height:3px;border-radius:2px;background:var(--ac);transform:scaleX(0);transform-origin:left;transition:transform .6s var(--ease) .15s;animation-name:grow;animation-duration:.6s}
.pn.on .r i{transform:none}
.l{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}
.v{color:var(--ht);font-size:12px;white-space:nowrap}.p{width:40px;text-align:right;font-weight:700}
.ok{color:${OK}}.to{color:${TIMEOUT}}.er{color:${ERROR}}
@keyframes grow{from{transform:scaleX(0)}}
@keyframes ping{from{box-shadow:0 0 0 0 rgba(52,199,89,.7)}70%{box-shadow:0 0 0 6px rgba(52,199,89,0)}to{box-shadow:0 0 0 0 rgba(52,199,89,0)}}
@media (prefers-reduced-motion:reduce){.r i,.lv{animation-name:none}}
`

// Bars are drawn from B to keep the 4 KB compressed budget. The intro plays
// once, when the widget is actually on screen.
const SCRIPT = `
const T=window.TelegramWidget,$=(i)=>document.getElementById(i),A=(el,k,o)=>{try{el.animate(k,o)}catch(e){}}
const tick=()=>T&&T.HapticFeedback.selectionChanged(),pc=(v,t)=>Math.round(v/t*100)
const at=(t,o)=>new Date(t).toLocaleString([],o),hm={hour:'2-digit',minute:'2-digit'},day={month:'short',day:'numeric'},ax=H>24?day:{hour:'numeric'}
$('x0').textContent=at(S,ax);$('x1').textContent=at(S+(N-S)/2,ax)
$('bars').innerHTML=B.map(([n,t,e],i)=>{const o=pc(n-t-e,n),w=pc(n-e,n)
return '<i data-i="'+i+'"><b id="c'+i+'" style="height:'+(n&&Math.max(3,pc(n,M)))+'%'+(t+e?';background:linear-gradient(0deg,var(--ac) 0 '+o+'%,${TIMEOUT} '+o+'% '+w+'%,${ERROR} '+w+'%)':'')+'"></b></i>'}).join('')
const show=(a)=>{K.forEach((x,i)=>{$('b'+x).className=i===a?'on':'';$('p'+x).className=i===a?'pn on':i<a?'pn l':'pn'});$('ind').style.transform='translateX('+a*100+'%)'}
K.forEach((x,i)=>$('b'+x).addEventListener('click',()=>{show(i);tick()}))
let sel
$('bars').addEventListener('click',(ev)=>{const i=ev.target.dataset.i;if(i==null)return
if(sel)sel.className='';(sel=ev.target).className='on'
const [n,t,e]=B[i],tip=$('tip')
tip.textContent=at(S+i*D,H>24?{...day,...hm}:hm)+' · '+n+' ops'+(t?' · ⏱ '+t:'')+(e?' · ❌ '+e:'')
A($('c'+i),[{transform:'none'},{transform:'scaleY(1.15)'},{transform:'none'}],{duration:400,easing:'cubic-bezier(.34,1.56,.64,1)'})
A(tip,[{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:260});tick()})
const tot=$('tot'),n=+tot.textContent
let go=0
const start=()=>{if(go++||matchMedia('(prefers-reduced-motion: reduce)').matches)return
const t0=Date.now(),f=()=>{const p=1-Math.pow(1-Math.min(1,(Date.now()-t0)/1200),3),a=R[0]*p,b=R[1]*p,c=360*p
$('ring').style.background='conic-gradient(${OK} 0 '+a+'deg,${TIMEOUT} '+a+'deg '+b+'deg,${ERROR} '+b+'deg '+c+'deg,var(--ln) '+c+'deg)';tot.textContent=Math.round(n*p);if(p<1)requestAnimationFrame(f)};f()
B.forEach((_,i)=>A($('c'+i),[{transform:'scaleY(0)'},{transform:'scaleY(1.12)',offset:.6},{transform:'none'}],{duration:800,delay:150+i*35,easing:'cubic-bezier(.2,.8,.2,1)',fill:'backwards'}))}
if(!T||T.isActive)start();else T.onEvent('activated',start)
`

export function buildMetricsWidgetHtml(report: MetricsReport): string {
  const tabs = renderTabs(report)
  const buckets = report.timeline.map((bucket) => [
    bucket.count,
    bucket.timeout,
    bucket.error,
  ])
  const bucketMs = (report.toMs - report.fromMs) / report.timeline.length

  return `<!doctype html><html><head><style>${STYLE}</style></head><body>
${renderHero(report)}
${renderChart(report)}
${tabs.html}
<script>const K=${JSON.stringify(tabs.keys)},B=${JSON.stringify(buckets)},R=${JSON.stringify(ringStops(report))},M=${chartMax(report)},H=${report.hours},S=${report.fromMs},D=${bucketMs},N=${report.toMs}
${SCRIPT}</script></body></html>`
}

export function sendMetricsWidget(
  api: Pick<Api, 'raw'>,
  chatId: number,
  report: MetricsReport,
  replyId?: number,
  messageThreadId?: number,
): Promise<Message> {
  return (api.raw as unknown as WidgetRawApi).sendWidget({
    chat_id: chatId,
    html: buildMetricsWidgetHtml(report),
    ...(replyId ? { reply_parameters: { message_id: replyId } } : {}),
    ...(typeof messageThreadId === 'number'
      ? { message_thread_id: messageThreadId }
      : {}),
  })
}
