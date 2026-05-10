import * as core from '@actions/core'
import { getExecOutput } from '@actions/exec'
import * as fs from 'fs'
import * as path from 'path'

const SECTIONS: Record<string, string> = {
  feat: '## Features',
  fix: '## Bug Fixes',
  perf: '## Performance',
  refactor: '## Refactor',
  style: '## Style',
  docs: '## Docs',
}

const DEV_REGEX = /^\w+\(dev\)[!:]?/

async function getAllCommits(range: string): Promise<string[]> {
  const { stdout } = await getExecOutput(
    'git',
    [
      'log',
      range,
      '--pretty=format:%s (%h)',
      '--extended-regexp',
      // Matches conventional commit types followed by scope, colon, or breaking change (!)
      // The \\( is escaped for TypeScript to pass \( to git (important for --extended-regexp)
      `--grep=^(${Object.keys(SECTIONS).join('|')})(\\(|:|!)`,
    ],
    { silent: true }
  )

  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

async function run(): Promise<void> {
  const workspacePath = path.resolve(process.env['GITHUB_WORKSPACE'] ?? process.cwd())
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
        ['describe', '--tags', '--abbrev=0', '--exclude', tag, tag],
        { silent: true }
      )
      prevTag = stdout.trim()
    } catch (error) {
      core.debug(`No previous tag found, using full history: ${error}`)
    }

    // If no previous tag found, git log <tag> will show all history up to that tag
    const range = prevTag ? `${prevTag}..${tag}` : tag
    const allCommits = await getAllCommits(range)

    const sections: string[] = []
    let totalCommits = 0

    for (const [type, header] of Object.entries(SECTIONS)) {
      const typeRegex = new RegExp(`^${type}(\\([^)]*\\))?!?: `)

      const lines = allCommits
        .filter((line) => typeRegex.test(line) && !DEV_REGEX.test(line))
        .map((line) => {
          const cleaned = line.replace(typeRegex, '')
          return '- ' + cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
        })

      if (lines.length > 0) {
        totalCommits += lines.length
        sections.push(`${header}\n${lines.join('\n')}`)
      }
    }

    const changelog = sections.length > 0 ? sections.join('\n\n') : 'No changes.'

    const outputFile = core.getInput('output_file')
    if (outputFile) {
      const resolvedPath = path.resolve(outputFile)

      if (resolvedPath !== workspacePath && !resolvedPath.startsWith(workspacePath + path.sep)) {
        throw new Error(`Output file path must be within the workspace: ${outputFile}`)
      }

      fs.mkdirSync(path.dirname(resolvedPath), { recursive: true })
      fs.writeFileSync(resolvedPath, changelog)
    }

    core.setOutput('changelog', changelog)

    core.info('Changelog generated successfully')
    core.info(`Range: ${range}`)
    core.info(`Sections: ${sections.length}, commits processed: ${totalCommits}`)
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error))
  }
}

run()
