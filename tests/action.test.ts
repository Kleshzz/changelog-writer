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
  commit(dir, 'feat: add new thing') // regular feat - should not be included in Breaking
  git(dir, 'tag v1.1.0')

  runAction(dir, {
    INPUT_TAG: 'v1.1.0',
    GITHUB_WORKSPACE: dir,
    GITHUB_OUTPUT: githubOutput,
  })

  const outputs = parseGithubOutput(fs.readFileSync(githubOutput, 'utf8'))
  const changelog = outputs['changelog'] || ''

  assert(changelog.includes('## Breaking Changes'), 'Breaking Changes section present', changelog)
  assert(changelog.includes('Remove legacy API'), 'Breaking feat included', changelog)
  assert(changelog.includes('Change config format'), 'Breaking fix included', changelog)
  assert(changelog.includes('## Features'), 'Features section present', changelog)
  assert(changelog.includes('Add new thing'), 'Regular feat included', changelog)
  // Breaking Changes should be above Features
  assert(
    changelog.indexOf('## Breaking Changes') < changelog.indexOf('## Features'),
    'Breaking Changes before Features',
    changelog
  )
  // feat! should not be duplicated in Features
  assert(
    !changelog.replace('## Breaking Changes', '').includes('Remove legacy API\nRemove legacy API'),
    'No duplicates',
    changelog
  )
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

// 9. Whitespace-only output-file (should be ignored)
withTempDir('Whitespace-only output-file', (dir, githubOutput) => {
  commit(dir, 'feat: some feat')
  git(dir, 'tag v1.0.0')

  runAction(dir, {
    INPUT_TAG: 'v1.0.0',
    INPUT_OUTPUT_FILE: '   ',
    GITHUB_WORKSPACE: dir,
    GITHUB_OUTPUT: githubOutput,
  })

  const outputs = parseGithubOutput(fs.readFileSync(githubOutput, 'utf8'))
  const changelog = outputs['changelog'] || ''

  assert(changelog.includes('Some feat'), 'Changelog generated')
  // If it wasn't ignored, it might have tried to write to a weird path and failed
  // or we can check that no files were created except the expected ones
  const files = fs.readdirSync(dir).filter((f) => f !== '.git' && f !== 'github_output')
  assert(
    files.length === 0,
    'No output file should be created for whitespace-only input',
    files.join(', ')
  )
})

// 10. Tag with whitespace (should be trimmed)
withTempDir('Tag with whitespace', (dir, githubOutput) => {
  commit(dir, 'feat: some feat')
  git(dir, 'tag v1.0.0')

  runAction(dir, {
    INPUT_TAG: '  v1.0.0  ',
    GITHUB_WORKSPACE: dir,
    GITHUB_OUTPUT: githubOutput,
  })

  const outputs = parseGithubOutput(fs.readFileSync(githubOutput, 'utf8'))
  const changelog = outputs['changelog'] || ''

  assert(changelog.includes('Some feat'), 'Changelog generated for trimmed tag')
})

// 11. Path traversal attempt (should fail)
withTempDir('Path traversal attempt', (dir, githubOutput) => {
  commit(dir, 'feat: some feat')
  git(dir, 'tag v1.0.0')

  try {
    runAction(dir, {
      INPUT_TAG: 'v1.0.0',
      INPUT_OUTPUT_FILE: '../outside.md',
      GITHUB_WORKSPACE: dir,
      GITHUB_OUTPUT: githubOutput,
    })
    assert(false, 'Action should have failed for path traversal')
  } catch {
    console.log('OK: Action failed as expected for path traversal')
  }
})

// 12. Workspace root attempt (should fail)
withTempDir('Workspace root attempt', (dir, githubOutput) => {
  commit(dir, 'feat: some feat')
  git(dir, 'tag v1.0.0')

  try {
    runAction(dir, {
      INPUT_TAG: 'v1.0.0',
      INPUT_OUTPUT_FILE: '.',
      GITHUB_WORKSPACE: dir,
      GITHUB_OUTPUT: githubOutput,
    })
    assert(false, 'Action should have failed for workspace root')
  } catch {
    console.log('OK: Action failed as expected for workspace root')
  }
})

// 13. Breaking change with scope
withTempDir('Breaking change with scope', (dir, githubOutput) => {
  commit(dir, 'chore: init')
  git(dir, 'tag v1.0.0')
  commit(dir, 'feat(api)!: drop v1 endpoints')
  git(dir, 'tag v1.1.0')

  runAction(dir, {
    INPUT_TAG: 'v1.1.0',
    GITHUB_WORKSPACE: dir,
    GITHUB_OUTPUT: githubOutput,
  })

  const outputs = parseGithubOutput(fs.readFileSync(githubOutput, 'utf8'))
  const changelog = outputs['changelog'] || ''

  assert(changelog.includes('## Breaking Changes'), 'Breaking Changes section present', changelog)
  assert(changelog.includes('Drop v1 endpoints'), 'Breaking feat with scope included', changelog)
  assert(!changelog.includes('## Features'), 'Features section should be absent', changelog)
})

