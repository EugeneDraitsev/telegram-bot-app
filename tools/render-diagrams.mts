import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const diagramDir = path.join(rootDir, '.github', 'diagram')
const outputDir = path.join(rootDir, '.github')

const diagrams = ['overview', 'message-path', 'command-safety', 'stats-ui']
const themes = ['light', 'dark']

for (const diagram of diagrams) {
  for (const theme of themes) {
    const result = spawnSync(
      'bunx',
      [
        '@mermaid-js/mermaid-cli@12.0.0',
        '-i',
        path.join(diagramDir, `${diagram}.mmd`),
        '-o',
        path.join(outputDir, `architecture-${diagram}-${theme}.svg`),
        '-c',
        path.join(diagramDir, `${theme}.json`),
        '-b',
        'transparent',
        '--no-font-embed',
        '--iconPacksNamesAndUrls',
        'logos#https://unpkg.com/@iconify-json/logos/icons.json',
        'simple-icons#https://unpkg.com/@iconify-json/simple-icons/icons.json',
      ],
      { cwd: rootDir, stdio: 'inherit', shell: true },
    )

    if (result.status !== 0) {
      throw new Error(`Failed to render ${diagram} (${theme})`)
    }
  }
}
