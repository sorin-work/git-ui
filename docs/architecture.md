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

A repository's git data can live somewhere else than its folder: a `.git`
file names its git directory, a linked worktree's `commondir` names the main
repository, `objects/info/alternates` adds other object stores, and any file or folder
in the git directory can be a symlink. `escapeReason` resolves all of these
and leaves the repository out unless every one is inside `REPOS_DIR`:
alternates recursively (relative entries against the real path of the
objects folder, as git does), every entry under `refs/`, `logs/` and
`objects/` (including `pack/` and `info/`), and `HEAD`, `config`, `index`,
`packed-refs`, `shallow` and `info/grafts`. A link that leads nowhere is
refused too, since it could be pointed anywhere later. The walk stops after
100,000 entries or 3 seconds and refuses the repository, which mostly means
a repository with a huge number of loose objects (`git gc` packs them). Each repository left out is logged once with the reason.
Worktrees and alternates between repositories that are both in `REPOS_DIR`
keep working.

This check is defence in depth, not a security boundary. It runs when a
repository is looked up and git reads the files a moment later, so someone
who can write to `REPOS_DIR` can swap a link in between. `REPOS_DIR` must
only be writable by people who may read everything the server's user can
read.

Listing on every request keeps things simple: repositories added or removed
on disk show up without a restart, and a directory listing is cheap next to
the git commands that follow.

### Running git

All git access goes through `src/git/run.ts`:

- `git()` collects stdout as text, `gitBuffer()` as bytes (images, raw files)
  and `gitProcess()` gives a process with pipes for `cat-file --batch`
  (archives).
- Arguments are always an array passed to `execFile`/`spawn`; nothing is ever
  interpolated into a shell command.
- A repository's config is input like anything else, so every call pins the
  settings that could make git run a program or change its output with `-c`
  options, which beat the repository's own config (`PINNED_CONFIG` in
  `run.ts`): the pager, hooks, `core.fsmonitor`, signature checks and the gpg
  programs, colors, diff prefixes, the log encoding, the grep column and the
  files config could point at outside the repository (`core.attributesFile`,
  `diff.orderFile`, `mailmap.file`). `show`, `log` and
  `diff` also get `--no-textconv --no-ext-diff`, `grep` gets
  `--no-textconv`, and `blame` gets `--no-textconv --no-ignore-revs-file`, so
  a repository's `.gitattributes` cannot invoke an external program.
- git starts with an empty environment plus `PATH`, `TMPDIR` and the
  variables we set. Nothing like `GIT_DIR` or `GIT_CONFIG_PARAMETERS` from the
  server's own environment reaches it, `HOME` is not passed, and
  `GIT_CONFIG_NOSYSTEM`, `GIT_CONFIG_GLOBAL=/dev/null` and `GIT_ATTR_NOSYSTEM`
  keep the host's config out too. `GIT_NO_REPLACE_OBJECTS` makes a sha always
  show that commit, and `GIT_OPTIONAL_LOCKS=0` keeps git from writing even an
  index.
- Archives are not made by `git archive`, which runs the filter driver a
  file's attributes name and the compressor `tar.<format>.command` names,
  both chosen by the repository. `src/git/archive.ts` lists the files with
  `ls-tree -r -t -z --long`, reads their content with `cat-file --batch`
  (neither looks at attributes) and writes the tar or zip itself
  (`src/lib/tar.ts`, `src/lib/zip.ts`), keeping file modes, symlinks and the
  `<repo>-<ref>/` folder. `export-ignore` and `export-subst` are not applied.
  The end of the archive is only written after `cat-file` has exited
  cleanly; if reading fails halfway, the stream errors and the connection is
  cut, so a broken download never looks complete.
- Two settings can still make git read files on the host that are not in the
  repository: `include.path` (and `includeIf`) in a repository's config, and
  attribute files. Includes only add config, which is pinned where it
  matters, so all they reveal is whether a file exists.
  `core.attributesFile` is pinned to `/dev/null`.
