# Architecture

git-ui is two small programs: a JSON API that reads repositories by running
`git`, and a single-page app that renders what the API returns. There is no
database and no background job; every page is computed from the repositories
on disk when it is requested.

```
browser ──► web (Vue SPA, served by Vite in dev or nginx in docker)
               │  /api/*
               ▼
            server (Fastify) ──► git (child process, no shell) ──► REPOS_DIR/*
```

## Server (`apps/server`)

### Finding repositories

`RepoRegistry` (`src/git/repos.ts`) lists the direct subdirectories of
`REPOS_DIR` on every request. A directory counts as a repository when it has a
`.git` folder or file (a regular clone, worktree or submodule) or looks like a
bare repository (`HEAD`, `objects/` and `refs/`). The URL name is the
directory name without a trailing `.git`. Hidden directories are skipped, and
symlinks are only followed when they resolve to a directory inside
`REPOS_DIR`.

Listing on every request keeps things simple: repositories added or removed
on disk show up without a restart, and a directory listing is cheap next to
the git commands that follow.

### Running git

All git access goes through `src/git/run.ts`:

- `git()` collects stdout as text, `gitBuffer()` as bytes (images, raw files)
  and `gitStream()` pipes stdout straight into the HTTP response (archives).
- Arguments are always an array passed to `execFile`/`spawn`; nothing is ever
  interpolated into a shell command.
- Every call adds `-c` options that switch off things a repository could use
  to run code or change output: the pager, colors, `core.fsmonitor` and hooks.
  `show`, `log` and `diff` also get `--no-textconv --no-ext-diff`, and `blame`
  gets `--no-textconv`, so a repository's `.gitattributes` cannot invoke an
  external program.
- `safe.directory` is set to the repository being read, for that call only.
  Repositories mounted into a container usually belong to a different user,
  and git would otherwise refuse to open them ("dubious ownership").
- Commands time out after 15 seconds and may print at most 32 MB. Both
  failures become `GitError`s that the error handler turns into 504 and 413.

Refs and paths from the query string are validated before they reach git
(`src/git/validate.ts`). Refs may only use letters, digits and `._/@+-`, and
may not start with `-` or contain `..` or `@{`; paths may not contain `.` or
`..` segments, backslashes or control characters. Refs are then resolved to a
full commit sha with `rev-parse --verify --end-of-options`.

### Parsing

Output formats are chosen to be unambiguous rather than readable:

| Data         | Command                                    | Why                                                  |
| ------------ | ------------------------------------------ | ---------------------------------------------------- |
| Trees        | `ls-tree --long -z`                        | NUL separators, so any file name round-trips         |
| History      | `log -z --format=…%x1f…`                   | Unit-separated fields; subjects can contain anything |
| Diffs        | `show`/`diff --find-renames`               | Parsed into files, hunks and numbered lines          |
| Blame        | `blame --porcelain`                        | Commit details appear once, lines reference them     |
| Search       | `grep -z --line-number -I --fixed-strings` | Literal match, binary files skipped                  |
| Contributors | `shortlog -sne`, `log --format=%ct`        | Commit times are bucketed into weeks on the server   |

Each parser lives next to the command that feeds it in `src/git/` and has unit
tests with tricky input (quotes, tabs and newlines in names, no newline at end
of file, merges, renames).

### Caching

Anything addressed by a full commit sha never changes, so the routes for
trees, file contents, blame, commits and language stats cache their results in a
process-wide LRU (`src/lib/cache.ts`, 500 entries). Branch names are resolved
on every request and only then looked up in the cache, so new pushes are
visible immediately. Failed lookups are never cached.

### Routes and errors

Routes (`src/routes/`) validate their query with zod, call into `src/git/` and
return plain objects. Errors are thrown, never returned: `HttpError` for
expected failures, `GitError` from the runner, `ZodError` from validation. The
single error handler (`src/lib/error-handler.ts`) maps them to the
`{ error: { code, message } }` shape documented in [api.md](api.md). Only
timeouts and unexpected errors are logged.

Raw file responses get `X-Content-Type-Options: nosniff` and a sandboxing CSP,
and only raster images and SVG are served with their real type, so a
committed HTML or SVG file cannot run script on git-ui's origin.

## Web app (`apps/web`)

- `src/api/` is a typed client for the endpoints above. `ApiError` carries the
  server's error code so pages can tell "not found" from "timed out".
- `src/composables/useAsync.ts` runs a request whenever its inputs change and
  ignores responses that arrive after a newer request, so fast navigation
  never shows stale data.
- `src/router.ts` maps URLs like `/:repo/blob/:ref/:path*`. Refs and paths are
  URL-encoded segment by segment (`src/lib/paths.ts`), so branch names with
  slashes and file names with `#` or spaces work. Everything except the
  repository list and file browser is loaded on demand.
- Code is highlighted with highlight.js on the client, skipped for files over
  200,000 characters or with lines over 3,000 characters. Markdown is rendered
  with marked and sanitized with DOMPurify; relative links and images are
  rewritten to point at the right page or raw file.
- Styling is one stylesheet (`src/styles.css`) with CSS variables for the
  light and dark themes; there is no component library.

## Testing

Server tests create real repositories in a temporary directory
(`apps/server/test/repo.ts`) and call routes through `app.inject`, so they
exercise the same git commands production does. Web tests mount components
with @vue/test-utils in jsdom and test the pure helpers in `src/lib/`
directly. CI runs lint, format check, typecheck, tests and builds for pushes
to `main` and for pull requests.
