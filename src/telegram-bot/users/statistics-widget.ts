import {
  buildWidgetHtml,
  escapeHtml,
  type UserStat,
  WIDGET_MAX_COMPRESSED_BYTES,
  WIDGET_ROW_HEIGHT,
  WIDGET_ROW_STYLE,
  widgetCompressedSize,
  widgetJson,
} from '@tg-bot/common'

const PODIUM_SIZE = 3
const ROWS_PER_PAGE = 7
const MAX_USERS = 100
const NAME_LIMIT = 32
/** Headroom in case Telegram's compressor is a little less tight than ours. */
const COMPRESSED_BUDGET = WIDGET_MAX_COMPRESSED_BYTES - 96
const MEDALS = ['🥇', '🥈', '🥉']
const PODIUM_HEIGHTS_PX = [64, 46, 32]
/** Second place stands left of the winner, third on the right. */
const PODIUM_ORDER = [1, 0, 2]

const formatCount = (value: number) => value.toLocaleString('en-US')
const formatName = (user: UserStat) => user.username.slice(0, NAME_LIMIT)

function formatShare(count: number, total: number) {
  const share = total ? (count / total) * 100 : 0
  return `${share < 10 ? Number(share.toFixed(1)) : Math.round(share)}%`
}

function renderPodium(users: UserStat[], total: number) {
  const columns = PODIUM_ORDER.filter((place) => users[place])
    .map((place) => {
      const user = users[place]
      return `<div class="pc"><span class="md">${MEDALS[place]}</span><span class="nm">${escapeHtml(formatName(user))}</span><small>${formatCount(user.msgCount)} · ${formatShare(user.msgCount, total)}</small><i id="s${place}" style="height:${PODIUM_HEIGHTS_PX[place]}px">${place + 1}</i></div>`
    })
    .join('')

  return `<div class="card"><div class="pd">${columns}</div></div>`
}

/** The box keeps one height on every page, so paging never resizes the bubble. */
function renderList(listed: number) {
  if (!listed) return ''

  const pager =
    listed > ROWS_PER_PAGE
      ? '<div class="pg"><button id="pv">‹</button><span id="rng"></span><button id="nx">›</button></div>'
      : ''
  return `<div class="card"><div id="rows" style="height:${Math.min(listed, ROWS_PER_PAGE) * WIDGET_ROW_HEIGHT}px"></div>${pager}</div>`
}

const STYLE = `
.big{font-size:15px;color:var(--ht)}.big b{font-size:40px;line-height:1.15;font-weight:800;margin-right:6px;color:var(--tx)}
.pd{display:flex;align-items:flex-end;justify-content:center;gap:8px}
.pc{flex:1;min-width:0;max-width:55%;display:flex;flex-direction:column;align-items:center}
.md{font-size:30px;line-height:1.2}
.nm{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700}
.pc small{margin-bottom:8px;color:var(--ht);font-size:12px;white-space:nowrap}
.pc i{display:flex;align-items:center;justify-content:center;width:100%;border-radius:10px 10px 4px 4px;background:var(--ac);color:var(--tg-theme-button-text-color,#fff);font:800 22px system-ui,sans-serif;transform-origin:bottom}
.rk{width:18px;color:var(--ht);font-weight:700}
.pg{display:flex;align-items:center;justify-content:space-between;margin-top:6px;color:var(--ht);font-size:12px}
.pg button{width:56px;height:28px;border:0;border-radius:9px;background:var(--bg);color:var(--ac);font:700 18px/1 system-ui,sans-serif;cursor:pointer;transition:transform .15s}
.pg button:active{transform:scale(.9)}
.pg button:disabled{color:var(--ln)}
`

// U holds [name, count] from fourth place on, N the total message count, M
// the leader's count and C the number of users in the chat. Rows are drawn
// here so a long list costs only its data against the 4 KB compressed limit.
const SCRIPT = `
const P=${ROWS_PER_PAGE},last=Math.ceil(U.length/P)-1,box=$('rows');let page=0
const esc=(s)=>s.replace(/[&<>]/g,(c)=>'&#'+c.charCodeAt(0)+';')
const share=(c)=>{const s=c/N*100;return(s<10?+s.toFixed(1):Math.round(s))+'%'}
const draw=(dir)=>{const from=page*P,rows=U.slice(from,from+P)
box.innerHTML=rows.map(([n,c],i)=>'<div class="r" id="r'+i+'"><span class="rk">'+(from+i+${PODIUM_SIZE + 1})+'</span><span class="l">'+esc(n)+'</span><span class="v">'+c.toLocaleString('en-US')+'</span><span class="p">'+share(c)+'</span><i id="g'+i+'" style="width:'+Math.round(c/M*100)+'%"></i></div>').join('')
if(last>0){const a=from+${PODIUM_SIZE + 1},b=from+rows.length+${PODIUM_SIZE};$('rng').textContent=(a<b?a+'–'+b:a)+' of '+C;$('pv').disabled=!page;$('nx').disabled=page===last}
if(dir)rows.forEach((_,i)=>{A($('r'+i),[{transform:'translateX('+dir*24+'px)'},{transform:'none'}],{duration:350,delay:i*25,easing:'cubic-bezier(.2,.9,.3,1)',fill:'backwards'});grow($('g'+i),'X',100+i*50)})}
const turn=(dir)=>{if(page+dir<0||page+dir>last)return;page+=dir;draw(dir);tick()}
if(last>0){$('pv').addEventListener('click',()=>turn(-1));$('nx').addEventListener('click',()=>turn(1))}
if(box)draw(0)
onShow(()=>{const t=$('tot');tween(1200,(p)=>{t.textContent=Math.round(N*p).toLocaleString('en-US')})
[2,1,0].forEach((k,i)=>{const el=$('s'+k);if(el)grow(el,'Y',i*250)})
U.slice(0,P).forEach((_,i)=>grow($('g'+i),'X',700+i*50))})
`

function render(users: UserStat[], listed: number) {
  const total = users.reduce((sum, user) => sum + user.msgCount, 0)
  const rows = users
    .slice(PODIUM_SIZE, PODIUM_SIZE + listed)
    .map((user) => [formatName(user), user.msgCount])

  return buildWidgetHtml({
    style: WIDGET_ROW_STYLE + STYLE,
    body: `<div class="card"><div class="ttl">Chat statistics · ${users.length} user${users.length === 1 ? '' : 's'}</div><div class="big"><b id="tot">${formatCount(total)}</b>messages</div></div>${renderPodium(users, total)}${renderList(rows.length)}`,
    script: `const U=${widgetJson(rows)},N=${total},M=${users[0]?.msgCount || 1},C=${users.length}\n${SCRIPT}`,
  })
}

/** Expects users ranked by message count, most active first. */
export function buildStatisticsWidgetHtml(users: UserStat[]): string {
  let listed = Math.max(0, Math.min(users.length, MAX_USERS) - PODIUM_SIZE)
  let html = render(users, listed)

  // Names are user-controlled, so a big chat is cut from the tail until the
  // document fits; the pager then stops at the last user that made it in.
  while (
    listed > ROWS_PER_PAGE &&
    widgetCompressedSize(html) > COMPRESSED_BUDGET
  ) {
    listed = Math.max(ROWS_PER_PAGE, Math.floor(listed * 0.85))
    html = render(users, listed)
  }

  return html
}
