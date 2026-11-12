import { buildWidgetHtml, widgetJson } from '@tg-bot/common'
import type { CurrencyHistoryDay, CurrencySnapshot } from './types'

const UP_RGB = '52,199,89'
const DOWN_RGB = '255,59,48'
const MONTHS = [
  'янв',
  'фев',
  'мар',
  'апр',
  'мая',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
]

const HEADER_HEIGHT_PX = 16
const ROW_HEIGHT_PX = 30
const SEPARATOR_HEIGHT_PX = 11
/** A value cell of a main pair: 42 for the number, 38 for the sparkline. */
const CELL_WIDTH_PX = 92
const SPARKLINE_WIDTH_PX = 38
/** Everything in the chart panel but the chart: name, value and dates. */
const PANEL_CHROME_PX = 106

interface Quote {
  /** Name shown over the chart, such as USD/BYN. */
  readonly name: string
  readonly unit: string
  /** Fraction digits the value is shown with. */
  readonly digits: number
  /**
   * A live value moves during the day, so it ends the chart as its last
   * point. Fiat rates are daily on both sides and their providers disagree
   * by up to 1%, so a fiat chart keeps to the history source alone.
   */
  readonly live: boolean
  readonly read: (snapshot: CurrencySnapshot) => number | undefined
}

interface Row {
  readonly label: string
  /** Markup of the flag or icon before the label. */
  readonly icon?: string
  /** One quote, or the USD and the EUR one of a main pair. */
  readonly quotes: Quote[]
}

/** What the script gets for a quote: name, unit, digits, value and points. */
type QuoteData = [string, string, number, number, number[]]

const fiat = (base: 'USD' | 'EUR', code: string): Quote => ({
  name: `${base}/${code}`,
  unit: '',
  digits: 2,
  live: false,
  read: ({ rates }) => (base === 'USD' ? rates[code] / rates.USD : rates[code]),
})

const price = (ticker: string, digits: number, name = ticker): Quote => ({
  name,
  unit: '$',
  digits,
  live: true,
  read: ({ prices }) => prices[ticker],
})

const single = (quote: Quote, icon?: string): Row => ({
  label: quote.name,
  icon,
  quotes: [quote],
})

/** The groups and rows of the image reply, in its order. */
const GROUPS: Row[][] = [
  ['BYN', 'SEK', 'PLN', 'UAH'].map((code) => ({
    label: code,
    // The inner element is the upright bar of the Swedish cross.
    icon: `<i class="f ${code}"><i></i></i>`,
    quotes: [fiat('USD', code), fiat('EUR', code)],
  })),
  [
    single(fiat('USD', 'RUB')),
    single(fiat('EUR', 'RUB')),
    single(price('BRENT', 2, 'Brent'), '<i>🛢️</i>'),
  ],
  [single(price('BTC', 0)), single(price('ETH', 0)), single(price('ADA', 3))],
]

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/** 2026-11-05 becomes "5 ноя". */
const formatDate = (date: string) =>
  `${Number(date.slice(8, 10))} ${MONTHS[Number(date.slice(5, 7)) - 1]}`

/** Undefined for a quote without a live value or a full history. */
function toQuoteData(
  { name, unit, digits, live, read }: Quote,
  now: CurrencySnapshot,
  history: CurrencyHistoryDay[],
): QuoteData | undefined {
  const value = read(now)
  const points = history.map(read)
  if (!isNumber(value) || !points.every(isNumber)) return undefined

  // One digit past the shown ones keeps a flat week from drawing in steps;
  // a whole-number price is long enough without it.
  const compact = (point: number) => Number(point.toFixed(digits && digits + 1))
  return [
    name,
    unit,
    digits,
    compact(value),
    (live ? [...points, value] : points).map(compact),
  ]
}

const gradient = (id: string, rgb: string) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(${rgb},.35)"/><stop offset="1" stop-color="rgba(${rgb},0)"/></linearGradient>`

