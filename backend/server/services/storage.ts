import fs from 'fs'
import path from 'path'

/**
 * Resolves the directory where the file-backed productivity data should live.
 *
 * @returns Absolute directory path used for JSON persistence.
 */
function getDataDirectory (): string {
  const configuredDirectory = process.env.PRODUCTIVITY_DATA_DIR

  if (configuredDirectory !== undefined && configuredDirectory.trim() !== '') {
    return configuredDirectory
  }

  return path.join(process.cwd(), 'server', 'data')
}

/**
 * Builds the absolute path for a specific JSON data file.
 *
 * @param filename Storage filename relative to the data directory.
 * @returns Absolute file path for that JSON payload.
 */
export function getDataFilePath (filename: string): string {
  return path.join(getDataDirectory(), filename)
}

// Every service reads through this helper so missing JSON files are created
// lazily and the app can boot with an empty data directory.
/**
 * Reads a JSON file from the productivity data directory, creating it first if
 * it does not exist yet.
 *
 * @template T JSON payload shape.
 * @param filename Storage filename relative to the data directory.
 * @param defaultValue Value written when the file is missing.
 * @returns Parsed JSON value from disk.
 */
export function readJsonFile<T> (filename: string, defaultValue: T): T {
  const filePath = getDataFilePath(filename)
  ensureJsonFile(filePath, defaultValue)

  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
}

// Writes are centralized here so persistence format stays consistent.
/**
 * Persists a JSON payload into the productivity data directory.
 *
 * @template T JSON payload shape.
 * @param filename Storage filename relative to the data directory.
 * @param value Value to serialize.
 */
export function writeJsonFile<T> (filename: string, value: T): void {
  const filePath = getDataFilePath(filename)
  ensureJsonFile(filePath, value)
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2))
}

/**
 * Ensures the parent directory and JSON file exist before any read or write.
 *
 * @template T JSON payload shape.
 * @param filePath Absolute file path to verify.
 * @param defaultValue Initial value written for first-time files.
 */
function ensureJsonFile<T> (filePath: string, defaultValue: T): void {
  const directoryPath = path.dirname(filePath)

  if (!fs.existsSync(directoryPath)) {
    // Create the nested data directory on first run or inside a clean container.
    fs.mkdirSync(directoryPath, { recursive: true })
  }

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2))
  }
}
