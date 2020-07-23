import { first } from 'lodash'
import axios from 'axios'
import { URLSearchParams } from 'url'

import { hasRussiansLetters } from '../utils'

const key = process.env.TRANSLATION_APP_TOKEN || 'set_your_token'

export async function translate(text: string): Promise<string> {
  const lang = hasRussiansLetters(text) ? 'ru-en' : 'ru'
  const body = new URLSearchParams()
  body.append('key', key)
  body.append('lang', lang)
  body.append('text', text)

  try {
    const result = await axios.post('https://translate.yandex.net/api/v1.5/tr.json/translate', body)
    const response = await result.data
    return first(response.text) as string
  } catch (e) {
    return 'Error from translation service'
  }
}
