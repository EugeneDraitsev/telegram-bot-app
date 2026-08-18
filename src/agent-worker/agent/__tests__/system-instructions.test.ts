import { agentSystemInstructions } from '../system-instructions'

describe('agentSystemInstructions', () => {
  test('matches the restored concise chat style and eager search guidance', () => {
    expect(agentSystemInstructions).toContain(
      'try to be concise, you are a chatbot after all',
    )
    expect(agentSystemInstructions).toContain(
      'Use web_search before answering about latest/current info',
    )
    expect(agentSystemInstructions).toContain(
      'When calling generate_or_edit_image, build the image prompt from the current user message',
    )
    expect(agentSystemInstructions).toContain(
      'Call generate_video_with_veo only when the current user explicitly asks',
    )
    expect(agentSystemInstructions).toContain(
      'Each MEDIA has a stable media_id and belongs only to the message immediately above it',
    )
    expect(agentSystemInstructions).toContain(
      'Call generate_music_with_lyria only when the current user explicitly asks',
    )
    expect(agentSystemInstructions).toContain(
      'Natural-language and /lyria requests always create a 30-second Clip',
    )
    expect(agentSystemInstructions).toContain(
      'Lyria cannot continue or edit audio from a reply',
    )
    expect(agentSystemInstructions).toContain(
      'create a new full-length rendition from the current request and relevant visible text context',
    )
    expect(agentSystemInstructions).toContain(
      "always provide a short natural caption in the user's language",
    )
    expect(agentSystemInstructions).toContain('call render_latex')
    expect(agentSystemInstructions).toContain('call render_svg_to_png')
    expect(agentSystemInstructions).toContain('Search exact names first')
    expect(agentSystemInstructions).toContain(
      'Never attempt to modify global memory',
    )
    expect(agentSystemInstructions).not.toContain('AUTONOMY MODE')
    expect(agentSystemInstructions).not.toContain(
      'Tool results are evidence, not a style guide',
    )
  })
})
