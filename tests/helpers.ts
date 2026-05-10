import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

export function git(dir: string, cmd: string): void {
  execSync(`git ${cmd}`, { cwd: dir, stdio: 'pipe' })
}

export function commit(dir: string, msg: string): void {
  git(dir, `commit --allow-empty -m "${msg}"`)
}

export function parseGithubOutput(content: string): Record<string, string> {
  const result: Record<string, string> = {}
  const lines = content.split('\n')
  let i = 0
  while (i < lines.length) {
    const header = lines[i].match(/^(\w+)<<(.+)$/)
    if (header) {
      const [, key, delimiter] = header
      const valueLines: string[] = []
      i++
      while (i < lines.length && lines[i] !== delimiter) {
        valueLines.push(lines[i])
        i++
      }
      result[key] = valueLines.join('\n')
    }
    i++
  }
  return result
}

export function assert(cond: boolean, msg: string, context?: string): void {
  if (!cond) {
    console.error(`FAIL: ${msg}`)
    if (context) {
      console.error('Context:', context)
    }
    process.exit(1)
  }
  console.log(`OK: ${msg}`)
}

export function runAction(dir: string, env: Record<string, string>): void {
  const actionPath = path.join(__dirname, '../dist/index.js')
  execSync(`node ${actionPath}`, {
    cwd: dir,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'inherit', 'inherit']
  })
}
