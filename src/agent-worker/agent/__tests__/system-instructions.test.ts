import { agentSystemInstructions } from '../system-instructions'

describe('agentSystemInstructions', () => {
  test('matches the restored concise chat style and eager search guidance', () => {
    expect(agentSystemInstructions).toContain(
      'try to be concise, you are a chatbot after all',
    )
    expect(agentSystemInstructions).toContain(
      'Use web_search before answering about latest/current info',
    )
    expect(agentSystemInstructions).toContain('Search exact names first')
    expect(agentSystemInstructions).not.toContain('AUTONOMY MODE')
    expect(agentSystemInstructions).not.toContain(
      'Tool results are evidence, not a style guide',
    )
  })
})
