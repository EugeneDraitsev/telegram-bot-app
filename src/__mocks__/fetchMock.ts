import fetch from 'node-fetch'
import { FetchMock } from 'jest-fetch-mock'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fetchMock: FetchMock = fetch as any
