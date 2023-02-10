import axios from 'axios'

import { unEscape } from '@tg-bot/common/utils'

const googleApiKey = process.env.GOOGLE_API_KEY || 'set_your_token'

export const translate = async (text: string, targetLanguage = ''): Promise<string> => {
  const detectUrl = `https://translation.googleapis.com/language/translate/v2/detect?key=${googleApiKey}`
  const translateUrl = `https://translation.googleapis.com/language/translate/v2?key=${googleApiKey}`

  try {
    const inputLanguage = await axios(detectUrl, {
      timeout: 5000,
      method: 'POST',
      data: { q: text },
    }).then(({ data }) => data.data.detections?.[0]?.[0]?.language)

    const target = targetLanguage || (inputLanguage === 'ru' ? 'en' : 'ru')

    return axios(translateUrl, {
      timeout: 5000,
      method: 'POST',
      data: { q: text, target },
    }).then((x) => unEscape(x.data.data.translations?.[0]?.translatedText))
  } catch (e) {
    return 'Error from translation service'
  }
}
