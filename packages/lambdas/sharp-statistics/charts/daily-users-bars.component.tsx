/* eslint-disable react/function-component-definition,react/no-unstable-nested-components */
import React from 'react'
import styled from 'styled-components'
import { tint } from 'polished'
import { BarChart, XAxis, Bar, Cell, LabelList, YAxis } from 'recharts'
import { User } from 'telegram-typings'
import { map, sumBy } from 'lodash'
import ReactDOMServer from 'react-dom/server'

import { getUserName } from '@tg-bot/common/utils'

const ChartLabel = styled.text`
  font-weight: bold;
  line-height: 17px;
  font-size: 12px;
`

const getBarColor = (i: number, length: number) => tint(i / (length * 1.3), '#4A90E2')

interface DailyUsersBarsProps {
  data: User[]
}

export const DailyUsersBars = ({ data }: DailyUsersBarsProps) => {
  const allMessages = sumBy(data, 'messages')

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
        {map(data, (d, i: number) => (
          <Cell key={i} fill={getBarColor(i, data.length)} />
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
            <text width={width} height="auto" textAnchor="middle" fill="#4a4a4a" fontSize={12}>
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

export const getDailyUsersBarsSvg = (chatData: User[]): string =>
  ReactDOMServer.renderToString(<DailyUsersBars data={chatData} />)
