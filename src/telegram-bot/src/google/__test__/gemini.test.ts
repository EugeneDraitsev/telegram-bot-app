import { cleanMessage } from '../gemini'

describe('cleanMessage', () => {
  test('should remove multiple "User ID" prefixes and timestamp/reply suffix', () => {
    const messyMessage =
      'User ID: 64196220 (draiBot): User ID: 64196220 (draiBot): User ID: 64196220 (draiBot): Ладно, попробую напрячь свои нейроны! 🤔 Но ты не жди чуда, окда? 😅 [2/21/2025, 7:58:38 PM] [In reply to message ID: 1204606]'
    const expected =
      'Ладно, попробую напрячь свои нейроны! 🤔 Но ты не жди чуда, окда? 😅'
    expect(cleanMessage(messyMessage)).toBe(expected)
  })

  test('should remove single "User ID" prefix and timestamp/reply suffix', () => {
    const messyMessage =
      'User ID: 12345 (draiBot):  Привет!    [2/22/2025, 1:23:45 AM] [In reply to message ID: 9876]'
    const expected = 'Привет!'
    expect(cleanMessage(messyMessage)).toBe(expected)
  })

  test('should remove only the timestamp/reply suffix', () => {
    const messyMessage =
      'Только одно вхождение. [2/22/2025, 1:23:45 AM] [In reply to message ID: 9876]'
    const expected = 'Только одно вхождение.'
    expect(cleanMessage(messyMessage)).toBe(expected)
  })

  test('should handle a message with no prefixes or suffixes', () => {
    const messyMessage = 'Просто текст.'
    const expected = 'Просто текст.'
    expect(cleanMessage(messyMessage)).toBe(expected)
  })

  test('should remove multiple "USER" prefixes and reply suffix', () => {
    const messyMessage =
      'USER: 111331045 (bb_bbb): USER: 789 (another_user): Ой, не буду я шутить! 😬 [In reply to message ID: 123]'
    const expected = 'Ой, не буду я шутить! 😬'
    expect(cleanMessage(messyMessage)).toBe(expected)
  })

  test('should remove single "USER" prefix and reply suffix', () => {
    const messyMessage =
      'USER: 119677179 (aaaa): Ладно, если так настаиваешь... 😉 [In reply to message ID: 218432]'
    const expected = 'Ладно, если так настаиваешь... 😉'
    expect(cleanMessage(messyMessage)).toBe(expected)
  })

  test('should remove only the reply suffix', () => {
    const messyMessage = 'Какой-то текст [In reply to message ID: 456]'
    const expected = 'Какой-то текст'
    expect(cleanMessage(messyMessage)).toBe(expected)
  })

  test('should handle leading and trailing spaces', () => {
    const messyMessage =
      '   USER: 123 (abc):  Текст с пробелами.   [In reply to message ID: 789]   '
    const expected = 'Текст с пробелами.'
    expect(cleanMessage(messyMessage)).toBe(expected)
  })

  test('should handle empty input', () => {
    const messyMessage = ''
    const expected = ''
    expect(cleanMessage(messyMessage)).toBe(expected)
  })

  test('should handle input with only spaces', () => {
    const messyMessage = '   '
    const expected = ''
    expect(cleanMessage(messyMessage)).toBe(expected)
  })

  test('should handle input with only prefix', () => {
    const messyMessage = 'USER: 123 (test):'
    const expected = ''
    expect(cleanMessage(messyMessage)).toBe(expected)
  })

  test('should handle input with only suffix', () => {
    const messyMessage = '[In reply to message ID: 1]'
    const expected = ''
    expect(cleanMessage(messyMessage)).toBe(expected)
  })

  test('should handle newlines in the message', () => {
    const messyMessage =
      'USER: 123 (test):\nHello\nWorld [In reply to message ID: 123]'
    const expected = 'Hello\nWorld'
    expect(cleanMessage(messyMessage)).toBe(expected)
  })
})
