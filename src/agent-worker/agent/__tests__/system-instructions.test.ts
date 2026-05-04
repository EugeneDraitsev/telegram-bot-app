import { agentSystemInstructions } from '../system-instructions'

describe('agentSystemInstructions', () => {
  test('keeps compact chat style and eager search guidance', () => {
    expect(agentSystemInstructions).toContain(
      'For casual chat questions, prefer 1-4 short sentences',
    )
    expect(agentSystemInstructions).toContain(
      'Use web_search before answering about latest/current info',
    )
    expect(agentSystemInstructions).toContain('Search exact names first')
    expect(agentSystemInstructions).toContain(
      'Tool results are evidence, not a style guide',
    )
  })
})
