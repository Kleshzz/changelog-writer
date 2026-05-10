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

  return stdout.split('\n').reduce<string[]>((acc, line) => {
    const trimmed = line.trim()
    if (trimmed) acc.push(trimmed)
    return acc
  }, [])
}

async function resolveTagRange(tag: string): Promise<string> {
  try {
    await getExecOutput('git', ['rev-parse', '--verify', tag], { silent: true })
  } catch {
    throw new Error(`Tag "${tag}" not found in repository`)
  }

  let prevTag = ''
  try {
    const { stdout } = await getExecOutput(
      'git',
      ['describe', '--tags', '--abbrev=0', '--exclude', tag, tag],
      { silent: true }
    )
    prevTag = stdout.trim()
  } catch {
    core.warning(
      `No previous tag found before "${tag}". Falling back to full history. ` +
        'If this is a shallow clone, ensure you fetch all tags.'
    )
  }

  return prevTag ? `${prevTag}..${tag}` : tag
}

function generateChangelog(allCommits: string[]): {
  changelog: string
  totalCommits: number
  sectionsCount: number
} {
  const sections: string[] = []
  let totalCommits = 0

  for (const [type, header] of Object.entries(SECTIONS)) {
    const typeRegex = new RegExp(`^${type}(\\([^)]*\\))?!?: `)

    const lines = allCommits.reduce<string[]>((acc, line) => {
      if (typeRegex.test(line) && !DEV_REGEX.test(line)) {
        const cleaned = line.replace(typeRegex, '')
        acc.push('- ' + cleaned.charAt(0).toUpperCase() + cleaned.slice(1))
      }
      return acc
    }, [])

    if (lines.length > 0) {
      totalCommits += lines.length
      sections.push(`${header}\n${lines.join('\n')}`)
    }
  }

  return {
    changelog: sections.length > 0 ? sections.join('\n\n') : 'No changes.',
    totalCommits,
    sectionsCount: sections.length,
  }
}

async function run(): Promise<void> {
  const workspacePath = path.resolve(process.env['GITHUB_WORKSPACE'] ?? process.cwd())
  try {
    const tag = core.getInput('tag', { required: true, trimWhitespace: true })
    const range = await resolveTagRange(tag)
    const allCommits = await getAllCommits(range)

    const { changelog, totalCommits, sectionsCount } = generateChangelog(allCommits)

    const outputFile = core.getInput('output_file', { trimWhitespace: true })
    if (outputFile) {
      const resolvedPath = path.resolve(outputFile)

      const rel = path.relative(workspacePath, resolvedPath)
      if (rel.startsWith('..') || path.isAbsolute(rel) || !rel) {
        throw new Error(`Output file path must be within the workspace: ${outputFile}`)
      }

      fs.mkdirSync(path.dirname(resolvedPath), { recursive: true })
      fs.writeFileSync(resolvedPath, changelog)
    }

    core.info('Changelog generated successfully')
    core.info(`Range: ${range}`)
    core.info(`Sections: ${sectionsCount}, commits processed: ${totalCommits}`)

    core.setOutput('changelog', changelog)
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error))
  }
}

void run()
