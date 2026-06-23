import { loadedEnvPath } from '../config/loadEnv'

import { getDataFilePath } from '../services/storage'

/**
 * Prints the resolved environment and storage settings used by the weekly
 * summary feature so local setup issues are easy to diagnose.
 */
function main (): void {
  const apiKey = process.env.ANTHROPIC_API_KEY
  const apiKeyStatus = apiKey == null || apiKey.trim() === ''
    ? 'missing'
    : `loaded (${maskSecret(apiKey)})`

  process.stdout.write(`ANTHROPIC_API_KEY: ${apiKeyStatus}\n`)
  process.stdout.write(`ANTHROPIC_MODEL: ${process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5'}\n`)
  process.stdout.write(`ENV_FILE: ${loadedEnvPath ?? 'not found'}\n`)
  // Report the resolved data directory so path issues are easy to diagnose.
  process.stdout.write(`PRODUCTIVITY_DATA_DIR: ${getDataFilePath('.').replace(/\/\.$/, '')}\n`)
}

/**
 * Obscures the middle of a secret while still showing enough characters to
 * confirm which value was loaded.
 *
 * @param value Raw secret value.
 * @returns Masked secret preview safe for terminal output.
 */
function maskSecret (value: string): string {
  if (value.length <= 8) {
    return '***'
  }

  return `${value.slice(0, 4)}...${value.slice(-4)}`
}

main()
