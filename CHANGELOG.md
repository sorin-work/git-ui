# Changelog

## Unreleased

### Added

- Limits on git work: at most `GIT_MAX_PROCESSES` git processes at once
  (requests that wait too long get 503 `busy`), at most
  `ARCHIVE_MAX_CONCURRENT` downloads, each stopped after
  `ARCHIVE_TIMEOUT_MS` or when the client goes away
- The branches page counts ahead and behind in one git call on git 2.41 and
  later
- git calls of a request stop when the client goes away or the request fails,
  and downloads wait for a slot as long as `GIT_QUEUE_TIMEOUT_MS`

### Changed

- A ref is looked up as a full sha, a branch, a tag, then an abbreviated sha.
  A branch now wins over a tag with the same name (`refs/tags/<name>` picks
  the tag, and the tags page links that way), and `refs/stash`, remote
  branches, `@` and `heads/x` are no longer accepted
- API responses that include `ref` also include `kind` (`branch`, `tag` or
  `commit`)

### Security

- Ten wrong passwords from one address within five minutes lock it out
  (429); `TRUST_PROXY` makes that work behind a reverse proxy
- The web app is served with a Content-Security-Policy, `Referrer-Policy:
same-origin` and other security headers; API responses carry `nosniff`
  and, with a login, `Cache-Control: private`

- A repository's config can no longer make git run a program: signature
  checks and the gpg programs are switched off, and git starts with a clean
  environment without the host's config
- Paths in requests are literal: `*`, `?` and `:(…)` pathspec magic no longer
  act as patterns
- Repository config can no longer change git's output (colors, diff prefixes,
  encodings) and break pages
- Zip and tar.gz downloads are built by the server from git's objects instead
  of `git archive`, which runs filters and compressors from the repository's
  config. `export-ignore` and `export-subst` are no longer applied, and a
  download that fails halfway is cut off instead of ending as a valid but
  incomplete archive. Trees that would unpack outside their folder are
  refused (422), and zip downloads are limited to files of 100 MB
- A repository is left out when its git data is outside `REPOS_DIR` (a `.git`
  file, `commondir`, alternates, or a link anywhere under `refs`, `logs` or
  `objects`), and git runs
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
