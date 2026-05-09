// Simple integration smoke test — runs against a temp git repo
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-test-'))
const githubOutput = path.join(dir, 'github_output')
fs.writeFileSync(githubOutput, '')

function git(cmd: string): void {
  execSync(`git ${cmd}`, { cwd: dir, stdio: 'pipe' })
}

function commit(msg: string): void {
  git(`commit --allow-empty -m "${msg}"`)
}

// Setup
git('init')
git('config user.email "test@test.com"')
git('config user.name "Test"')
commit('chore: init')
git('tag v1.0.0')
commit('feat: add login')
commit('fix: correct typo')
commit('feat(dev): internal tooling')
git('tag v1.1.0')

const debugLog = execSync('git log v1.0.0..v1.1.0 --pretty=format:"%s (%h)"', { cwd: dir }).toString()
console.log('Git log output:')
console.log(debugLog)

const debugFix = execSync(
  'git log v1.0.0..v1.1.0 --pretty=format:"%s (%h)" --extended-regexp --grep="^fix(\\(|:|!)"',
  { cwd: dir }
).toString()
console.log('Fix grep output:')
console.log(debugFix)

// Run
const env = {
  ...process.env,
  INPUT_TAG: 'v1.1.0',
  GITHUB_WORKSPACE: dir,
  GITHUB_OUTPUT: githubOutput,
}

execSync(`node ${path.join(__dirname, '../dist/index.js')}`, { cwd: dir, env, stdio: 'inherit' })

function parseGithubOutput(content: string): Record<string, string> {
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

const outputContent = fs.readFileSync(githubOutput, 'utf8')
const outputs = parseGithubOutput(outputContent)
const changelog = outputs['changelog']

if (!changelog) {
  console.error('FAIL: changelog output not found in GITHUB_OUTPUT')
  console.error('GITHUB_OUTPUT contents:', outputContent)
  process.exit(1)
}

const assert = (cond: boolean, msg: string): void => {
  if (!cond) {
    console.error(`FAIL: ${msg}`)
    console.error('Changelog was:', changelog)
    process.exit(1)
  }
  console.log(`OK: ${msg}`)
}

assert(changelog.includes('## Features'), 'Features section present')
assert(changelog.includes('## Bug Fixes'), 'Bug Fixes section present')
assert(changelog.includes('Add login'), 'feat commit included')
assert(changelog.includes('Correct typo'), 'fix commit included')
assert(!changelog.includes('internal tooling'), 'dev scope filtered out')
assert(!changelog.includes('feat(dev)'), 'dev scope prefix filtered out')

fs.rmSync(dir, { recursive: true })
console.log('All tests passed')
