import { createRequire as createNodeRequire } from 'node:module'
import path from 'node:path'

import { isOffline, logger, renderSharpImage } from '@tg-bot/common'
import type { CurrencyRateSection } from './types'

const SHARP_RENDERER_PACKAGE_PATH = path.join(
  process.cwd(),
  'src',
  'sharp-renderer',
  'package.json',
)

type SharpFactory = (input: Buffer) => {
  png: () => {
    toBuffer: () => Promise<Buffer>
  }
}

type CurrencyRatesComponent = {
  getCurrencyRatesSvg: (
    sections: CurrencyRateSection[],
    backgroundImage?: string,
  ) => string
}

function shouldRenderLocally() {
  return process.env.stage === 'local' || isOffline()
}

async function renderCurrencyImageLocally(
  sections: CurrencyRateSection[],
  backgroundImage?: Buffer,
) {
  const requireFromSharpRenderer = createNodeRequire(
    SHARP_RENDERER_PACKAGE_PATH,
  )
  const sharp = requireFromSharpRenderer('sharp') as SharpFactory
  const { getCurrencyRatesSvg } = (await import(
    '../../sharp-renderer/currency-rates.component.js'
  )) as CurrencyRatesComponent

  return sharp(
    Buffer.from(
      getCurrencyRatesSvg(sections, backgroundImage?.toString('base64')),
    ),
  )
    .png()
    .toBuffer()
}

export async function getCurrencyImage(
  sections: CurrencyRateSection[],
  backgroundImage?: Buffer,
): Promise<Buffer | null> {
  try {
    if (shouldRenderLocally()) {
      return await renderCurrencyImageLocally(sections, backgroundImage)
    }

    return await renderSharpImage({
      currencySections: sections,
      currencyBackgroundImage: backgroundImage?.toString('base64'),
    })
  } catch (error) {
    logger.warn({ error }, 'currency.image_failed')
    return null
  }
}
