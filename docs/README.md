# Changelog Writer Action

![CI](https://github.com/Kleshzz/changelog-writer/actions/workflows/ci.yml/badge.svg)
![Latest Release](https://img.shields.io/github/v/release/Kleshzz/changelog-writer)

GitHub Action that generates a changelog from conventional commits between tags.

## Usage

```yaml
- uses: actions/checkout@v6
  with:
    fetch-depth: 0 # required for git history

- uses: Kleshzz/changelog-writer@v1
  id: changelog
  with:
    tag: ${{ github.ref_name }} # required for generated changelog
    output_file: changelog.md # optional

- name: Create release
  run: echo "${{ steps.changelog.outputs.changelog }}"
```

## Inputs

| Name          | Required | Description                          |
| ------------- | -------- | ------------------------------------ |
| `tag`         | ✅       | Target tag to generate changelog for |
| `output_file` |          | Path to write changelog file         |

## Outputs

| Name        | Description              |
| ----------- | ------------------------ |
| `changelog` | Generated changelog text |

## Supported commit types

| Prefix     | Section     |
| ---------- | ----------- |
| `feat`     | Features    |
| `fix`      | Bug Fixes   |
| `perf`     | Performance |
| `refactor` | Refactor    |
| `style`    | Style       |
| `docs`     | Docs        |

### Commit Format

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat: add dark mode` — Standard feature
- `feat(auth): support OAuth` — Feature with scope
- `fix!: breaking change in API` — Breaking change (adds ⚠️)
- `feat(dev): update dependencies` — Excluded from changelog via `(dev)` scope

## Example output

### Features

- Add user authentication (a1b2c3d)
- Support dark mode (e4f5g6h)

### Bug Fixes

- Fix crash on startup (i7j8k9l)

## Behavior & Edge Cases

- **No matching commits**: If no commits match the supported types between tags, the output will be `No changes.`.
- **Tag not found**: If the specified `tag` (or the previous tag) cannot be found, the action will fail.

## Local Development

```bash
# Install dependencies
npm install

# Build the action bundle
npm run build

# Run the test suite
npm test

# Run linter
npm run lint

# Run type checking
npm run typecheck
```
