import { tint } from 'polished'
import ReactDOMServer from 'react-dom/server'
import { Bar, BarChart, Cell, LabelList, XAxis, YAxis } from 'recharts'
import styled from 'styled-components'
import type { User } from 'telegram-typings'

import { getUserName } from '@tg-bot/common/utils'

const ChartLabel = styled.text`
  font-weight: bold;
  line-height: 17px;
  font-size: 12px;
`

const getBarColor = (i: number, length: number) =>
  tint(i / (length * 1.3), '#4A90E2')

interface DailyUsersBarsProps {
  data: Array<User & { messages: number }>
}

export const DailyUsersBars = ({ data }: DailyUsersBarsProps) => {
  const allMessages = data.reduce((acc, user) => acc + user.messages || 0, 0)

  return (
    <BarChart
      data={data}
      margin={{ top: 20, right: 20, left: 20, bottom: 10 }}
      width={1200}
      height={400}
    >
      <text fontSize={14} textAnchor="middle" x={80} y={30}>
        All messages: {allMessages}
      </text>
      <Bar
        dataKey="messages"
        maxBarSize={50}
        minPointSize={5}
        fill="#4A90E2"
        isAnimationActive={false}
        xmlns="http://www.w3.org/2000/svg"
      >
        {data?.map((user, i: number) => (
          <Cell key={user.id || i} fill={getBarColor(i, data.length)} />
        ))}
        <LabelList
          data={[]}
          dataKey="messages"
          content={({ x, y, width, value }) => (
            <ChartLabel
              x={Number(x) + Number(width) / 2}
              y={Number(y) - 5}
              fill="#333333"
              textAnchor="middle"
            >
              {value}
            </ChartLabel>
          )}
        />
      </Bar>
      <YAxis hide padding={{ top: 30 }} />
      <XAxis
        dataKey="id"
        tickLine={false}
        axisLine={{ stroke: ' #4A4A4A', strokeDasharray: '3 3' }}
        tick={({ x, y, width, payload }) => (
          <g transform={`translate(${x},${y})`}>
            <text
              width={width}
              height="auto"
              textAnchor="middle"
              fill="#4a4a4a"
              fontSize={12}
            >
              <tspan x={0} y={0} dy={10}>
                {getUserName(data.find((d) => d.id === payload.value))}
              </tspan>
            </text>
          </g>
        )}
      />
    </BarChart>
  )
}

export const getDailyUsersBarsSvg = (
  chatData: Array<User & { messages: number }>,
): string => ReactDOMServer.renderToString(<DailyUsersBars data={chatData} />)
