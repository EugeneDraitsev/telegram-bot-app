import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

type PackageJson = {
  dependencies?: Record<string, string | undefined>
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const statisticsPackagePath = path.join(
  rootDir,
  'src',
  'sharp-statistics',
  'package.json',
)
const layerRoot = path.join(rootDir, '.layers', 'sharp')
const layerNodeRoot = path.join(layerRoot, 'nodejs')
const layerPackagePath = path.join(layerNodeRoot, 'package.json')

const statisticsPackage = JSON.parse(
  readFileSync(statisticsPackagePath, 'utf8'),
) as PackageJson
const sharpVersion = statisticsPackage.dependencies?.sharp

if (!sharpVersion) {
  throw new Error('src/sharp-statistics/package.json must declare sharp')
}

rmSync(layerRoot, { recursive: true, force: true })
mkdirSync(layerNodeRoot, { recursive: true })
writeFileSync(
  layerPackagePath,
  `${JSON.stringify(
    {
      private: true,
      dependencies: {
        sharp: sharpVersion,
      },
    },
    null,
    2,
  )}\n`,
)

const install = spawnSync(
  'npm',
  [
    'install',
    '--package-lock=false',
    '--omit=dev',
    '--os=linux',
    '--cpu=arm64',
    '--libc=glibc',
    '--include=optional',
  ],
  {
    cwd: layerNodeRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
)

if (install.status !== 0) {
  process.exit(install.status ?? 1)
}

const imgModulesPath = path.join(layerNodeRoot, 'node_modules', '@img')
const keepSharpPackages = new Set([
  'sharp-linux-arm64',
  'sharp-libvips-linux-arm64',
])
const imgModuleNames = existsSync(imgModulesPath)
  ? readdirSync(imgModulesPath)
  : []

for (const name of imgModuleNames) {
  if (name.startsWith('sharp-') && !keepSharpPackages.has(name)) {
    rmSync(path.join(imgModulesPath, name), { recursive: true, force: true })
  }
}

const requiredFiles = [
  path.join(layerNodeRoot, 'node_modules', 'sharp', 'lib', 'index.js'),
  path.join(
    layerNodeRoot,
    'node_modules',
    '@img',
    'sharp-linux-arm64',
    'lib',
    'sharp-linux-arm64.node',
  ),
  path.join(
    layerNodeRoot,
    'node_modules',
    '@img',
    'sharp-libvips-linux-arm64',
    'lib',
  ),
]

for (const requiredFile of requiredFiles) {
  if (!existsSync(requiredFile)) {
    throw new Error(`Missing sharp layer file: ${requiredFile}`)
  }
}