- git runs with `GIT_DIR` set to the checked git directory and `GIT_WORK_TREE`
  to the repository folder. There is no discovery, so a repository that
  disappears between the listing and the call is an error rather than
  whatever repository sits further up, and `core.worktree` in a repository's
  config cannot point git at a folder elsewhere. Bare repositories keep
  reading `.mailmap` from `HEAD`.
- `safe.directory` is set to the repository being read, for that call only.
  Repositories mounted into a container usually belong to a different user,
  and git would otherwise refuse to open them ("dubious ownership").
- Commands time out after 15 seconds and may print at most 32 MB. Both
  failures become `GitError`s that the error handler turns into 504 and 413.
- At most `GIT_MAX_PROCESSES` git processes run at once (`gitSlots`, a
  semaphore in `src/lib/semaphore.ts`); the rest wait in line, and a call
  that waited `GIT_QUEUE_TIMEOUT_MS` fails with a `BusyError`, which the
  error handler turns into 503 with `Retry-After`. Each request carries an
  `AbortSignal` (`src/lib/request-context.ts`, an AsyncLocalStorage set in
  an `onRequest` hook) that `run()` picks up: it aborts when the client goes
  away or the request fails, so the request's queued git calls leave the
  queue and running ones are killed, including the other calls of a page
  that runs several at once. Downloads have their own
  limit (`ARCHIVE_MAX_CONCURRENT`) and time limit (`ARCHIVE_TIMEOUT_MS`), and
  are stopped, with git, when the client goes away. The branches page counts
  ahead and behind for every branch in one `for-each-ref` walk
  (`%(ahead-behind:...)`) when git is 2.41 or newer, and with one `rev-list`
  per branch before that.

Refs and paths from the query string are validated before they reach git
(`src/git/validate.ts`). Refs may only use letters, digits and `._/@+-`, and
may not start with `-` or contain `..` or `@{`; paths may not contain `.` or
`..` segments, backslashes or control characters. Refs are then resolved to a
full commit sha in a fixed order (`refCandidates` in `src/git/resolve.ts`):
full sha, `refs/heads/<name>`, `refs/tags/<name>`, abbreviated sha, each with
`rev-parse --verify --end-of-options`. git's own lookup would let a tag beat
a branch of the same name and accept `refs/stash`, `@` or remote branches.

After that, git only ever sees revisions that are resolved shas. Every
command that names one puts `--end-of-options` before it (tested on git 2.30
and 2.43), except `blame` and `grep`, which reject that flag even in 2.43;
they get the sha through `assertFullSha`, which throws on anything else.
Paths always come after `--`, and `GIT_LITERAL_PATHSPECS=1` makes them plain
paths, so `*.md` or `:(exclude)src` in a request match only a file of that
name.

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

Every API response gets `X-Content-Type-Options: nosniff`, and with a login
`Cache-Control: private` unless the route set its own. Basic auth
(`src/lib/basic-auth.ts`) counts failed logins per client address in memory
(`LoginThrottle`): ten within five minutes and the address gets 429 until
the window passes, without its passwords being checked. The address is
`request.ip`, which follows `X-Forwarded-For` only as far as `TRUST_PROXY`
allows.

The nginx in front of the web app adds a Content-Security-Policy
(`apps/web/security-headers.conf`): scripts only from the app itself (the
theme is set by `public/theme.js` instead of an inline script), styles from
the app plus inline style attributes, images from the app, `data:` and any
https site (README images), no frames, no plugins, no forms. It also sends
`Referrer-Policy: same-origin`, so links in a README do not tell other sites
which repository and branch someone was reading, plus `nosniff`,
`X-Frame-Options` and a Permissions-Policy that turns everything off. The
headers live in a snippet included in each location, because nginx drops
the server block's `add_header` lines in a location that has its own.

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
