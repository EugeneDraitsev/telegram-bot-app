import fetch from 'node-fetch'
import { FetchMock } from 'jest-fetch-mock'

// eslint-disable-next-line eol-last
export const fetchMock: FetchMock = fetch as any
