import { hasRussiansLetters, dedent, normalize, sanitizeSvg } from '..'

describe('hasRussiansLetters', () => {
  test('can check is provided text on russian or not', () => {
    expect(hasRussiansLetters('да, тут есть русские буквы')).toEqual(true)
    expect(hasRussiansLetters('no, there is no russian letters here')).toEqual(false)
  })
})

describe('dedent', () => {
  test('removes unnecessary spaces after \\n', () => {
    expect(dedent`\n   some redundant\n   spaces here`).toEqual('\nsome redundant\nspaces here')
    expect(dedent('\n   some redundant\n   spaces here')).toEqual('\nsome redundant\nspaces here')
    expect(
      dedent(dedent`Users Statistic:
            All messages: ${String(123123)}`),
    ).toEqual('Users Statistic:\nAll messages: 123123')
  })
})

describe('normalize', () => {
  test('fixes spacings of strings', () => {
    expect(normalize('  some redundant  spaces here')).toEqual('some redundant spaces here')
  })
})

describe('sanitizeSvg', () => {
  test('should remove divs in svg', () => {
    const html =
      '<div class="recharts-wrapper" style="position:relative;cursor:default;width:1200px;height:400px" data-reactroot=""><svg class="recharts-surface" width="1200" height="400" viewBox="0 0 1200 400" version="1.1"><defs><clipPath id="recharts2-clip"><rect x="20" y="20" height="340" width="1160"></rect></clipPath></defs><g class="recharts-layer recharts-bar"><g class="recharts-layer recharts-bar-rectangles"><g class="recharts-layer recharts-bar-rectangle"><path fill="#4A90E2" width="50" height="340" id="1305082" x="575" y="20" radius="0" class="recharts-rectangle" d="M 575,20 h 50 v 340 h -50 Z"></path></g></g><g class="recharts-layer recharts-label-list"><text x="600" y="15" fill="#333333" text-anchor="middle" class="sc-AxjAm bcMPWx">1</text></g></g><g class="recharts-layer recharts-cartesian-axis recharts-xAxis xAxis"><line orientation="bottom" width="1160" height="30" type="category" x="20" y="360" class="recharts-cartesian-axis-line" stroke=" #4A4A4A" stroke-dasharray="3 3" fill="none" x1="20" y1="360" x2="1180" y2="360"></line><g class="recharts-cartesian-axis-ticks"><g class="recharts-layer recharts-cartesian-axis-tick"><g transform="translate(600,368)"><text width="1160" height="auto" text-anchor="middle" fill="#4a4a4a" font-size="12"><tspan x="0" y="0" dy="10">drrrrrrrr</tspan></text></g></g></g></g></svg></div>'
    const svg =
      '<svg class="recharts-surface" width="1200" height="400" viewBox="0 0 1200 400" version="1.1"><defs><clipPath id="recharts2-clip"><rect x="20" y="20" height="340" width="1160"></rect></clipPath></defs><g class="recharts-layer recharts-bar"><g class="recharts-layer recharts-bar-rectangles"><g class="recharts-layer recharts-bar-rectangle"><path fill="#4A90E2" width="50" height="340" id="1305082" x="575" y="20" radius="0" class="recharts-rectangle" d="M 575,20 h 50 v 340 h -50 Z"></path></g></g><g class="recharts-layer recharts-label-list"><text x="600" y="15" fill="#333333" text-anchor="middle" class="sc-AxjAm bcMPWx">1</text></g></g><g class="recharts-layer recharts-cartesian-axis recharts-xAxis xAxis"><line orientation="bottom" width="1160" height="30" type="category" x="20" y="360" class="recharts-cartesian-axis-line" stroke=" #4A4A4A" stroke-dasharray="3 3" fill="none" x1="20" y1="360" x2="1180" y2="360"></line><g class="recharts-cartesian-axis-ticks"><g class="recharts-layer recharts-cartesian-axis-tick"><g transform="translate(600,368)"><text width="1160" height="auto" text-anchor="middle" fill="#4a4a4a" font-size="12"><tspan x="0" y="0" dy="10">drrrrrrrr</tspan></text></g></g></g></g></svg>'

    expect(sanitizeSvg(html)).toEqual(svg)
  })
})