// Every size here is in fixed pixels, so the table looks the same in a bubble
// of any width: a value with its sparkline right after it, the cells packed
// to the right like the columns of the image reply, and spare width left
// between the labels and the numbers. A row with one value puts it under the
// EUR column.
// Flags are drawn, because emoji flags come from the system font: Windows
// shows them as two letters, and Belarus gets the white-red-white flag here.
// The chart panel lies over the table, slid out of the card until a rate is
// tapped, so opening it never resizes the bubble. Its parts have fixed
// heights that add up to the height of the table: Telegram's renderer gave a
// chart sized by aspect-ratio no height at all.
const STYLE = `
#tb{position:relative}
.th,.tr,.lb,.c{display:flex;align-items:center}
.th,.tr{gap:4px}
.th{justify-content:flex-end;height:${HEADER_HEIGHT_PX}px;color:var(--ht);font-size:12px}
.th span{box-sizing:border-box;width:${CELL_WIDTH_PX}px;padding-right:${SPARKLINE_WIDTH_PX + 8}px;text-align:right}
.tr{height:${ROW_HEIGHT_PX}px;font-size:16px;font-weight:700}
.lb{flex:1;gap:6px}
.c{justify-content:flex-end;gap:4px;height:26px;padding:0 4px;border-radius:8px;cursor:pointer}
.m .c{box-sizing:border-box;width:${CELL_WIDTH_PX}px}
.hr{height:1px;margin:5px 0;background:var(--ln)}
.f{position:relative;flex:none;width:20px;height:14px;border-radius:3px;overflow:hidden;box-shadow:0 0 0 1px var(--ln)}
.BYN{background:linear-gradient(#fff 33%,#d22730 33% 67%,#fff 67%)}
.SEK{background:linear-gradient(#006aa7 36%,#fecc02 36% 64%,#006aa7 64%)}
.SEK i{position:absolute;top:0;bottom:0;left:6px;width:4px;background:#fecc02}
.PLN{background:linear-gradient(#fff 50%,#dc143c 50%)}
.UAH{background:linear-gradient(#0057b7 50%,#ffd700 50%)}
.ov{padding:12px;background:var(--sf);transform:translateY(105%);transition:transform .45s var(--ease)}
.ov.on{transform:none}
.ov .hd{align-items:center;height:26px}
#x{border:0;background:none;color:var(--ht);font-size:26px;line-height:1}
.vr{height:44px;line-height:44px;white-space:nowrap}
#val{font-size:40px;font-weight:800}
#ch{margin-left:10px;font-size:17px;font-weight:700}
#pl{position:relative;margin-top:8px}
#wp,#sv,#hit,.ov{position:absolute;top:0;left:0;right:0;bottom:0}
#wp{overflow:hidden}
#sv svg{display:block;width:100%;height:100%}
#cur{position:absolute;top:0;bottom:0;width:1px;background:var(--ht);visibility:hidden}
#dot{position:absolute;width:10px;height:10px;margin:-7px 0 0 -7px;border-radius:50%;border:2px solid var(--sf)}
#hit{display:flex;touch-action:pan-y}
#hit i{flex:1}
.ax{display:flex;justify-content:space-between;height:14px;margin-top:4px;color:var(--ht);font-size:11px;line-height:14px}
`

// Q holds [name, unit, digits, value, points] per quote, and cell c<i> shows
// quote i and opens its chart. L holds the date of every history point; a
// point past L is the live value. H is the height of the chart. Values and
// sparklines are filled in here, so a rate costs only its numbers against the
// 4 KB compressed limit.
// The chart is drawn in the pixels of its box, with no viewBox to scale it,
// so its width is read when it opens: from the box, or else from the window.
// If the renderer gives neither, the chart takes a fixed width that fits the
// narrowest bubble and is centered.
// The line is a Catmull-Rom spline, which passes through every point; its
// control points are kept between the two values they join, so a flat stretch
// does not bulge before a drop. It is revealed by sliding a clipping box in
// while its content slides back.
// The chart is split into a column per point, and every point lies inside
// its own. A touched point shows its value, then the live one returns by
// itself.
const SCRIPT = `
const fmt=(v,d)=>v.toFixed(d).replace(/\\B(?=(\\d{3})+(?!\\d))/g,' ')
const lab=(i)=>L[i]||'сейчас'
const chg=(s)=>(s[s.length-1]/s[0]-1)*100
const hue=(c)=>'rgb('+(c<0?'${DOWN_RGB}':'${UP_RGB}')+')'
const pts=(s,w,h,p)=>{const lo=Math.min(...s),k=Math.max(...s)-lo;return s.map((v,i)=>[3+i/(s.length-1)*(w-6),k?h-p-(v-lo)/k*(h-2*p):h/2])}
const line=(P)=>P.map(([x,y],i)=>{if(!i)return'M'+x+' '+y;const b=P[i-1],a=P[i-2]||b,d=P[i+1]||P[i],fit=(v)=>Math.min(Math.max(v,Math.min(b[1],y)),Math.max(b[1],y));return'C'+[b[0]+(x-a[0])/6,fit(b[1]+(y-a[1])/6),x-(d[0]-b[0])/6,fit(y-(d[1]-b[1])/6),x,y]}).join('')
let at=-1,tm,R,S,P
const val=$('val'),dot=$('dot'),cur=$('cur'),ov=$('ov')
const put=(j)=>{dot.style.left=cur.style.left=P[j][0]+'px';dot.style.top=P[j][1]+'px'}
const show=(v)=>{val.textContent=R[1]+fmt(v,R[2])}
const rest=()=>{at=-1;put(S.length-1);cur.style.visibility='hidden';$('tip').textContent='';show(R[3])}
const mark=(j)=>{put(at=j);cur.style.visibility='visible';show(S[j]);say(lab(j));clearTimeout(tm);tm=setTimeout(rest,2500)}
const pick=(ev)=>{const j=ev.target.dataset.i;if(j!=null&&+j!==at)mark(+j)}
const sel=(i)=>{const e=$('pl');let w=0;try{w=e.clientWidth||e.offsetWidth||e.getBoundingClientRect().width}catch(x){}
w=w||window.innerWidth-40
if(!w){w=260;e.style.width=w+'px';e.style.margin='8px auto 0'}
R=Q[i];S=R[4];P=pts(S,w,H,16)
const c=chg(S),k=hue(c),d=line(P),ch=$('ch'),ln=$('ln'),ar=$('ar')
$('nm').textContent=R[0]
ch.textContent=(c<0?'':'+')+c.toFixed(2)+'%';ch.style.color=dot.style.background=k
ln.setAttribute('d',d);ln.setAttribute('stroke',k)
ar.setAttribute('d',d+'L'+(w-3)+' '+H+'L3 '+H+'Z');ar.setAttribute('fill','url(#g'+(c<0?'d':'u')+')')
$('x0').textContent=lab(0);$('x1').textContent=lab(S.length-1)
$('hit').innerHTML=S.map((_,j)=>'<i data-i="'+j+'"></i>').join('')
clearTimeout(tm);rest();wipe();ov.className='ov on';tick()}
const wipe=()=>{const o={duration:800,easing:'cubic-bezier(.2,.9,.3,1)'};A($('wp'),[{transform:'translateX(-100%)'},{transform:'none'}],o);A($('sv'),[{transform:'translateX(100%)'},{transform:'none'}],o)}
Q.forEach(([,u,d,v,s],i)=>{const c=$('c'+i),p=c.lastChild.firstChild;c.firstChild.textContent=u+fmt(v,d);p.setAttribute('d',line(pts(s,${SPARKLINE_WIDTH_PX},20,3)));p.setAttribute('stroke',hue(chg(s)))})
$('tb').addEventListener('click',(ev)=>{let el=ev.target;while(el&&!/^c\\d/.test(el.id))el=el.parentNode
if(el)sel(+el.id.slice(1))})
$('x').addEventListener('click',()=>{ov.className='ov';tick()})
$('hit').addEventListener('click',pick);$('hit').addEventListener('pointermove',pick)
`

