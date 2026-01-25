import { unEscape } from '@tg-bot/common/utils'

const timeout = 5_000
const googleApiKey = process.env.COMMON_GOOGLE_API_KEY || 'set_your_token'

export const translate = async (
  text: string,
  targetLanguage = '',
): Promise<string> => {
  const detectUrl = `https://translation.googleapis.com/language/translate/v2/detect?key=${googleApiKey}`
  const translateUrl = `https://translation.googleapis.com/language/translate/v2?key=${googleApiKey}`
  const date = new Date(
    new Date().toLocaleString('en-US', {
      timeZone: 'Europe/Minsk',
    }),
  )
  const isBelarusianDay = date.getDay() === 4

  try {
    const inputLanguage = await fetch(detectUrl, {
      signal: globalThis.AbortSignal.timeout(timeout),
      method: 'POST',
      body: JSON.stringify({ q: text }),
    })
      .then((x) => x.json())
      .then((x) => x.data.detections?.[0]?.[0]?.language)

    const defaultTargetFromEn = isBelarusianDay ? 'be' : 'ru'
    const target =
      targetLanguage ||
      (inputLanguage === defaultTargetFromEn ? 'en' : defaultTargetFromEn)

    const translateResponse = await fetch(translateUrl, {
      signal: globalThis.AbortSignal.timeout(timeout),
      method: 'POST',
      body: JSON.stringify({ q: text, target }),
    })
    const translateData = await translateResponse.json()
    const translatedText = translateData.data?.translations?.[0]?.translatedText
    if (!translatedText) {
      throw new Error('Empty translation response')
    }

    return unEscape(translatedText)
  } catch (_e) {
    return 'Error from translation service'
  }
}
