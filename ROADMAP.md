# Roadmap

Things I might add to git-ui. The app already covers what I need to browse
repositories day to day (files, history, diffs, blame, compare, search,
insights, downloads), so nothing here is promised or scheduled. These are
ideas, written down with enough detail that I (or anyone else) can pick one up
later without starting from zero. Items may change, move between groups or be
dropped.

What the app does today is in the [README](README.md) and the notes under
[docs/](docs/).

- **Next**: small or well understood, or things I would not want to leave
  open. I would start with these.
- **Later**: worth doing, but bigger or waiting on a decision.
- **Maybe**: not sure yet that they are worth the extra complexity.

Sizes are rough: **S** is an evening or two, **M** a few evenings up to a
couple of weekends, **L** several weeks of spare time.

Each item is meant to fit in one pull request and to be covered by the test
suite. There are no browser tests and no database. Server tests create real
repositories in a temporary folder (`apps/server/test/repo.ts`) and call the
routes through `app.inject`, so they run the same git commands production
does; parsers have unit tests next to the command that feeds them. Web tests
run in jsdom: the pure helpers in `src/lib/` directly, and a few components
with @vue/test-utils. So logic worth testing belongs in `apps/server/src/git/`
(git calls and parsers), `apps/server/src/lib/` (everything else on the
server) or `apps/web/src/lib/` (everything in the browser that is not
markup), not inside a route handler or a component. Below, `server/` stands
for `apps/server/src/` and `web/` for `apps/web/src/`.

The hardest part of this app is that it runs `git` on the host against
repositories it does not control. A repository's config, attributes, links
and refs are all input. Items that touch `server/git/run.ts`,
`server/git/validate.ts` or `server/git/repos.ts` should come with a test
that builds a repository designed to break them.

"Depends on" lists real prerequisites only. Items that merely touch the same
file are not listed there; the bigger overlaps are mentioned in the items.

When an item ships, its group cell in the Overview becomes `Shipped`, its
section moves under the `## Shipped` heading at the end and shrinks to one
paragraph (what was built, how it differs from what is written here, what is
still open), and the README, the docs and the CHANGELOG (under an
`Unreleased` heading at the top) are updated in the same pull request.

## Overview

| #   | Item                                        | Group   | Area        | Size | Depends on |
| --- | ------------------------------------------- | ------- | ----------- | ---- | ---------- |
| 1   | Repositories cannot make git run programs   | Shipped | security    | M    | -          |
| 2   | Repositories stay inside REPOS_DIR          | Shipped | security    | M    | -          |
| 3   | Paths and refs that mean one thing          | Shipped | security    | S    | -          |
| 4   | Bounded git work                            | Shipped | ops         | M    | -          |
| 5   | Login throttling and security headers       | Shipped | security    | S    | -          |
| 6   | Insights for long histories                 | Later   | correctness | S    | -          |
| 7   | A cache bounded by size                     | Later   | performance | S    | -          |
| 8   | A faster repository list                    | Later   | performance | M    | -          |
| 9   | Choosing which repositories are shown       | Later   | repos       | S    | -          |
| 10  | Repositories in nested folders              | Later   | repos       | M    | 2, 8       |
| 11  | Every legal branch and tag name             | Later   | refs        | M    | 3          |
| 12  | Large commits and comparisons               | Later   | diffs       | M    | 3          |
| 13  | Ignoring whitespace and expanding context   | Later   | diffs       | M    | -          |
| 14  | Word-level changes in diffs                 | Later   | diffs       | S    | -          |
| 15  | Patch and diff downloads                    | Later   | diffs       | S    | -          |
| 16  | Permanent links                             | Later   | web         | S    | -          |
| 17  | Regular expression search                   | Later   | search      | S    | 3, 4       |
| 18  | File history with diffs                     | Later   | history     | M    | -          |
| 19  | Blame: earlier versions and ignored commits | Later   | history     | M    | -          |
| 20  | Tag pages and releases                      | Later   | refs        | S    | -          |
| 21  | Git LFS pointer files                       | Later   | files       | S    | -          |
| 22  | Submodule links                             | Later   | files       | S    | -          |
| 23  | Markdown fixes                              | Later   | web         | S    | -          |
| 24  | Clone URLs                                  | Later   | repos       | S    | -          |
| 25  | Atom feeds                                  | Later   | api         | S    | -          |
| 26  | Serving under a sub-path                    | Later   | ops         | M    | -          |
| 27  | Accessibility pass                          | Later   | ui          | M    | -          |
| 28  | Metrics and slow git calls in the log       | Later   | ops         | S    | -          |
| 29  | Supported git versions and upgrades         | Later   | ops         | S    | -          |
| 30  | A tighter docker setup                      | Later   | ops         | S    | -          |
| 31  | Page tests for the web app                  | Later   | tests       | M    | -          |
| 32  | Commit graph                                | Maybe   | history     | L    | -          |
| 33  | Search across all repositories              | Maybe   | search      | M    | 4          |
| 34  | Verified signatures                         | Maybe   | history     | L    | 1          |
| 35  | Notebooks and CSV files                     | Maybe   | files       | M    | -          |
| 36  | Several users and per-repository access     | Maybe   | auth        | L    | 9          |
| 37  | Login through a reverse proxy               | Maybe   | auth        | S    | 5          |

