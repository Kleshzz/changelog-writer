import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { git, commit, parseGithubOutput, assert, runAction } from './helpers'

/**
 * Helper to run a test in a temporary directory and ensure cleanup.
 */
function withTempDir(testName: string, fn: (dir: string, githubOutput: string) => void): void {
  console.log(`\n--- Running test: ${testName} ---`)
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'changelog-test-')))
  const githubOutput = path.join(dir, 'github_output')
  fs.writeFileSync(githubOutput, '')

  // Basic git setup
  git(dir, 'init')
  git(dir, 'config user.email "test@test.com"')
  git(dir, 'config user.name "Test"')

  try {
    fn(dir, githubOutput)
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch (e) {
      console.error(`Failed to cleanup ${dir}:`, e)
    }
  }
}

// 0. Smoke test (refactored existing)
withTempDir('Smoke test', (dir, githubOutput) => {
  commit(dir, 'chore: init')
  git(dir, 'tag v1.0.0')
  commit(dir, 'feat: add login')
  commit(dir, 'fix: correct typo')
  commit(dir, 'feat(dev): internal tooling')
  git(dir, 'tag v1.1.0')

  runAction(dir, {
    INPUT_TAG: 'v1.1.0',
    GITHUB_WORKSPACE: dir,
    GITHUB_OUTPUT: githubOutput,
  })

  const outputs = parseGithubOutput(fs.readFileSync(githubOutput, 'utf8'))
  const changelog = outputs['changelog'] || ''

  assert(changelog.includes('## Features'), 'Features section present', changelog)
  assert(changelog.includes('## Bug Fixes'), 'Bug Fixes section present', changelog)
  assert(changelog.includes('Add login'), 'feat commit included', changelog)
  assert(changelog.includes('Correct typo'), 'fix commit included', changelog)
  assert(!changelog.includes('internal tooling'), 'dev scope filtered out', changelog)
  assert(!changelog.includes('feat(dev)'), 'dev scope prefix filtered out', changelog)
})

// 1. First release (no previous tag)
withTempDir('First release', (dir, githubOutput) => {
  commit(dir, 'feat: initial feat')
  commit(dir, 'fix: initial fix')
  git(dir, 'tag v1.0.0')

  runAction(dir, {
    INPUT_TAG: 'v1.0.0',
    GITHUB_WORKSPACE: dir,
    GITHUB_OUTPUT: githubOutput,
  })

  const outputs = parseGithubOutput(fs.readFileSync(githubOutput, 'utf8'))
  const changelog = outputs['changelog'] || ''

  assert(changelog.includes('Initial feat'), 'Initial feat included', changelog)
  assert(changelog.includes('Initial fix'), 'Initial fix included', changelog)
})

// 2. Breaking change (!)
withTempDir('Breaking change', (dir, githubOutput) => {
  commit(dir, 'chore: init')
  git(dir, 'tag v1.0.0')
  commit(dir, 'feat!: remove legacy API')
  commit(dir, 'fix!: change config format')
  git(dir, 'tag v1.1.0')

  runAction(dir, {
    INPUT_TAG: 'v1.1.0',
    GITHUB_WORKSPACE: dir,
    GITHUB_OUTPUT: githubOutput,
  })

  const outputs = parseGithubOutput(fs.readFileSync(githubOutput, 'utf8'))
  const changelog = outputs['changelog'] || ''

  assert(changelog.includes('## Features'), 'Features section present', changelog)
  assert(changelog.includes('Remove legacy API'), 'Breaking feat included', changelog)
  assert(changelog.includes('Change config format'), 'Breaking fix included', changelog)
})

// 3. Commits with scope
withTempDir('Commits with scope', (dir, githubOutput) => {
  commit(dir, 'chore: init')
  git(dir, 'tag v1.0.0')
  commit(dir, 'feat(auth): support OAuth')
  commit(dir, 'fix(ui): button alignment')
  git(dir, 'tag v1.1.0')

  runAction(dir, {
    INPUT_TAG: 'v1.1.0',
    GITHUB_WORKSPACE: dir,
    GITHUB_OUTPUT: githubOutput,
  })

  const outputs = parseGithubOutput(fs.readFileSync(githubOutput, 'utf8'))
  const changelog = outputs['changelog'] || ''

  assert(changelog.includes('Support OAuth'), 'OAuth feat included', changelog)
  assert(changelog.includes('Button alignment'), 'UI fix included', changelog)
  assert(!changelog.includes('(auth)'), 'auth scope removed', changelog)
  assert(!changelog.includes('(ui)'), 'ui scope removed', changelog)
})

