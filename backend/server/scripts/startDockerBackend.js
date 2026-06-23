const fs = require('fs')
const path = require('path')
const { spawn, spawnSync } = require('child_process')

/**
 * Docker bootstrapper for the backend container.
 *
 * It ensures the reviewer demo dataset exists before the API starts so the
 * tracker, summaries, and historical search all have content on first load.
 */
function main () {
  if (shouldSeedDemoData()) {
    process.stdout.write('Docker startup: seeding June demo data because the mounted data directory was missing or empty.\n')
    runStep('npm', ['run', 'seed:demo-data'])
  } else {
    process.stdout.write('Docker startup: existing productivity data detected, keeping current files.\n')
  }

  runStep('npm', ['run', 'build'])

  if (process.env.PRODUCTIVITY_DOCKER_BOOTSTRAP_ONLY === '1') {
    process.stdout.write('Docker startup: bootstrap-only mode enabled, skipping server launch.\n')
    return
  }

  const server = spawn('node', ['build/server/index.js'], {
    stdio: 'inherit',
    cwd: process.cwd()
  })

  server.on('exit', code => {
    process.exit(code ?? 0)
  })
}

/**
 * Checks whether the mounted data directory is missing the reviewer dataset.
 *
 * @returns `true` when demo data should be seeded before startup.
 */
function shouldSeedDemoData () {
  const dataDirectory = path.join(process.cwd(), 'server', 'data')
  const requiredFiles = [
    path.join(dataDirectory, 'tasks.json'),
    path.join(dataDirectory, 'weeklySummaries.json'),
    path.join(dataDirectory, 'weeklySummarySearchIndex.json')
  ]

  return requiredFiles.some(filePath => isMissingOrEmptyArray(filePath))
}

/**
 * Treats missing or empty JSON-array files as absent reviewer data.
 *
 * @param filePath Absolute JSON file path to inspect.
 * @returns `true` when the file is missing, unreadable, or empty.
 */
function isMissingOrEmptyArray (filePath) {
  if (!fs.existsSync(filePath)) {
    return true
  }

  try {
    const parsedValue = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    return !Array.isArray(parsedValue) || parsedValue.length === 0
  } catch (error) {
    return true
  }
}

/**
 * Runs one blocking startup step and exits immediately if it fails.
 *
 * @param command Executable to run.
 * @param args Command arguments.
 */
function runStep (command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    cwd: process.cwd()
  })

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

main()
