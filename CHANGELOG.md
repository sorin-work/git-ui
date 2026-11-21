# Changelog

## Unreleased

### Security

- A repository's config can no longer make git run a program: signature
  checks, the gpg programs and the archive filter and compression commands
  are switched off, and git starts with a clean environment without the
  host's config
- Repository config can no longer change git's output (colors, diff prefixes,
  encodings) and break pages
- tar.gz downloads are compressed by the server; a zip is refused (409) when
  the repository redefines the zip format
- A repository is left out when its git data is outside `REPOS_DIR` (a `.git`
  file, `commondir`, alternates or linked `objects` and `refs`), and git runs
  with an explicit git directory, so it never answers from a repository
  further up or from a `core.worktree` elsewhere

## 1.0.0 (2026-11-03)

First release.

### Browsing

- Repository list for every git repository (bare or cloned) directly inside
  `REPOS_DIR`, with description and latest commit
- File browser for any branch, tag or commit, showing the last commit of every
  file and folder
- File viewer with syntax highlighting, line links and line ranges, image
  previews and rendered Markdown, plus the README of the current folder
- Go-to-file finder (`t`) and a keyboard shortcuts overview (`?`)
- Raw files and zip/tar.gz downloads of any ref

### History

- Commit history with message, author and path filters; the history of a
  single file follows renames
- Commit pages with unified or side-by-side diffs, co-authors and what a merge
  brought in
- Blame
- Compare any two branches, tags or commits from their merge base

### Repository overview

- Branches with ahead/behind counts against the default branch, and tags
- Code search with `git grep`
- Insights: contributors and a year of weekly commit activity
- Language breakdown by file size

### Running it

- Docker compose setup with healthchecks; demo repositories on a fresh install
- Optional HTTP basic auth
- Dark mode and a layout for phones
- Documentation: API reference, architecture and troubleshooting

### Security

- git runs without a shell, with validated refs and paths, hooks, fsmonitor,
  textconv and external diff drivers turned off
- Raw HTML and SVG are served so they cannot run script on git-ui's origin
- Symlinks in `REPOS_DIR` are only followed when they stay inside it
