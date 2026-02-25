import type { Context } from 'grammy/web'

import { getCommandData, getMediaGroupMessages } from '@tg-bot/common'

export async function handleDebugImages(ctx: Context) {
  const extraMessages = await getMediaGroupMessages(ctx)
  const { images, text, combinedText, replyId } = getCommandData(
    ctx.message,
    extraMessages,
  )

  const imagesInfo = images
    .map(
      (img, i) =>
        `${i + 1}. ${img.width}x${img.height} (id: ${img.file_id.slice(0, 10)}...)`,
    )
    .join('\n')

  const response = `Text: ${text}\nCombined Text: ${combinedText}\n\nReplyId: ${replyId}\n\nImages (${images.length}):\n${imagesInfo} \n${JSON.stringify(extraMessages, null, 2)}`

  return ctx.reply(response, {
    reply_parameters: { message_id: replyId },
  })
}
