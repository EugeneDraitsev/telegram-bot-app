import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// ffmpeg-static 5.3.0 ships the b6.1.1 static builds, including linux-arm64.
const FFMPEG_STATIC_VERSION = '5.3.0'
const ELF_MAGIC = '7f454c46'
const ELF_MACHINE_AARCH64 = 0xb7

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const layerRoot = path.join(rootDir, '.layers', 'ffmpeg')
const layerBinRoot = path.join(layerRoot, 'bin')
const buildRoot = path.join(rootDir, '.layers', 'ffmpeg-build')

/** Lambda rejects a foreign binary at runtime, so fail the build instead. */
function assertLinuxArm64Executable(binaryPath: string) {
  const header = Buffer.alloc(20)
  const descriptor = openSync(binaryPath, 'r')
  try {
    readSync(descriptor, header, 0, header.length, 0)
  } finally {
    closeSync(descriptor)
  }

  if (
    header.subarray(0, 4).toString('hex') !== ELF_MAGIC ||
    header.readUInt16LE(18) !== ELF_MACHINE_AARCH64
  ) {
    throw new Error(`Not a linux arm64 ffmpeg binary: ${binaryPath}`)
  }
}

rmSync(layerRoot, { recursive: true, force: true })
rmSync(buildRoot, { recursive: true, force: true })
mkdirSync(buildRoot, { recursive: true })
writeFileSync(
  path.join(buildRoot, 'package.json'),
  `${JSON.stringify(
    {
      private: true,
      dependencies: {
        'ffmpeg-static': FFMPEG_STATIC_VERSION,
      },
    },
    null,
    2,
  )}\n`,
)

// ffmpeg-static picks its download from npm_config_platform/npm_config_arch,
// so the host platform never decides which binary lands in the layer.
const install = spawnSync(
  'npm',
  ['install', '--package-lock=false', '--omit=dev'],
  {
    cwd: buildRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      npm_config_platform: 'linux',
      npm_config_arch: 'arm64',
    },
  },
)

if (install.status !== 0) {
  process.exit(install.status ?? 1)
}

const downloadedBinary = path.join(
  buildRoot,
  'node_modules',
  'ffmpeg-static',
  'ffmpeg',
)

if (!existsSync(downloadedBinary)) {
  throw new Error(`Missing ffmpeg layer binary: ${downloadedBinary}`)
}

assertLinuxArm64Executable(downloadedBinary)

// Lambda extracts layers into /opt and puts /opt/bin on PATH.
mkdirSync(layerBinRoot, { recursive: true })
const layerBinary = path.join(layerBinRoot, 'ffmpeg')
copyFileSync(downloadedBinary, layerBinary)
chmodSync(layerBinary, 0o755)
rmSync(buildRoot, { recursive: true, force: true })
