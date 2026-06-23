const { spawnSync } = require('child_process')

/**
 * Builds the backend as a real compiled directory tree so runtime modules that
 * scan `server/entities` continue to work in Docker and local builds.
 */
const result = spawnSync('npx', ['tsc', '--project', 'tsconfig.json'], {
  stdio: 'inherit',
  cwd: process.cwd()
})

if (result.status !== 0) {
  process.exit(result.status ?? 1)
}
