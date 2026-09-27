import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { stateFile } from './global-setup'

export default function globalTeardown() {
  if (!existsSync(stateFile)) return
  const { project, env } = JSON.parse(readFileSync(stateFile, 'utf8')) as {
    project: string
    env: NodeJS.ProcessEnv
  }
  try {
    execFileSync('docker', ['compose', '-p', project, '-f', 'docker-compose.yaml', 'down', '-v'], {
      cwd: process.cwd().endsWith('e2e') ? '..' : process.cwd(),
      env,
      stdio: 'inherit',
    })
  } finally {
    rmSync(stateFile, { force: true })
  }
}
