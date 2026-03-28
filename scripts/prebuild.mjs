import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const root = path.resolve(__dirname, '..')

const distDir = path.join(root, 'dist')
const distElectronDir = path.join(root, 'dist-electron')
const buildDir = path.join(root, 'build')

const iconPngPath = path.join(buildDir, 'icon.png')
const iconIcoPath = path.join(buildDir, 'icon.ico')

async function rmIfExists(p) {
  await fs.rm(p, { recursive: true, force: true })
}

async function ensureIconsExist() {
  await fs.mkdir(buildDir, { recursive: true })
  try {
    await fs.access(iconIcoPath)
    await fs.access(iconPngPath)
  } catch {
    throw new Error('Missing app icons. Expected: build/icon.ico and build/icon.png')
  }
}

async function main() {
  await rmIfExists(distDir)
  await rmIfExists(distElectronDir)
  await ensureIconsExist()
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