// 14. Breaking change (dev) scope - should be filtered out
withTempDir('Breaking change (dev) scope', (dir, githubOutput) => {
  commit(dir, 'chore: init')
  git(dir, 'tag v1.0.0')
  commit(dir, 'feat(dev)!: internal breaking')
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

// 15. Duplicate commits (same message twice)
withTempDir('Duplicate commits', (dir, githubOutput) => {
  commit(dir, 'chore: init')
  git(dir, 'tag v1.0.0')
  commit(dir, 'feat: add button')
  commit(dir, 'feat: add button') // both should be present - this is valid
  git(dir, 'tag v1.1.0')

  runAction(dir, {
    INPUT_TAG: 'v1.1.0',
    GITHUB_WORKSPACE: dir,
    GITHUB_OUTPUT: githubOutput,
  })

  const outputs = parseGithubOutput(fs.readFileSync(githubOutput, 'utf8'))
  const changelog = outputs['changelog'] || ''

  assert(changelog.includes('## Features'), 'Features section present', changelog)
  assert(
    changelog.match(/- Add button/g)?.length === 2,
    'Both duplicate commits are included',
    changelog
  )
})

// 16. Absolute path outside workspace (should fail)
withTempDir('Absolute path outside workspace', (dir, githubOutput) => {
  commit(dir, 'feat: some feat')
  git(dir, 'tag v1.0.0')

  const outsideFile = path.join(os.tmpdir(), `evil-${Math.random().toString(36).slice(2)}.md`)

  try {
    runAction(dir, {
      INPUT_TAG: 'v1.0.0',
      INPUT_OUTPUT_FILE: outsideFile,
      GITHUB_WORKSPACE: dir,
      GITHUB_OUTPUT: githubOutput,
    })
    assert(false, 'Action should have failed for absolute path outside workspace')
  } catch {
    console.log('OK: Action failed as expected for absolute path outside workspace')
  } finally {
    try {
      fs.rmSync(outsideFile, { force: true })
    } catch {}
  }

  assert(!fs.existsSync(outsideFile), 'File should not have been created outside workspace')
})

// 17. Output file already exists (should overwrite)
withTempDir('Output file overwrite', (dir, githubOutput) => {
  commit(dir, 'feat: some feat')
  git(dir, 'tag v1.0.0')

  const outputFile = path.join(dir, 'CHANGELOG.md')
  fs.writeFileSync(outputFile, 'old content')

  runAction(dir, {
    INPUT_TAG: 'v1.0.0',
    INPUT_OUTPUT_FILE: outputFile,
    GITHUB_WORKSPACE: dir,
    GITHUB_OUTPUT: githubOutput,
  })

  const outputs = parseGithubOutput(fs.readFileSync(githubOutput, 'utf8'))
  const changelog = outputs['changelog'] || ''

  const fileContent = fs.readFileSync(outputFile, 'utf8')
  assert(fileContent !== 'old content', 'Old content should be overwritten', fileContent)
  assert(fileContent === changelog, 'File content matches changelog output', fileContent)
})

// 18. Floating tags (v1, v10, v2-beta) should be ignored
withTempDir('Floating tags', (dir, githubOutput) => {
  commit(dir, 'feat: initial')
  git(dir, 'tag v1.0.0')
  git(dir, 'tag v1') // floating tag points to v1.0.0

  commit(dir, 'feat: second')
  git(dir, 'tag v1.1.0')
  git(dir, 'tag -f v1 v1.1.0') // move v1 to v1.1.0
  git(dir, 'tag v10 v1.1.0') // add multi-digit floating tag
  git(dir, 'tag v2-beta v1.1.0') // add non-versioned tag

  runAction(dir, {
    INPUT_TAG: 'v1.1.0',
    GITHUB_WORKSPACE: dir,
    GITHUB_OUTPUT: githubOutput,
  })

  const outputs = parseGithubOutput(fs.readFileSync(githubOutput, 'utf8'))
  const changelog = outputs['changelog'] || ''

  // Should find v1.0.0 as previous tag, skipping v1, v10, and v2-beta
  assert(changelog.includes('Second'), 'Changelog found the correct commit')
})

// 19. Output file with spaces in path
withTempDir('Output file with spaces', (dir, githubOutput) => {
  commit(dir, 'feat: some feat')
  git(dir, 'tag v1.0.0')

  const outputFile = path.join(dir, 'my changelog folder', 'CHANGELOG.md')

  runAction(dir, {
    INPUT_TAG: 'v1.0.0',
    INPUT_OUTPUT_FILE: outputFile,
    GITHUB_WORKSPACE: dir,
    GITHUB_OUTPUT: githubOutput,
  })

  assert(fs.existsSync(outputFile), 'Output file with spaces created')
  const fileContent = fs.readFileSync(outputFile, 'utf8')
  assert(fileContent.includes('Some feat'), 'Content is correct')
})

// 20. Symlink bypass path traversal (should fail)
withTempDir('Symlink bypass path traversal', (dir, githubOutput) => {
  commit(dir, 'feat: some feat')
  git(dir, 'tag v1.0.0')

  const outsideDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'evil-dir-')))
  const symlinkPath = path.join(dir, 'evil-link')
  fs.symlinkSync(outsideDir, symlinkPath)

  const outputFile = path.join(symlinkPath, 'CHANGELOG.md')
  const outsideFile = path.join(outsideDir, 'CHANGELOG.md')

  try {
    runAction(dir, {
      INPUT_TAG: 'v1.0.0',
      INPUT_OUTPUT_FILE: outputFile,
      GITHUB_WORKSPACE: dir,
      GITHUB_OUTPUT: githubOutput,
    })
    assert(false, 'Action should have failed for symlink pointing outside workspace')
  } catch (e) {
    console.log(
      'OK: Action failed as expected for symlink bypass:',
      e instanceof Error ? e.message : e
    )
  } finally {
    fs.rmSync(outsideDir, { recursive: true, force: true })
  }

  assert(!fs.existsSync(outsideFile), 'File should not have been created via symlink')
})

console.log('\nAll tests passed!')