// 4. Filtering (dev) scope for all types
withTempDir('Filtering (dev) scope', (dir, githubOutput) => {
  commit(dir, 'chore: init')
  git(dir, 'tag v1.0.0')
  commit(dir, 'feat(dev): update tooling')
  commit(dir, 'fix(dev): ci tweak')
  commit(dir, 'perf(dev): optimize build')
  git(dir, 'tag v1.1.0')

  runAction(dir, {
    INPUT_TAG: 'v1.1.0',
    GITHUB_WORKSPACE: dir,
    GITHUB_OUTPUT: githubOutput,
  })

  const outputs = parseGithubOutput(fs.readFileSync(githubOutput, 'utf8'))
  const changelog = outputs['changelog'] || ''

  assert(changelog === 'No changes.', 'Output should be No changes.', changelog)
})

// 5. No matching commits
withTempDir('No matching commits', (dir, githubOutput) => {
  commit(dir, 'chore: init')
  git(dir, 'tag v1.0.0')
  commit(dir, 'chore: update dependencies')
  commit(dir, 'test: add unit tests')
  commit(dir, 'build: update build script')
  git(dir, 'tag v1.1.0')

  runAction(dir, {
    INPUT_TAG: 'v1.1.0',
    GITHUB_WORKSPACE: dir,
    GITHUB_OUTPUT: githubOutput,
  })

  const outputs = parseGithubOutput(fs.readFileSync(githubOutput, 'utf8'))
  const changelog = outputs['changelog'] || ''

  assert(changelog === 'No changes.', 'Output should be No changes.', changelog)
})

// 6. Non-existent tag
withTempDir('Non-existent tag', (dir, githubOutput) => {
  commit(dir, 'feat: some feat')

  try {
    runAction(dir, {
      INPUT_TAG: 'v99.99.99',
      GITHUB_WORKSPACE: dir,
      GITHUB_OUTPUT: githubOutput,
    })
    assert(false, 'Action should have failed for non-existent tag')
  } catch {
    console.log('OK: Action failed as expected for non-existent tag')
  }

  const outputRaw = fs.readFileSync(githubOutput, 'utf8')
  const outputs = parseGithubOutput(outputRaw)
  const changelog = outputs['changelog'] || ''
  assert(!changelog, 'Changelog output should be empty or missing')
})

// 7. Write to output-file
withTempDir('Write to output-file', (dir, githubOutput) => {
  commit(dir, 'feat: some feat')
  git(dir, 'tag v1.0.0')

  const outputFile = path.join(dir, 'subdir', 'CHANGELOG.md')

  runAction(dir, {
    INPUT_TAG: 'v1.0.0',
    INPUT_OUTPUT_FILE: outputFile,
    GITHUB_WORKSPACE: dir,
    GITHUB_OUTPUT: githubOutput,
  })

  const outputs = parseGithubOutput(fs.readFileSync(githubOutput, 'utf8'))
  const changelog = outputs['changelog'] || ''

  assert(fs.existsSync(outputFile), 'Output file created')
  const fileContent = fs.readFileSync(outputFile, 'utf8')
  assert(fileContent === changelog, 'File content matches GITHUB_OUTPUT', fileContent)
})

// 8. Empty range between tags
withTempDir('Empty range between tags', (dir, githubOutput) => {
  commit(dir, 'feat: initial')
  git(dir, 'tag v1.0.0')
  git(dir, 'tag v1.1.0') // No commits between 1.0.0 and 1.1.0

  runAction(dir, {
    INPUT_TAG: 'v1.1.0',
    GITHUB_WORKSPACE: dir,
    GITHUB_OUTPUT: githubOutput,
  })

  const outputs = parseGithubOutput(fs.readFileSync(githubOutput, 'utf8'))
  const changelog = outputs['changelog'] || ''

  assert(changelog === 'No changes.', 'Output should be No changes.', changelog)
})

console.log('\nAll tests passed!')
