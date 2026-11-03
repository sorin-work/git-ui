# Changelog

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
