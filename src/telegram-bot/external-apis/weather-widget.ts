import {
  buildWidgetHtml,
  escapeHtml,
  type HourlyForecast,
  type WeatherData,
  widgetJson,
} from '@tg-bot/common'

const DAY_NAMES = ['Сегодня', 'Завтра', 'Послезавтра']
const BAR_MIN_PX = 12
const BAR_RANGE_PX = 48
/** Bars span at least this many degrees, so 1° and 3° do not look 5x apart. */
const BAR_MIN_SPAN = 8

/** Typographic minus, so −3° lines up with 13°. */
const formatNumber = (value: number) =>
  `${value < 0 ? '−' : ''}${Math.abs(value)}`
const formatTemp = (value: number) => `${formatNumber(value)}°`
const formatHour = (hour: number) => `${String(hour).padStart(2, '0')}:00`
const capitalize = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1)

const formatTip = (slot: HourlyForecast) =>
  `${formatHour(slot.hour)} · ${slot.description}${slot.precipitationChance ? ` · ☔ ${slot.precipitationChance}%` : ''}`

/** Position of a value inside a range, as a whole percent. */
const position = (value: number, min: number, max: number) =>
  max > min
    ? Math.round(Math.min(1, Math.max(0, (value - min) / (max - min))) * 100)
    : 50

function renderHero(weather: WeatherData) {
  const rain = Math.max(
    0,
    ...weather.hourly.map((slot) => slot.precipitationChance),
  )
  const stat = (value: string, label: string) =>
    `<div><b>${value}</b><small>${label}</small></div>`

  return `<div class="card"><div class="top"><div class="hs"><div class="ct">${escapeHtml(weather.city)}<small>${escapeHtml(weather.country)}</small></div>
<div class="tmp"><b id="t">${formatNumber(weather.temperature)}</b>°</div>
<div class="ds">${escapeHtml(capitalize(weather.description))}</div><small>Ощущается как ${formatTemp(weather.feelsLike)}</small></div>
<div class="ic"><span id="ic">${weather.icon}</span></div></div>
<div class="kp">${stat(`${weather.windSpeed} м/с`, `ветер, ${weather.windDirection}`)}${stat(`${weather.humidity}%`, 'влажность')}${stat(`${rain}%`, 'осадки за сутки')}</div></div>`
}

function renderHourly(weather: WeatherData) {
  if (!weather.hourly.length) return ''

  const temperatures = weather.hourly.map((slot) => slot.temperature)
  const coldest = Math.min(...temperatures)
  const warmest = Math.max(...temperatures)
  const padding = Math.max(0, BAR_MIN_SPAN - (warmest - coldest)) / 2
  const min = coldest - padding
  const max = warmest + padding
  const columns = weather.hourly
    .map((slot, index) => {
      const height =
        BAR_MIN_PX +
        Math.round((position(slot.temperature, min, max) / 100) * BAR_RANGE_PX)
      return `<div class="h${index ? '' : ' on'}" data-i="${index}"><div class="pl"><b>${formatTemp(slot.temperature)}</b><i id="c${index}" style="height:${height}px"></i></div><span>${slot.icon}</span><small>${formatHour(slot.hour)}</small></div>`
    })
    .join('')

  // The line above the bars describes the highlighted hour; a tap moves it.
  return `<div class="card"><div id="tip">${escapeHtml(formatTip(weather.hourly[0]))}</div><div class="hrs" id="hrs">${columns}</div></div>`
}

function renderDaily(weather: WeatherData) {
  if (!weather.forecast.length) return ''

  const min = Math.min(...weather.forecast.map((day) => day.tempLow))
  const max = Math.max(...weather.forecast.map((day) => day.tempHigh))
  const rows = weather.forecast
    .map((day, index) => {
      const left = position(day.tempLow, min, max)
      const width = Math.max(6, position(day.tempHigh, min, max) - left)
      // Today's bar also marks where the current temperature sits.
      const now = index
        ? ''
        : `<b style="left:${position(weather.temperature, min, max)}%"></b>`
      return `<div class="dy"><span class="dn">${DAY_NAMES[index] ?? ''}</span><span class="de">${day.icon}</span><span class="lo">${formatTemp(day.tempLow)}</span><div class="rg"><i id="g${index}" style="left:${Math.min(left, 100 - width)}%;width:${width}%"></i>${now}</div><b class="hi">${formatTemp(day.tempHigh)}</b></div>`
    })
    .join('')

  return `<div class="card"><div class="hd"><span>Прогноз</span></div>${rows}</div>`
}

