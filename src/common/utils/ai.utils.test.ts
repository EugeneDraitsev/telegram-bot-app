import {
  cleanModelMessage,
  isAiEnabledChat,
  multimodalSystemInstructions,
  offlineMultimodalSystemInstructions,
  systemInstructions,
} from './ai.utils'

/**
 * Tests for isAiEnabledChat.
 * Note: AI_ALLOWED_CHAT_IDS is loaded at module import time from process.env.OPENAI_CHAT_IDS.
 * These tests verify the function logic using whatever OPENAI_CHAT_IDS is set in the test environment.
 */
describe('isAiEnabledChat', () => {
  // These tests don't rely on specific env values - they test edge cases
  test('returns false for undefined chatId', () => {
    expect(isAiEnabledChat(undefined)).toBe(false)
  })

  test('returns false for empty string chatId', () => {
    expect(isAiEnabledChat('')).toBe(false)
  })

  test('returns boolean for any numeric chatId', () => {
    // Function should always return a boolean, regardless of whether chat is allowed
    expect(typeof isAiEnabledChat(12345)).toBe('boolean')
    expect(typeof isAiEnabledChat(-999)).toBe('boolean')
  })

  test('returns boolean for string chatId', () => {
    expect(typeof isAiEnabledChat('12345')).toBe('boolean')
  })
})

describe('systemInstructions', () => {
  test('keeps rough group-chat style guidance in every shared prompt variant', () => {
    for (const prompt of [
      systemInstructions,
      multimodalSystemInstructions,
      offlineMultimodalSystemInstructions,
    ]) {
      expect(prompt).toContain('informal Telegram group-chat voice')
      expect(prompt).toContain('Profanity is allowed and expected')
      expect(prompt).toContain('Do not neutralize rude nicknames')
      expect(prompt).toContain(
        'Search and retrieved sources are for factual grounding only',
      )
      expect(prompt).toContain('Keep casual chat answers compact')
      expect(prompt).toContain('Never append opt-in offers')
    }
  })

  test('keeps eager search guidance', () => {
    expect(systemInstructions).toContain(
      'If there is any chance the answer depends on fresh, uncertain, ambiguous, newly released, or possibly misspelled real-world information, use search first',
    )
    expect(systemInstructions).toContain('When in doubt, search')
    expect(systemInstructions).toContain(
      'For named products, models, companies, or people, search the exact user wording first',
    )
  })
})

