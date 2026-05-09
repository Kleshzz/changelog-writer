import * as core from '@actions/core'
import { getExecOutput } from '@actions/exec'
import * as fs from 'fs'

const SECTIONS: Record<string, string> = {
  feat:     '## Features',
  fix:      '## Bug Fixes',
  perf:     '## Performance',
  refactor: '## Refactor',
  style:    '## Style',
  docs:     '## Docs',
}

async function getCommits(range: string, type: string): Promise<string[]> {
  const { stdout } = await getExecOutput(
    'git',
    ['log', range, '--pretty=format:%s (%h)', '--extended-regexp', `--grep=^${type}(\\(|:|!)`],
    { silent: true }
  )

  return stdout
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !new RegExp(`^${type}\\(dev\\)`).test(line))
    .map(line => {
      const cleaned = line.replace(new RegExp(`^${type}(\\([^)]*\\))?: `), '')
      return '- ' + cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
    })
}

async function run(): Promise<void> {
  try {
    const tag = core.getInput('tag', { required: true })

    try {
      await getExecOutput('git', ['rev-parse', '--verify', tag], { silent: true })
    } catch {
      core.setFailed(`Tag "${tag}" not found in repository`)
      return
    }

    let prevTag = ''
    try {
      const { stdout } = await getExecOutput(
        'git',
        ['describe', '--tags', '--abbrev=0', `${tag}^`],
        { silent: true }
      )
      prevTag = stdout.trim()
    } catch {}

    const range = prevTag ? `${prevTag}..${tag}` : tag
    const sections: string[] = []

    for (const [type, header] of Object.entries(SECTIONS)) {
      const lines = await getCommits(range, type)
      if (lines.length > 0) {
        sections.push(`${header}\n${lines.join('\n')}`)
      }
    }

    const changelog = sections.length > 0
      ? sections.join('\n\n')
      : 'No changes.'

    const outputFile = core.getInput('output-file')
    if (outputFile) {
      fs.writeFileSync(outputFile, changelog)
    }

    core.setOutput('changelog', changelog)

    core.info('Changelog generated successfully')
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error))
  }
}

run()