const STYLE = `
.top{display:flex;align-items:center;gap:12px}.hs{flex:1;min-width:0}
.ct{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:20px;font-weight:700}.ct small{margin-left:6px;font-weight:600}
#tip{margin-bottom:6px;font-size:14px;color:var(--tx)}
.tmp{font-size:30px;font-weight:300;line-height:1.05}.tmp b{font-size:60px;font-weight:800}
.ds{font-size:16px;font-weight:600}.hs small{color:var(--ht);font-size:12px}
.ic{flex:none;margin-right:6px;font-size:68px;line-height:1;animation-name:fl;animation-duration:4s;animation-timing-function:ease-in-out;animation-iteration-count:infinite}
#ic{display:block}
.kp{display:flex;margin-top:12px;padding-top:10px;border-top:1px solid var(--ln)}
.kp div{flex:1}.kp b{display:block;font-size:17px;font-weight:700}.kp small{display:block;font-size:11px;color:var(--ht)}
.hrs{display:flex;gap:4px}
.h{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;cursor:pointer}
.pl{height:${BAR_MIN_PX + BAR_RANGE_PX + 24}px;width:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center}
.pl b{margin-bottom:4px;font-size:13px}
.pl i{width:100%;max-width:26px;border-radius:5px 5px 2px 2px;background:var(--ac);transform-origin:bottom}
.h.on i{background:var(--tx)}
.h span{margin-top:8px;font-size:20px;line-height:1}
.h small{margin-top:5px;font-size:11px;color:var(--ht)}
.dy{display:flex;align-items:center;gap:8px;height:34px}
.dn{width:92px;font-weight:500}.de{width:24px;font-size:18px;text-align:center}
.lo{width:34px;text-align:right;color:var(--ht)}.hi{width:34px}
.rg{position:relative;flex:1;height:6px;border-radius:3px;background:var(--ln)}
.rg i{position:absolute;top:0;bottom:0;border-radius:3px;background:var(--ac);transform-origin:left}
.rg b{position:absolute;top:-3px;width:8px;height:8px;margin-left:-6px;border-radius:50%;background:var(--tx);border:2px solid var(--sf)}
@keyframes fl{50%{transform:translateY(-6px)}}
@media (prefers-reduced-motion:reduce){.ic{animation-name:none}}
`

// D holds one tip per hourly column, N the current temperature, G the number
// of forecast rows.
const SCRIPT = `
let sel=$('hrs')&&$('hrs').firstChild
if(sel)$('hrs').addEventListener('click',(ev)=>{let el=ev.target;while(el&&!(el.dataset&&el.dataset.i))el=el.parentNode
if(!el)return
sel.className='h';(sel=el).className='h on'
bounce($('c'+el.dataset.i));say(D[el.dataset.i])})
onShow(()=>{const t=$('t');tween(900,(p)=>{const v=Math.round(N*p);t.textContent=(v<0?'−':'')+Math.abs(v)})
A($('ic'),[{transform:'scale(.3) rotate(-25deg)'},{transform:'scale(1.15)',offset:.6},{transform:'none'}],{duration:900,easing:'cubic-bezier(.2,.8,.2,1)'})
D.forEach((_,i)=>grow($('c'+i),'Y',150+i*60))
for(let i=0;i<G;i++)grow($('g'+i),'X',500+i*120)})
`

export function buildWeatherWidgetHtml(weather: WeatherData): string {
  return buildWidgetHtml({
    style: STYLE,
    body: renderHero(weather) + renderHourly(weather) + renderDaily(weather),
    script: `const D=${widgetJson(weather.hourly.map(formatTip))},N=${weather.temperature},G=${weather.forecast.length}\n${SCRIPT}`,
  })
}