describe('cleanModelMessage', () => {
  test('should remove multiple "User ID" prefixes and timestamp/reply suffix', () => {
    const messyMessage =
      'User ID: 64196220 (draiBot): User ID: 64196220 (draiBot): User ID: 64196220 (draiBot): Ладно, попробую напрячь свои нейроны! 🤔 Но ты не жди чуда, окда? 😅 [2/21/2025, 7:58:38 PM] [In reply to message ID: 1204606]'
    const expected =
      'Ладно, попробую напрячь свои нейроны! 🤔 Но ты не жди чуда, окда? 😅'
    expect(cleanModelMessage(messyMessage)).toBe(expected)
  })

  test('should remove single "User ID" prefix and timestamp/reply suffix', () => {
    const messyMessage =
      'User ID: 12345 (draiBot):  Привет!    [2/22/2025, 1:23:45 AM] [In reply to message ID: 9876]'
    const expected = 'Привет!'
    expect(cleanModelMessage(messyMessage)).toBe(expected)
  })

  test('should remove single "User ID" prefix and timestamp/reply suffix', () => {
    const messyMessage =
      'USER:119677179 (ayankovsky): Я считаю, что лозунги политического характера могут вызывать разногласия и споры'
    const expected =
      'Я считаю, что лозунги политического характера могут вызывать разногласия и споры'
    expect(cleanModelMessage(messyMessage)).toBe(expected)
  })

  test('should remove only the timestamp/reply suffix', () => {
    const messyMessage =
      'Только одно вхождение. [2/22/2025, 1:23:45 AM] [In reply to message ID: 9876]'
    const expected = 'Только одно вхождение.'
    expect(cleanModelMessage(messyMessage)).toBe(expected)
  })

  test('should handle a message with no prefixes or suffixes', () => {
    const messyMessage = 'Просто текст.'
    const expected = 'Просто текст.'
    expect(cleanModelMessage(messyMessage)).toBe(expected)
  })

  test('should remove multiple "USER" prefixes and reply suffix', () => {
    const messyMessage =
      'USER: 111331045 (bb_bbb): USER: 789 (another_user): Ой, не буду я шутить! 😬 [In reply to message ID: 123]'
    const expected = 'Ой, не буду я шутить! 😬'
    expect(cleanModelMessage(messyMessage)).toBe(expected)
  })

  test('should remove single "USER" prefix and reply suffix', () => {
    const messyMessage =
      'USER: 119677179 (aaaa): Ладно, если так настаиваешь... 😉 [In reply to message ID: 218432]'
    const expected = 'Ладно, если так настаиваешь... 😉'
    expect(cleanModelMessage(messyMessage)).toBe(expected)
  })

  test('should remove only the reply suffix', () => {
    const messyMessage = 'Какой-то текст [In reply to message ID: 456]'
    const expected = 'Какой-то текст'
    expect(cleanModelMessage(messyMessage)).toBe(expected)
  })

  test('should handle leading and trailing spaces', () => {
    const messyMessage =
      '   USER: 123 (abc):  Текст с пробелами.   [In reply to message ID: 789]   '
    const expected = 'Текст с пробелами.'
    expect(cleanModelMessage(messyMessage)).toBe(expected)
  })

  test('should handle empty input', () => {
    const messyMessage = ''
    const expected = ''
    expect(cleanModelMessage(messyMessage)).toBe(expected)
  })

  test('should handle input with only spaces', () => {
    const messyMessage = '   '
    const expected = ''
    expect(cleanModelMessage(messyMessage)).toBe(expected)
  })

  test('should handle input with only prefix', () => {
    const messyMessage = 'USER: 123 (test):'
    const expected = ''
    expect(cleanModelMessage(messyMessage)).toBe(expected)
  })

  test('should handle input with only suffix', () => {
    const messyMessage = '[In reply to message ID: 1]'
    const expected = ''
    expect(cleanModelMessage(messyMessage)).toBe(expected)
  })

  test('should handle newlines in the message', () => {
    const messyMessage =
      'USER: 123 (test):\nHello\nWorld [In reply to message ID: 123]'
    const expected = 'Hello\nWorld'
    expect(cleanModelMessage(messyMessage)).toBe(expected)
  })

  test('should handle [] in the message', () => {
    const messyMessage =
      'USER: 123 (test):\nHello\nWorld [In reply to message ID:123]'
    const expected = 'Hello\nWorld'
    expect(cleanModelMessage(messyMessage)).toBe(expected)
  })

  test('should handle [] the message', () => {
    const messyMessage =
      'Фух, надеюсь, меня за это не забанят! 😬 [2/21/2025, 10:36:35 PM] [In reply to message ID: 1204836]'
    const expected = 'Фух, надеюсь, меня за это не забанят! 😬'
    expect(cleanModelMessage(messyMessage)).toBe(expected)
  })

  test('should handle \\" in the message', () => {
    const messyMessage =
      'и его \\"теорию двойного времени\\", а потом про \\"православный РЭБ\\"!'
    const expected =
      'и его "теорию двойного времени", а потом про "православный РЭБ"!'
    expect(cleanModelMessage(messyMessage)).toBe(expected)
  })

  test('should handle \\n in the message', () => {
    const messyMessage = 'и его \\nтеорию двойного времени\\n!'
    const expected = 'и его \nтеорию двойного времени\n!'
    expect(cleanModelMessage(messyMessage)).toBe(expected)
  })

  test('should handle [] in the message', () => {
    const messyMessage =
      'Więc dawaj, pytaj, чем могу служить? 😁 [2/21/2025, 10:48:59 PM]'
    const expected = 'Więc dawaj, pytaj, чем могу служить? 😁'
    expect(cleanModelMessage(messyMessage)).toBe(expected)
  })

  test('should strip HTML tags like <img>, <br>, <center>', () => {
    expect(cleanModelMessage('Hello<br>World')).toBe('Hello\nWorld')
    expect(cleanModelMessage('Text<img src="x">End')).toBe('TextEnd')
    expect(cleanModelMessage('<center>Centered</center>')).toBe('Centered')
  })

  test('should keep non-HTML angle bracket content', () => {
    expect(cleanModelMessage('Use Array<string> and Map<K, V>')).toBe(
      'Use Array<string> and Map<K, V>',
    )
    expect(cleanModelMessage('1 < 2 and 3 > 1')).toBe('1 < 2 and 3 > 1')
  })

  test('should unescape model pre-escaped markdown characters', () => {
    expect(cleanModelMessage('Use \\*bold\\* and \\_italic\\_')).toBe(
      'Use *bold* and _italic_',
    )
    expect(cleanModelMessage('Item \\#1 \\- done')).toBe('Item #1 - done')
    expect(cleanModelMessage('sum \\= 10 \\+ 5')).toBe('sum = 10 + 5')
  })

  test('should normalize excessive blank lines', () => {
    expect(cleanModelMessage('a\n\n\n\n\nb')).toBe('a\n\nb')
  })
})
