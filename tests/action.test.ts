// Simple integration smoke test — runs against a temp git repo
import { execSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-test-'))

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

// Run
const outputFile = path.join(dir, 'changelog.md')
const env = {
  ...process.env,
  INPUT_TAG: 'v1.1.0',
  INPUT_OUTPUT_FILE: outputFile,
  'INPUT_OUTPUT-FILE': outputFile,
  GITHUB_WORKSPACE: dir,
  GITHUB_OUTPUT: '/dev/null',
}

execSync(`node ${path.join(__dirname, '../dist/index.js')}`, { cwd: dir, env, stdio: 'inherit' })

const changelog = fs.readFileSync(outputFile, 'utf8')

const assert = (cond: boolean, msg: string): void => {
  if (!cond) {
    console.error(`FAIL: ${msg}`)
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