/**
 * Every rate on one screen, laid out like the image reply, each with a
 * sparkline of the last week; a tapped rate opens its chart over the table.
 * Resolves to undefined when there is no history to draw.
 */
export function buildCurrencyWidgetHtml(
  now: CurrencySnapshot,
  history: CurrencyHistoryDay[],
): string | undefined {
  if (history.length < 2) return undefined

  const quotes: QuoteData[] = []
  let tableHeight = 0
  const groups = GROUPS.map((rows, group) => {
    const html = rows
      .map((row) => {
        const data = row.quotes.map((quote) => toQuoteData(quote, now, history))
        // A main pair is shown with both of its values or not at all.
        if (data.includes(undefined)) return ''

        tableHeight += ROW_HEIGHT_PX
        const cells = data
          .map((quote) => {
            const index = quotes.push(quote as QuoteData) - 1
            // Cells differ by their number alone, which compresses best.
            return `<div class="c" id="c${index}"><span></span><svg width="${SPARKLINE_WIDTH_PX}" height="20"><path fill="none" stroke-width="2"/></svg></div>`
          })
          .join('')
        return `<div class="tr${data.length > 1 ? ' m' : ''}"><div class="lb">${row.icon ?? ''}${row.label}</div>${cells}</div>`
      })
      .join('')
    if (!html) return ''

    // Only the main pairs have the two columns to name.
    if (group) return html
    tableHeight += HEADER_HEIGHT_PX
    return `<div class="th"><span>USD</span><span>EUR</span></div>${html}`
  }).filter(Boolean)
  if (!quotes.length) return undefined

  tableHeight += (groups.length - 1) * SEPARATOR_HEIGHT_PX
  const chartHeight = tableHeight - PANEL_CHROME_PX

  return buildWidgetHtml({
    style: STYLE,
    body: `<div class="card" id="tb">${groups.join('<div class="hr"></div>')}
<div class="ov" id="ov"><div class="hd"><span id="nm"></span><button id="x">×</button></div><div class="vr"><b id="val"></b><span id="ch"></span></div>
<div id="pl" style="height:${chartHeight}px"><div id="wp"><div id="sv"><svg><defs>${gradient('gu', UP_RGB)}${gradient('gd', DOWN_RGB)}</defs><path id="ar"/><path id="ln" fill="none" stroke-width="2.5"/></svg></div></div><i id="cur"></i><b id="dot"></b><div id="hit"></div></div>
<div class="ax"><span id="x0"></span><span id="tip"></span><span id="x1"></span></div></div></div>`,
    script: `const L=${widgetJson(history.map((day) => formatDate(day.date)))},Q=${widgetJson(quotes)},H=${chartHeight}\n${SCRIPT}`,
  })
}