## Next

Everything that was here has shipped (see the end of this file). The next
picks come from Later.

## Later

### 6. Insights for long histories

`weeklyActivity` in `server/git/insights.ts` reads the commit time of every
commit in the history and then calls `Math.max(...times)`. Spreading an array
that large into a call throws `RangeError` in V8 somewhere past a hundred
thousand elements, so the insights page of a big repository (the Linux kernel,
but also many company monorepos) is a 500. The route is also not cached, so
the full `log` and `shortlog` walks run again on every visit.

- Replace the spread with a loop, and stop reading the whole history: the
  first line of `git log --format=%ct` is the newest commit in practice, so
  run `git log --since=<that minus 52 weeks>` for the buckets.
- Cache the result by commit sha, like the languages route does.
- Names: `shortlog` applies `.mailmap`, while `%an` in `log` does not. The
  contributors list merges people that the history page shows apart. Use
  `%aN`/`%aE` in `LOG_FORMAT` and the blame and latest formats, so both agree,
  and say so in the docs. `mailmap.file` is pinned by item 1; `.mailmap` from
  the commit itself is what bare repositories use (`mailmap.blob`), and
  regular clones read it from the working tree. Set `mailmap.blob=<commit>:.mailmap`
  so both kinds read it from the commit being shown.
- Tricky: a test cannot build 150,000 commits through `git commit`. Use
  `git fast-import` with a generated stream, which takes a second or two, or
  test the bucketing with a large array of timestamps and keep one route test
  small.
- Tests: `server/git/insights.test.ts`.

### 7. A cache bounded by size

`gitCache` in `server/lib/cache.ts` keeps 500 entries, whatever their size. A
file is up to 1 MB of text, a commit diff can be most of 32 MB of output once
parsed into objects, and the file list for the finder holds up to 50,000
paths. Five hundred large entries are several GB, and the server has no
memory limit in docker.

- `LruCache` counts an approximate size per entry and evicts by total size
  (`CACHE_MAX_MB`, default 256) as well as by count.
- The loader knows the size best: `cached(parts, load, sizeOf)`, where
  `sizeOf` gets the result. For blobs it is the content length, for diffs the
  output length from git (pass it out of `commitDiff`), for file lists the sum
  of path lengths. A default of `JSON.stringify(value).length` is too slow for
  big values; use it only in tests.
- Tricky: the cache stores promises, so the size is known only once a promise
  resolves. Count pending entries as zero and evict when they resolve.
- Tricky: entries bigger than the whole budget should not be cached at all
  rather than flushing everything else.
- Tests: `server/lib/cache.test.ts`.

### 8. A faster repository list

`RepoRegistry.list()` reads the whole of `REPOS_DIR` and checks every entry on
every request, and `get(name)` calls `list()`, so opening one file in one
repository stats every repository on the machine first. The home page then
runs `summarize` for each repository.

- `get(name)` checks only `REPOS_DIR/<name>` and `REPOS_DIR/<name>.git`
  (after `isSafeRepoName`) and applies the same rules as `list()`, including
  the checks from item 2. A test that both agree for every fixture.
- `list()` keeps its result for a couple of seconds. New repositories still
  appear almost at once, which the docs promise.
- `summarize`: the default branch from reading `HEAD` (a file), the
  description from a file, and one git call for the last commit, cached by the
  sha of the default branch. That sha can come from `refs/heads/<branch>` or
  `packed-refs` without git, but parsing refs by hand breaks with the reftable
  format. Lean: one `git for-each-ref --format=... refs/heads/<branch>` per
  repository, cached by its output.
- The API can sort by last activity and the home page can page or virtualise
  long lists. I would only do the sorting until someone has 500 repositories.
- Tests: `server/git/repos.test.ts` and `server/routes/repos.test.ts`.

### 9. Choosing which repositories are shown

Every repository in `REPOS_DIR` is published. There is no way to keep one out
without moving it. gitweb and cgit solve this with a marker file
(`git-daemon-export-ok`) or a list.

- `REPOS_EXPORT_OK=true`: only repositories with a `git-daemon-export-ok` file
  in their git directory are shown, as with gitweb.
- `REPOS_EXCLUDE`: a comma separated list of names or simple globs
  (`*-private`, `archive-*`), matched against the URL name.
