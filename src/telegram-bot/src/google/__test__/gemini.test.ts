import { cleanMessage, generateMultimodalCompletion } from '../gemini'

jest.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockImplementation(() => ({
        generateContent: jest.fn().mockResolvedValue({
          response: {
            text: () => 'Mocked response from Gemini',
          },
        }),
      })),
    })),
  }
})

describe('generateMultimodalCompletion', () => {
  const mockChatId = '123456'
  const mockText = 'Analyze this image'
  const mockImageBuffer = Buffer.from('mock image data')

  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('should handle text-only input', async () => {
    const result = await generateMultimodalCompletion(mockText, mockChatId)
    expect(result).toBe('Mocked response from Gemini')
  })

  test('should handle text with image', async () => {
    const result = await generateMultimodalCompletion(mockText, mockChatId, [
      mockImageBuffer,
    ])
    expect(result).toBe('Mocked response from Gemini')
  })

  test('should handle multiple images', async () => {
    const result = await generateMultimodalCompletion(mockText, mockChatId, [
      mockImageBuffer,
      mockImageBuffer,
    ])
    expect(result).toBe('Mocked response from Gemini')
  })

  test('should return NOT_ALLOWED_ERROR for unauthorized chat', async () => {
    const result = await generateMultimodalCompletion(mockText, '999999')
    expect(result).toBe('Sorry, but you are not allowed to use this feature')
  })

  test('should return PROMPT_MISSING_ERROR when no input provided', async () => {
    const result = await generateMultimodalCompletion('', mockChatId)
    expect(result).toBe('Please provide a prompt or an image')
  })
})

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

  test('should remove single "User ID" prefix and timestamp/reply suffix', () => {
    const messyMessage =
      'USER:119677179 (ayankovsky): Я считаю, что лозунги политического характера могут вызывать разногласия и споры'
    const expected =
      'Я считаю, что лозунги политического характера могут вызывать разногласия и споры'
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

  test('should handle [] in the message', () => {
    const messyMessage =
      'USER: 123 (test):\nHello\nWorld [In reply to message ID:123]'
    const expected = 'Hello\nWorld'
    expect(cleanMessage(messyMessage)).toBe(expected)
  })

  test('should handle [] the message', () => {
    const messyMessage =
      'Фух, надеюсь, меня за это не забанят! 😬 [2/21/2025, 10:36:35 PM] [In reply to message ID: 1204836]'
    const expected = 'Фух, надеюсь, меня за это не забанят! 😬'
    expect(cleanMessage(messyMessage)).toBe(expected)
  })

  test('should handle [] in the message', () => {
    const messyMessage =
      'Więc dawaj, pytaj, чем могу служить? 😁 [2/21/2025, 10:48:59 PM]'
    const expected = 'Więc dawaj, pytaj, чем могу служить? 😁'
    expect(cleanMessage(messyMessage)).toBe(expected)
  })
})
