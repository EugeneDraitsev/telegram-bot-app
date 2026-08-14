import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const diagramDir = path.join(rootDir, '.github', 'diagram')
const outputDir = path.join(rootDir, '.github')

const diagrams = ['overview', 'message-path', 'stats-ui']
const themes = ['light', 'dark']

for (const diagram of diagrams) {
  for (const theme of themes) {
    const result = spawnSync(
      'bunx',
      [
        '@mermaid-js/mermaid-cli@11',
        '-i',
        path.join(diagramDir, `${diagram}.mmd`),
        '-o',
        path.join(outputDir, `architecture-${diagram}-${theme}.svg`),
        '-c',
        path.join(diagramDir, `${theme}.json`),
        '-b',
        'transparent',
        '--iconPacks',
        '@iconify-json/logos',
        '@iconify-json/simple-icons',
      ],
      { cwd: rootDir, stdio: 'inherit', shell: true },
    )

    if (result.status !== 0) {
      throw new Error(`Failed to render ${diagram} (${theme})`)
    }
  }
}
