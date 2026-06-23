import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

/**
 * Candidate `.env` locations that cover local development, script execution,
 * and the built server output.
 */
// Probe a few likely runtime locations so local dev, scripts, and Docker all
// resolve the same environment variables without extra setup.
const envPathCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'backend/.env'),
  path.resolve(__dirname, '../.env'),
  path.resolve(__dirname, '../../.env')
]

/**
 * Absolute path to the first `.env` file discovered at startup, if any.
 */
export const loadedEnvPath = envPathCandidates.find(candidatePath => fs.existsSync(candidatePath))

dotenv.config(loadedEnvPath == null
  ? { override: true }
  : { path: loadedEnvPath, override: true })
