import { tint } from 'polished'
import ReactDOMServer from 'react-dom/server'
import type { User } from 'telegram-typings'

import { getUserName } from '@tg-bot/common/utils'

const CHART_WIDTH = 1200
const CHART_HEIGHT = 400
const CHART_MARGIN = { top: 50, right: 20, bottom: 50, left: 20 }
const MAX_BAR_WIDTH = 50
const MIN_BAR_WIDTH = 20
const MIN_BAR_HEIGHT = 5

const getChartLayout = (length: number) => {
  const plotWidth = CHART_WIDTH - CHART_MARGIN.left - CHART_MARGIN.right
  const plotHeight = CHART_HEIGHT - CHART_MARGIN.top - CHART_MARGIN.bottom
  const safeLength = Math.max(length, 1)
  const slotWidth = plotWidth / safeLength
  const barWidth = Math.min(
    MAX_BAR_WIDTH,
    Math.max(MIN_BAR_WIDTH, slotWidth * 0.55),
  )

  return {
    axisY: CHART_MARGIN.top + plotHeight,
    barWidth,
    plotHeight,
    slotWidth,
  }
}

const getBarColor = (i: number, length: number) =>
  tint(i / (length * 1.3), '#4A90E2')

interface DailyUsersBarsProps {
  data: Array<User & { messages: number }>
}

export const DailyUsersBars = ({ data }: DailyUsersBarsProps) => {
  const allMessages = data.reduce((acc, user) => acc + user.messages || 0, 0)
  const maxMessages = Math.max(...data.map((user) => user.messages), 0)
  const { axisY, barWidth, plotHeight, slotWidth } = getChartLayout(data.length)

  return (
    <svg
      width={CHART_WIDTH}
      height={CHART_HEIGHT}
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>Daily chat activity chart</title>
      <text fontSize={14} textAnchor="middle" x={80} y={30}>
        All messages: {allMessages}
      </text>
      <line
        x1={CHART_MARGIN.left}
        y1={axisY}
        x2={CHART_WIDTH - CHART_MARGIN.right}
        y2={axisY}
        stroke=" #4A4A4A"
        strokeDasharray="3 3"
      />
      {data.map((user, i) => {
        const centerX = CHART_MARGIN.left + slotWidth * i + slotWidth / 2
        const barHeight =
          maxMessages > 0
            ? Math.max(
                (user.messages / maxMessages) * plotHeight,
                MIN_BAR_HEIGHT,
              )
            : 0
        const x = centerX - barWidth / 2
        const y = axisY - barHeight

        return (
          <g key={user.id || i}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barHeight}
              fill={getBarColor(i, data.length)}
            />
            <text
              x={centerX}
              y={y - 5}
              fill="#333333"
              fontSize={12}
              fontWeight="bold"
              textAnchor="middle"
            >
              {user.messages}
            </text>
            <text
              x={centerX}
              y={axisY + 18}
              fill="#4a4a4a"
              fontSize={12}
              textAnchor="middle"
            >
              {getUserName(user)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export const getDailyUsersBarsSvg = (
  chatData: Array<User & { messages: number }>,
): string =>
  ReactDOMServer.renderToStaticMarkup(<DailyUsersBars data={chatData} />)
