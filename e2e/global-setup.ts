import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const stateFile = join(tmpdir(), `evenly-e2e-${process.pid}.json`)

export default async function globalSetup() {
  const project = `evenly-e2e-${process.pid}`
  const appPort = process.env.E2E_APP_PORT ?? '18000'
  const postgresPort = process.env.E2E_POSTGRES_PORT ?? '15432'
  const env = {
    ...process.env,
    APP_HOST_PORT: appPort,
    POSTGRES_HOST_PORT: postgresPort,
  }

  try {
    execFileSync(
      'docker',
      ['compose', '-p', project, '-f', join(root, 'docker-compose.yaml'), 'up', '--build', '-d'],
      { cwd: root, env, stdio: 'inherit' },
    )
    const deadline = Date.now() + 90_000
    let ready = false
    while (Date.now() < deadline) {
      try {
        const response = await fetch(`http://127.0.0.1:${appPort}/api/auth/session`)
        if (response.ok) {
          ready = true
          break
        }
      } catch {
        // The container may be running while Uvicorn is still starting.
      }
      await new Promise((resolve) => setTimeout(resolve, 1_000))
    }
    if (!ready) throw new Error(`Evenly did not become ready on port ${appPort}.`)
    writeFileSync(stateFile, JSON.stringify({ project, env }), 'utf8')
  } catch (error) {
    execFileSync('docker', ['compose', '-p', project, '-f', join(root, 'docker-compose.yaml'), 'down', '-v'], {
      cwd: root,
      env,
      stdio: 'inherit',
    })
    throw error
  }
}

export { stateFile }
