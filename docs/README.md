# changelog-writer

GitHub Action that generates a changelog from conventional commits between tags.

## Usage

```yaml
- uses: actions/checkout@v6
  with:
    fetch-depth: 0 # required for git history

- uses: Kleshzz/changelog-writer@v1
  id: changelog
  with:
    tag: v1.2.3
    output-file: changelog.md # optional

- name: Create release
  run: echo "${{ steps.changelog.outputs.changelog }}"
```

## Inputs

| Name          | Required | Description                          |
|---------------|----------|--------------------------------------|
| `tag`         | ✅       | Target tag to generate changelog for |
| `output-file` |          | Path to write changelog file         |

## Outputs

| Name        | Description               |
|-------------|---------------------------|
| `changelog` | Generated changelog text  |

## Supported commit types

| Prefix       | Section          |
|--------------|------------------|
| `feat`       | Features         |
| `fix`        | Bug Fixes        |
| `perf`       | Performance      |
| `refactor`   | Refactor         |
| `style`      | Style            |
| `docs`       | Docs             |

Commits with `(dev)` scope are excluded (e.g. `feat(dev): ...`).

## Example output

### Features

- Add user authentication (a1b2c3d)
- Support dark mode (e4f5g6h)

### Bug Fixes

- Fix crash on startup (i7j8k9l)


## Local build

```bash
npm install
npm run build
```
