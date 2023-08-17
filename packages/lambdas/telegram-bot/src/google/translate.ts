import { unEscape } from '@tg-bot/common/utils'

const timeout = 5_000
const googleApiKey = process.env.GOOGLE_API_KEY || 'set_your_token'

export const translate = async (
  text: string,
  targetLanguage = '',
): Promise<string> => {
  const detectUrl = `https://translation.googleapis.com/language/translate/v2/detect?key=${googleApiKey}`
  const translateUrl = `https://translation.googleapis.com/language/translate/v2?key=${googleApiKey}`

  try {
    const inputLanguage = await fetch(detectUrl, {
      signal: AbortSignal.timeout(timeout),
      method: 'POST',
      body: JSON.stringify({ q: text }),
    })
      .then((x) => x.json())
      .then((x) => x.data.detections?.[0]?.[0]?.language)

    const target = targetLanguage || (inputLanguage === 'ru' ? 'en' : 'ru')

    return fetch(translateUrl, {
      signal: AbortSignal.timeout(timeout),
      method: 'POST',
      body: JSON.stringify({ q: text, target }),
    })
      .then((x) => x.json())
      .then((x) => unEscape(x.data.translations?.[0]?.translatedText))
  } catch (e) {
    return 'Error from translation service'
  }
}
