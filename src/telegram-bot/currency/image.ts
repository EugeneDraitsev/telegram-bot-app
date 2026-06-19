import { createRequire as createNodeRequire } from 'node:module'
import path from 'node:path'

import { invokeLambda, logger, safeJSONParse } from '@tg-bot/common'
import type { CurrencyRateSection } from './types'

const SHARP_LAMBDA_NAME = `telegram-${process.env.stage}-sharp-statistics`
const SHARP_STATISTICS_PACKAGE_PATH = path.join(
  process.cwd(),
  'src',
  'sharp-statistics',
  'package.json',
)

type SharpFactory = (input: Buffer) => {
  png: () => {
    toBuffer: () => Promise<Buffer>
  }
}

type CurrencyRatesComponent = {
  getCurrencyRatesSvg: (sections: CurrencyRateSection[]) => string
}

function shouldRenderLocally() {
  return process.env.stage === 'local' || process.env.IS_OFFLINE === 'true'
}

async function renderCurrencyImageLocally(sections: CurrencyRateSection[]) {
  const requireFromSharpStatistics = createNodeRequire(
    SHARP_STATISTICS_PACKAGE_PATH,
  )
  const sharp = requireFromSharpStatistics('sharp') as SharpFactory
  const { getCurrencyRatesSvg } = (await import(
    '../../sharp-statistics/currency-rates.component.js'
  )) as CurrencyRatesComponent

  return sharp(Buffer.from(getCurrencyRatesSvg(sections)))
    .png()
    .toBuffer()
}

export async function getCurrencyImage(
  sections: CurrencyRateSection[],
): Promise<Buffer | null> {
  try {
    if (shouldRenderLocally()) {
      return await renderCurrencyImageLocally(sections)
    }

    const sharpResponse = await invokeLambda({
      name: SHARP_LAMBDA_NAME,
      payload: { currencySections: sections },
    })

    if (sharpResponse.FunctionError) {
      logger.warn(
        { error: sharpResponse.FunctionError },
        'currency.image_function_error',
      )
      return null
    }

    const payload = safeJSONParse(
      new TextDecoder().decode(sharpResponse.Payload),
    )
    if (typeof payload?.body !== 'string') {
      return null
    }

    return Buffer.from(payload.body, 'base64')
  } catch (error) {
    logger.warn({ error }, 'currency.image_failed')
    return null
  }
}
