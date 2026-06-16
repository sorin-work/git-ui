# API reference

Every endpoint is a `GET` under `/api` and returns JSON unless noted. Nothing
in the API changes a repository.

## Conventions

- `:repo` is the repository's directory name without a trailing `.git`.
- `ref` accepts a branch, tag or (abbreviated) commit sha. Without it the
  repository's default branch is used. Refs containing `..`, `@{`, spaces or a
  leading `-` are rejected with 400.
- `path` is relative to the repository root (`src/lib`, no leading slash).
  Paths with `..` segments or control characters are rejected with 400.
- Dates are ISO 8601 strings as git prints them (with the author's offset).
- Errors look like `{ "error": { "code": "not_found", "message": "…" } }`:

  | Status | `code`             | When                                                   |
  | ------ | ------------------ | ------------------------------------------------------ |
  | 400    | `validation_error` | A query parameter is missing or invalid                |
  | 400    | `bad_request`      | Unsafe ref or path, or a folder where a file is needed |
  | 401    | `unauthorized`     | Basic auth is enabled and credentials are missing      |
  | 404    | `not_found`        | Unknown repository, ref, file or folder                |
  | 413    | `too_large`        | git's output is larger than the server buffers         |
  | 504    | `timeout`          | git took longer than 15 seconds                        |

## Endpoints

| Path                            | Query                                                    | Returns                                                        |
| ------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------- |
| `/api/health`                   |                                                          | `{ status }`, never needs auth                                 |
| `/api/repos`                    |                                                          | `{ repos: RepoSummary[] }`                                     |
| `/api/repos/:repo`              |                                                          | `{ repo }` with `branches` and `tags` counts                   |
| `/api/repos/:repo/tree`         | `ref`, `path`                                            | `{ ref, commit, path, entries }`, folders first                |
| `/api/repos/:repo/tree/latest`  | `ref`, `path`                                            | `{ commit, path, commits: { [entryName]: CommitBrief } }`      |
| `/api/repos/:repo/files`        | `ref`                                                    | `{ files: string[], truncated }`, every file path              |
| `/api/repos/:repo/blob`         | `ref`, `path`                                            | File details and `content` (null for binary or > 1 MB files)   |
| `/api/repos/:repo/raw`          | `ref`, `path`, `download=1`                              | The file's bytes (see below)                                   |
| `/api/repos/:repo/blame`        | `ref`, `path`                                            | `{ lines: [{ number, content, sha }], commits: { [sha]: … } }` |
| `/api/repos/:repo/commits`      | `ref`, `path`, `author`, `q`, `page`, `pageSize` (≤ 100) | `{ items, page, pageSize, hasMore }`                           |
| `/api/repos/:repo/commits/:sha` |                                                          | `{ commit, files, stats }`; `files` is the parsed diff         |
| `/api/repos/:repo/compare`      | `base`, `head` (both required)                           | `{ aheadBy, behindBy, commits, files, stats, truncated }`      |
| `/api/repos/:repo/branches`     |                                                          | `{ defaultBranch, branches }` with `ahead`/`behind`            |
| `/api/repos/:repo/tags`         |                                                          | `{ tags }`, newest first                                       |
| `/api/repos/:repo/search`       | `q` (≥ 2 chars), `ref`, `path`, `case=1`                 | `{ matches: [{ path, line, text }], truncated }`               |
| `/api/repos/:repo/insights`     | `ref`                                                    | `{ contributors, activity }`, 52 weeks of commit counts        |
| `/api/repos/:repo/archive`      | `ref`, `format=zip\|tar.gz`                              | A download of the files at that ref                            |

### Notes

**History.** `author` and `q` are matched as plain text, case-insensitively.
When `path` is a single file its history follows renames.

**Diffs.** Each file has `status` (`added`, `deleted`, `modified`, `renamed`,
`copied`), `oldPath` for renames, `additions`, `deletions`, `binary` and
`hunks`. Every line carries `oldLine`/`newLine` numbers; a line followed by
"No newline at end of file" has `noNewline: true`.

**Compare** works like a pull request: the diff is taken from the merge base
of `base` and `head`, and lists at most 250 commits.

**Raw files** are served as images only for raster formats and SVG; everything
else is `text/plain` or `application/octet-stream`. Every raw response carries
`X-Content-Type-Options: nosniff` and a sandboxing `Content-Security-Policy`,
so HTML or SVG committed to a repository can never run scripts on git-ui's
origin.

**Search** is a literal (not regex) `git grep` at the given ref, skipping binary
files, with at most 20 matches per file and 300 in total.