- A hidden repository is a 404 on every route, the same answer as one that
  does not exist, so names cannot be probed.
- Tricky: the filter must live in the registry, so `get()` and `list()` both
  apply it, and so does every later feature that walks repositories (feeds,
  search across repositories).
- Tests: `server/git/repos.test.ts` and one route test per rule.

### 10. Repositories in nested folders

Only direct subdirectories count. Many people keep `code/work/api` and
`code/personal/notes`, or a server with `srv/git/team/project.git`.

- `REPOS_DEPTH` (default 1, at most 3). Names become paths: `team/project`.
- URLs: the router's first segment is `:repo`, and views like `tree` follow
  it. A slash in the name would make `/team/project/tree/main` ambiguous. Use
  one encoded segment (`team%2Fproject`) in URLs, as branch names already do
  (`web/lib/paths.ts`), and accept the slash form on the API.
- `isSafeRepoName` checks each segment; the full name gets a length limit.
- The home page groups repositories by folder.
- Tricky: stop at the first repository found. A checkout's subfolders are its
  own files, and vendored repositories or submodule checkouts inside a working
  tree must not show up as separate repositories.
- Tricky: walking is not free. Skip hidden folders, stop at the depth, cap the
  number of entries read per folder, and do not follow symlinked folders while
  walking (a loop) unless they pass the inside check.
- Depends on item 2 (every level needs the escape checks) and item 8 (the
  registry is rewritten there).
- Tests: `server/git/repos.test.ts` with nested fixtures, a repository inside
  a working tree, a symlink loop.

### 11. Every legal branch and tag name

`isSafeRef` only allows letters, digits and `._/@+-`. git allows much more:
`fix/ünicode`, `issue#12`, `a,b`, `release(2024)` and `wip!` are all valid
branch names. Those branches appear on the branches page (it lists whatever
`for-each-ref` prints) and clicking one gives a 400 "Invalid ref".

