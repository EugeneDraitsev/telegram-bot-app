import axios from 'axios'

const googleApiKey = process.env.GOOGLE_API_KEY || 'set_your_token'

export const translate = async (text: string): Promise<string> => {
  const detectUrl = `https://translation.googleapis.com/language/translate/v2/detect?key=${googleApiKey}`
  const translateUrl = `https://translation.googleapis.com/language/translate/v2?key=${googleApiKey}`

  try {
    const inputLanguage = await axios(detectUrl, {
      timeout: 5000,
      method: 'POST',
      data: { q: text },
    }).then(({ data }) => data.data.detections?.[0]?.[0]?.language)

    const target = inputLanguage === 'ru' ? 'en' : 'ru'

    return axios(translateUrl, {
      timeout: 5000,
      method: 'POST',
      data: { q: text, target },
    }).then((x) => x.data.data.translations?.[0]?.translatedText)
  } catch (e) {
    return 'Error from translation service'
  }
}