- Validate with git's own rules from `git check-ref-format`, reimplemented in
  `server/git/validate.ts` (no process per request): no control characters,
  space, `~`, `^`, `:`, `?`, `*`, `[`, `\`; no `..`, no `@{`, no `//`, no
  component starting with `.` or ending with `.lock`, not `@` alone. Plus our
  own: no leading `-`, at most 255 bytes.
- Lookups always go through `refs/heads/<name>` and `refs/tags/<name>` with
  `--end-of-options` (item 3), so a strange name can never be read as a
  revision expression. That is what makes it safe to loosen the characters.
- The web app already encodes every segment. Check `%`, `#`, `?` and non-ASCII
  in a route test through `app.inject` and a web test for `paths.ts`.
- Tricky: `refname:short` in `for-each-ref` can print an ambiguous short name
  (`heads/main` when a tag `main` exists). Use `refname` and strip the prefix
  ourselves.
- Tricky: the archive file name already replaces odd characters; check
  non-ASCII there and in `Content-Disposition`.
- Depends on item 3.
- Tests: the cases from git's own `t1402-check-ref-format.sh` in
  `server/git/validate.test.ts`, and route tests with real branches of those
  names.

### 12. Large commits and comparisons

A commit or comparison is one `git show` or `git diff` call whose whole
output is parsed. A commit that touches one huge generated file is a 413 for
all of it, and a commit with 5,000 changed files sends every hunk to the
browser. `DiffView` collapses files over 400 lines, but the page still builds
5,000 components.

- First the list: `git show --numstat --name-status -z` (or `--raw`) gives
  every file with its counts without the patch. The API returns that plus the
  patch for the first files, up to a budget of lines (say 20,000).
- The rest load per file: `/repos/:repo/commits/:sha/diff?path=` and the same
  for compare, with `-- <path>` and, for renames, both paths.
- A single file over a line limit says so and links to Raw and to its own
  diff on demand.
- The web app renders file sections lazily as they scroll into view.
- Tricky: rename detection is limited to the paths passed, so the per-file
  call must pass the old and the new name together with `--find-renames`.
- Tricky: merges are shown against the first parent today
  (`--diff-merges=first-parent`); the per-file call has to match.
- Depends on item 3 (the per-file call passes a path as a pathspec).
- Tests: route tests in `server/routes/commit.test.ts` and
  `compare.test.ts` with a commit over the budget; `DiffView` tests.

### 13. Ignoring whitespace and expanding context

Re-indenting a file makes its diff unreadable, and there is no way to see more
than three lines around a change.

- `whitespace=ignore` (`-w`) and `context=<n>` (0 to 100) on the commit and
  compare routes, part of the cache key. A toggle next to `DiffModeToggle`,
  kept in the URL.
- Expanding: "show more lines" between hunks fetches lines from the file at
  the old or new commit through the existing blob route, and the hunk headers
  give the line numbers. The mapping belongs in `web/lib/diff.ts`.
- Tricky: in split mode both sides must stay aligned; between hunks the
  unchanged lines are the same on both sides, with an offset.
- Tricky: files over 1 MB have no content in the blob route; hide the expand
  buttons there.
- Tests: `web/lib/diff.test.ts` for the line mapping, a route test for `-w`.

### 14. Word-level changes in diffs

A changed line shows as one removed and one added line; finding the one
character that changed is up to the reader.

- In `web/lib/diff.ts`: pair removed and added lines inside a hunk (in order,
  as many as there are on the shorter side), split each pair into tokens and
  mark the differing ranges with a small LCS.
- Render the ranges as `<del>` and `<ins>` inside the highlighted line, so the
  change is not shown by color alone.
- Tricky: the highlighted HTML from highlight.js and the word ranges overlap.
  Split the token spans at range edges instead of nesting at random.
- Tricky: cost. Skip lines over 500 characters and blocks over 50 lines.
- Tests: `web/lib/diff.test.ts`, `DiffView.test.ts`.

### 15. Patch and diff downloads

There is no way to take a commit out of git-ui as a patch, for `git am` or for
an email.

- `/repos/:repo/commits/:sha/patch` (`git format-patch -1 --stdout`) and
  `/diff` (the plain diff against the first parent), plus the same for a
  comparison (`format-patch base..head`, capped at the 250 commits the
  compare page shows). Links on the commit and compare pages.
- Tricky: `format-patch` reads `format.*` config: `format.headers`,
  `format.signature`, `format.signatureFile` (a file anywhere on the host,
  pinned by item 1), `format.from`. Pass `--no-signature` and pin the rest.
- Tricky: `format-patch` skips merge commits, and a root commit needs
  `--root`. A merge gets the first-parent diff and no patch link.
- Serve as `text/plain` with the raw file headers, or as an attachment.
- Tests: route tests that the patch applies with `git am` in a fresh
  repository.

### 16. Permanent links

A link to `/repo/blob/main/src/app.ts#L10-L20` points at other lines as soon
as `main` moves.

- `y` on the tree, blob and blame pages replaces the ref in the URL with the
  full commit sha, as on GitHub, and a "Copy permanent link" button does the
  same with the selected lines.
- The ref selector shows "commit 1a2b3c4" when the ref is a sha.
- Tricky: keep the line range from the hash. `web/lib/lines.ts` parses it.
- Add `y` to `KeyboardHelp.vue`.
- Tests: `web/lib/paths.test.ts` and a component test.

### 17. Regular expression search

Code search is literal (`--fixed-strings`). A regular expression is the usual
next step, and the first thing people try.

- `regex=1` on `/search` uses `git grep -E`. Not `-P`: PCRE backtracking can
  run for a very long time on one bad pattern.
- Tricky: glibc's ERE accepts backreferences, which can be exponential too.
  Refuse `\1` to `\9`, cap the pattern at 200 characters, and give search its
  own shorter timeout.
- Tricky: `git grep` uses one thread per CPU by default. Pass `--threads=2`
  so one search cannot take the machine, and count it in the semaphore.
- A file pattern filter (`*.ts`) built as `:(glob)` pathspec by the server,
  since pathspecs are literal after item 3.
- Depends on items 3 and 4.
- Tests: `server/routes/search.test.ts`.

### 18. File history with diffs

The history of a file is a list of commits. To see what each one did to the
file you open the commit and look for the file among the others.

- `/repos/:repo/commits?path=<file>&patch=1`, one page at a time, with each
  commit's diff limited to that file (`git log --follow -p`).
- On the history page of a file: each commit expands to its diff, with links
  to "view the file at this commit" and blame.
- Tricky: `--follow` combined with `--skip` and `-p` has to keep following
  across pages; test a rename that falls on a page boundary.
- Tricky: large and binary files follow the limits from item 12.
- Tests: route tests in `server/routes/commits.test.ts`.

### 19. Blame: earlier versions and ignored commits

Blame shows who last touched each line, but often that is a reformat, and the
interesting change is the one before.

- "Blame before this change" on each line: blame again at `<sha>^` with the
  path the line had in that commit. `--porcelain` prints a `filename` line
  when the path differs; `parseBlame` ignores it today and must keep it.
- `.git-blame-ignore-revs`: read the file from the commit being shown (not
  from the working tree, which bare repositories do not have) and pass each
  sha as `--ignore-rev`, capped at a few hundred. Mark lines that blame moved
  past an ignored commit.
- Tricky: `blame.ignoreRevsFile` in a repository config pointing at a missing
  file makes every blame fail. Item 1 pins it; this item adds the supported
  way.
- Tests: `server/git/blame.test.ts` with a rename and an ignored commit.

### 20. Tag pages and releases

The tags page lists names, dates and subjects. An annotated tag's full message
(release notes) is never shown, and there is no download from that page.

- `/:repo/tag/:name`: the tag message rendered as markdown, the tagger, the
  commit, zip and tar.gz downloads, and the commits since the previous tag
  (the compare from the previous tag).
- Sort by version as an option (`--sort=-v:refname`).
- Tricky: a tag can point at a tree or blob, not only a commit.
  `resolveCommit` fails on those; the page says so instead of 404.
- Tests: route tests in `server/routes/refs.test.ts`.

### 21. Git LFS pointer files

A file stored with Git LFS shows as its three line pointer
(`version https://git-lfs.github.com/spec/v1`, `oid sha256:…`, `size …`).

- Recognise the pointer in `readBlob` (small file, exact format) and return
  `lfs: { oid, size }`. The file page says "Stored with Git LFS" with the real
  size, instead of the pointer text.
- Not here: serving the real content. A bare repository on a server sometimes
  has `lfs/objects/<aa>/<bb>/<oid>`, but reading that means building a file
  path from repository data; it needs the same care as item 2.
- Archives contain the pointers, not the files. Say so next to the download.
- Tests: `server/routes/blob.test.ts`.

### 22. Submodule links

Submodules show in the file tree with their commit and nothing else.

- Read `.gitmodules` from the commit and parse it in TypeScript (not with
  `git config --blob`, which has its own include rules) to find each
  submodule's URL.
- Show the URL. When its last segment matches a repository git-ui serves,
  link to that commit there; when it is http or https, link out.
- Tricky: URLs with credentials (`https://user:token@host/x.git`) are common
  in `.gitmodules` by mistake. Strip the user info before showing or linking.
- Tricky: relative URLs (`../other.git`) resolve against the repository itself,
  which is exactly the case where git-ui can link inside.
- Tests: route test with a submodule; parser unit tests.

### 23. Markdown fixes

`web/lib/markdown.ts` has a few rough edges:

- `resolveRelative` calls `decodeURIComponent` on every segment. A link like
  `[x](100%25)` works, but `[x](100%)` throws `URIError` and the whole README
  fails to render.
- Relative links to folders (`docs/`) become blob URLs, which answer "is not a
  file". Link to the tree when the target ends with `/`, and let the blob page
  redirect to the tree when the path turns out to be a folder.
- Headings have no ids, so `#install` links do nothing. Add ids with a
  `user-content-` prefix so a heading cannot clobber a DOM property.
- External images are loaded straight from the reader's browser: a tracking
  pixel in a README sees who opened it. Add `referrerpolicy="no-referrer"` and
  `loading="lazy"`, and a setting to block them (`MARKDOWN_EXTERNAL_IMAGES`,
  `allow` or `block`), which item 5's CSP follows.
- Tests: `web/lib/markdown.test.ts`.

### 24. Clone URLs

git-ui does not serve the git protocol, and the repository page does not say
where to clone from.

- `CLONE_URLS`: one or more base URLs (`ssh://git@host/srv/git/`,
  `https://git.example.com/`). The repository page shows
  `git clone <base><directory name>` for each, with a copy button.
- The directory name can differ from the URL name (`notes.git` against
  `notes`); the API returns it.
- Tricky: never build the URL from the request's `Host` header, which the
  client controls.
- Tests: route test and a component test.

### 25. Atom feeds

People who follow a repository without logging in somewhere want a feed.

- `/api/repos/:repo/commits.atom?ref=` and `/api/repos/:repo/tags.atom`, linked
  from the history and tags pages with `<link rel="alternate">`.
- Absolute links need the public address: `PUBLIC_URL`, not the `Host` header.
- Tricky: commit messages can contain characters XML 1.0 does not allow at
  all (most control characters). Escape and strip them.
- Tricky: feed readers and basic auth. Many readers support credentials in
  the URL; document that, nothing more.
- `ETag` by commit sha so readers polling every few minutes cost nothing.
- Tests: route tests that parse the XML.

### 26. Serving under a sub-path

Behind a reverse proxy people want `https://host/git/` rather than a
subdomain. Everything assumes `/`: the router's history, the API client
(`/api`), the asset URLs, and nginx.

- `BASE_PATH` (default `/`) at build time for the web app: Vite's `base`,
  `createWebHistory(BASE_PATH)`, and the API client prefix. The docker web
  image takes it as a build argument and writes it into `nginx.conf`.
- The server stays on `/api`; the proxy strips the prefix.
- Tricky: build time against run time. A runtime setting would need the shell
  to read it from `<base href>` or a small config file. Build time is simpler
  and I lean towards it.
- Tests: `web/lib/paths.test.ts` and `api/client.ts` tests with a base path.

### 27. Accessibility pass

There is some ARIA (44 attributes, mostly labels and `aria-expanded`), but no
one has gone through the pages with a keyboard and a screen reader.

- The ref selector and the file finder as proper listbox/combobox widgets:
  arrow keys, `aria-activedescendant`, focus back to the button on Esc.
- Diff tables: line number columns with headers, added and removed lines
  marked by more than color (a visually hidden "added" / "removed").
- The language bar and activity chart get a text alternative (a list or
  table that screen readers read).
- A skip link to the content, visible focus everywhere, a live region for
  loading and errors, and contrast checked in both themes.
- Undecided: `axe-core` as a dev dependency in the jsdom tests. It catches
  missing names and roles but not contrast in jsdom. I lean towards adding it.
- Tests: component tests for roles and keyboard behaviour.

### 28. Metrics and slow git calls in the log

When the server is slow I cannot tell whether it is one repository, one kind
of page, or the machine.

- `/api/metrics` in Prometheus text format, written by hand: requests by route
  and status, git calls by subcommand with a duration histogram, timeouts,
  too-large answers, the semaphore queue from item 4 and cache hits from
  item 7.
- Log every git call slower than a threshold (`SLOW_GIT_MS`, default 2000)
  with subcommand, repository name and duration. Not the full arguments:
  they contain search terms.
- Tricky: the metrics endpoint is behind the same auth as the API. Add
  `METRICS_TOKEN` if a scraper cannot do basic auth.
- Tests: `server/routes` test for the format and the counters.

### 29. Supported git versions and upgrades

The README says git 2.30+, but nothing checks it, and CI runs whatever the
runner has. Items 1, 3 and 4 want newer features.

- At start, run `git --version` once, refuse to start below the minimum with
  a clear message, and keep the version for feature checks
  (`ahead-behind` from 2.41).
- Settle the minimum with item 1 (2.32 for `GIT_CONFIG_GLOBAL`) and write it
  in the README and the troubleshooting notes.
- An upgrade section in the docs: there is no database or state to migrate,
  only `.env` to keep, and the demo volume can be dropped. That is also the
  whole backup story, and it should say so.
- Undecided: a CI job that runs the server tests against the minimum git (a
  container with an older git). It doubles the test time; I lean towards a
  weekly run rather than every push.
- Tests: `server/git/run.test.ts` for version parsing.

### 30. A tighter docker setup

The compose file mounts `REPOS_PATH` read-write, because the seeding of demo
repositories needs to write. With your own repositories it does not.

- `REPOS_MODE` (default `rw`, `ro` documented for real repositories) in the
  volume line; the README example uses `ro` with `SEED_DEMO=false`.
- The server container: `read_only: true` with a `tmpfs` for `/tmp`,
  `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`.
- The web container: the unprivileged nginx image on port 8080.
- Tricky: git on a read-only mount must not try to write: lock files for the
  index refresh in clones (`GIT_OPTIONAL_LOCKS=0`), `commit-graph` or
  `gc.auto` never run by the read commands, but test with a real read-only
  mount once.
- Tests: none automated; a manual compose run listed in the pull request.

### 31. Page tests for the web app

The web tests cover the helpers and three components (`DiffView`,
`FileTree`, `LanguageBar`). Pages have none: pagination and filters on the
history page, swapping refs on compare, line selection on the file page,
the ref selector.

- A small helper in `apps/web/test/` that mounts a page with a memory router
  and a stubbed `fetch` answering from fixtures shaped like `web/api/types.ts`.
- Tests for `CommitsPage`, `ComparePage`, `BlobPage` and `RefSelector`.
- Tricky: `useAsync` ignores late responses; tests must wait for the right
  request, not just a tick.

## Maybe

### 32. Commit graph

A history list without branches drawn is hard to read in a repository with
many merges.

- Lanes computed from parents in `web/lib/graph.ts` (the server already
  returns `parents`), drawn as SVG next to the list. `--topo-order` on the
  history call so lanes are stable.
- Tricky: paging. Lanes started on one page continue on the next, so the
  state at the end of a page has to be carried over.
- Tricky: `--topo-order` is slow on large histories without a commit-graph
  file, and git-ui never writes one.
- Why maybe: a lot of drawing code for a page that works without it.

### 33. Search across all repositories

Search is per repository. Finding which repository has a function means
opening each.

- `/api/search?q=` fans `git grep` out over every repository's default
  branch under the semaphore from item 4, with a per-repository cap and a
  total cap, and returns results as each repository answers.
- Tricky: hidden repositories (item 9) must stay hidden.
- Tricky: with 200 repositories this is 200 processes for one request. Without
  an index it does not scale, and an index is a database, which the app does
  not have.
- Depends on item 4.

### 34. Verified signatures

Showing "verified" next to signed commits means running gpg or ssh-keygen,
which item 1 stops a repository from doing.

- The operator, not the repository, provides the program and the keys:
  `SIGNING_KEYRING` and `SIGNING_ALLOWED_SIGNERS`, with `gpg.program` pinned to
  the real binary and `GNUPGHOME` a read-only copy.
- `%G?` and `%GK` in the log format, cached by sha.
- Why maybe: gpg parses attacker-controlled data on every page, and the
  answer depends on keys the operator has to keep up to date.
- Depends on item 1.

### 35. Notebooks and CSV files

`.ipynb` files show as JSON and CSV as text.

- Notebooks: cells in order, markdown cells through `renderMarkdown`, code
  highlighted, outputs limited to text and base64 PNG or JPEG. HTML and
  JavaScript outputs are never rendered.
- CSV: a table for files under 1 MB, with a row cap.
- Why maybe: both are popular, but each is a parser and a renderer to keep up.

### 36. Several users and per-repository access

Basic auth is one shared user. Some setups want a few users, each seeing some
of the repositories.

- `USERS_FILE` with scrypt hashes and, per user, a list of repository name
  patterns. The registry filters by the current user, which needs item 9's
  filter in place.
- Tricky: every route goes through `findRepo`, which is good, but caches are
  keyed by repository path and must never answer across users for lists.
- Why maybe: at that point a proper forge is the better tool.
- Depends on item 9.

### 37. Login through a reverse proxy

Many people already have a login in front of their services (oauth2-proxy,
Authelia) that passes the user in a header.

- `AUTH_PROXY_HEADER=X-Forwarded-User`: requests without it are refused, and
  basic auth is off.
- Tricky: the header is only trustworthy when the server cannot be reached
  except through the proxy. Combine with `TRUST_PROXY` from item 5 and accept
  the header only from the proxy's address.
- Depends on item 5.

## Shipped

### 1. Repositories cannot make git run programs

Every git call now pins the config that could start a program or change the
output (`PINNED_CONFIG` in `server/git/run.ts`) and runs with an empty
environment plus `PATH` and `TMPDIR`, with the system, user and attribute
config switched off and replace objects ignored. Archives no longer use
`git archive`: the server reads the files with `ls-tree` and
`cat-file --batch`, which never look at attributes, and writes the tar or zip
itself, so neither filter drivers nor `tar.<format>.command` (which can
replace the zip and gzip writers, found while testing) can run, however the
config changes during a download. The end of an archive is written only after
git exited cleanly, so a failure halfway cuts the download off.
`apps/server/test/hostile.ts` builds repositories that set all of this, with
OpenPGP, SSH and X.509 signatures and once through `include.path`, and the
route tests call every endpoint on them. Archives also refuse (422) trees
that would unpack outside their folder (`..` paths, `.git`, duplicates,
entries below a symlink, symlinks to absolute paths or out of the archive),
keep names and link targets as raw bytes, stream tar content and clamp dates
to what the formats hold. Differences: `export-ignore` and `export-subst`
are no longer applied, and a zip over 65,534 entries, about 4 GB or with a
file over 100 MB is a 413 (no zip64, each file is compressed in memory). The git minimum stays at 2.30, because `HOME` is
not passed at all, so older git finds no user config either.
`blame.ignoreRevsFile` is a list `-c` cannot clear, so blame gets
`--no-ignore-revs-file` instead. `GIT_NO_REPLACE_OBJECTS` is set, `grep`
also gets `--no-textconv` and `core.attributesFile` is pinned. Planned keys I
did not pin: `core.sshCommand` and `diff.external` (no read command uses the
first, `--no-ext-diff` covers the second), `format.signatureFile` (item 15
has to pin it with format-patch), and `core.quotePath`,
`grep.patternType`, `grep.lineNumber` and `log.decorate`, which are harmless
because the callers pass explicit flags or formats that win over them. Still
open: `include.path` can make git read any file the server can read as
config, which only reveals whether it exists.

### 2. Repositories stay inside REPOS_DIR

`detectRepo` now returns the git directory (following `gitdir:` in a `.git`
file), and `escapeReason` in `server/git/repos.ts` refuses a repository unless
that directory, its `commondir`, every alternate (recursively, five levels,
relative entries against the real objects folder as git does), every entry
under `refs/`, `logs/` and `objects/`, and `HEAD`, `config`, `index`,
`packed-refs`, `shallow` and `info/grafts` resolve inside `REPOS_DIR`.
Dangling links are refused, and so is a repository with more than 100,000
entries to walk (or 3 seconds of walking), with a reason that says to run
`git gc`. Refused repositories are logged once with
the reason. git runs with `GIT_DIR` and `GIT_WORK_TREE` set, so there is no
discovery. Differences: `GIT_WORK_TREE` was not in the plan; I added it
because `core.worktree` in a repository's config made `shortlog` read a
`.mailmap` from any folder, and with it bare repositories need
`mailmap.blob=HEAD:.mailmap` pinned to keep their old behaviour. Every call
that names revisions now ends them with `--`, because the work tree of a bare
repository has a file called `HEAD`. Alternates that do not exist are
ignored, as git does, and quoted alternate entries are refused. No
`ALLOW_EXTERNAL_GIT_DIRS` opt-in. Still open: I could not test in CI whether
git checks ownership of an explicit `GIT_DIR`, so `safe.directory` is passed
for both the folder and the git directory; and the check and the git call
are not atomic, so the check is defence in depth, not a boundary, and the
README says `REPOS_DIR` must only be writable by people who may read what
the server can read.

### 3. Paths and refs that mean one thing

git runs with `GIT_LITERAL_PATHSPECS=1`, so a path in a request is only ever
that path. `resolveCommit` looks a name up as a full sha, `refs/heads/<name>`,
`refs/tags/<name>`, then an abbreviated sha of at least 7 characters (found
among objects with `rev-parse --disambiguate`, so a ref of that name never
wins; a prefix that fits two commits is a 409), accepts
`refs/heads/x`, `refs/tags/x` and `HEAD`, and nothing else; the API returns
the `kind` it found. Branch and tag names and the default branch are read
in full (`lstrip=2`, `symbolic-ref HEAD`), because git's short names turn
into `heads/v1` when a branch and a tag share a name. The tags page and the ref selector link a tag as
`refs/tags/<name>` when a branch has the same name. Every command that names
a revision puts `--end-of-options` before it. Differences: `blame` and `grep`
reject `--end-of-options` in git 2.30 and still in 2.43, so they get
`assertFullSha` instead, which throws unless the revision is a full sha. I
checked the other commands against git 2.30.6 in a container. The web app
does not show "tag v1" yet; it gets `kind` but only strips `refs/tags/` from
the label. No runtime check that every request value reaches git as a sha
or after `--`: with lookups in one place and the sha guard, I did not find
a way to write one that would not just repeat the call sites.

### 4. Bounded git work

Every buffered git call runs under a semaphore (`server/lib/semaphore.ts`,
`gitSlots` in `server/git/run.ts`): `GIT_MAX_PROCESSES` at once, twice the
CPUs by default, and a call that waited `GIT_QUEUE_TIMEOUT_MS` (10 seconds)
gets a `BusyError`, answered as 503 `busy` with `Retry-After`. Downloads
have their own semaphore (`ARCHIVE_MAX_CONCURRENT`, 2), a time limit (`ARCHIVE_TIMEOUT_MS`, ten minutes) and are destroyed,
which kills `cat-file`, when the response closes early. Branches count ahead
and behind with one `for-each-ref --format=%(ahead-behind:...)` from git
2.41 (detected once with `git --version`), and with one `rev-list` per
branch, under the semaphore, before that. Differences: item 1 had already
replaced `gitStream` and `git archive`, so the stderr cap is the 4 KB one
in `BlobReader`, and the `cat-file` processes of a download are counted by
the download limit, not by `gitSlots`, so a slow download cannot hold git
slots for minutes. One queue for everything, as planned; whether list-style
pages need their own waits for numbers from item 28. No per-client rate
limits. A follow-up after review: each request carries an `AbortSignal`
(AsyncLocalStorage), so a request whose client left, or that failed, takes
its queued git calls out of the queue and kills the running ones; downloads
wait for a slot as long as `GIT_QUEUE_TIMEOUT_MS`; and a download stopped by
its time limit before the first byte answers 504.

### 5. Login throttling and security headers

`LoginThrottle` in `server/lib/basic-auth.ts` counts wrong passwords per
`request.ip`: ten in five minutes and that address gets 429 with
`Retry-After` until the window passes, without its passwords being checked;
requests without credentials do not count, a right password clears the
address, IPv6 addresses count by their /64, and at most 5,000 addresses are
kept. `TRUST_PROXY` (off by default,
`1` in docker compose) is passed to Fastify, a hop count as a trust function.
nginx sends a CSP, `Referrer-Policy: same-origin`, `nosniff`,
`X-Frame-Options: DENY` and a Permissions-Policy from a snippet included in
each location; the inline theme script moved to `public/theme.js` so
`script-src 'self'` holds, `style-src` is `'self'` only (markdown loses
`<style>` and `style=`), and nginx's own 5xx pages carry the headers too. The API adds `nosniff`, and `Cache-Control:
private` with a login. Differences: `X-Frame-Options` and `object-src 'none'`
are extra. I did not add `nginx -t` to the image build, because nginx
resolves the `server` upstream when it checks the config and the build has
no such host. External README images stay allowed (`img-src https:`) until
item 23. Still open: the CSP was not checked in a browser against the
production build.
