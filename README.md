# git-ui

A fast, read-only web interface for browsing the git repositories on a machine
or server. Point it at a folder of repositories and get:

- a repository list with descriptions and latest activity
- a file browser for any branch, tag or commit, with syntax highlighting,
  rendered Markdown, the last commit of every file and a go-to-file finder (`t`)
- commit history with message, author and path filters (following renames)
- commit pages with unified or side-by-side diffs
- blame, compare, code search and contributor insights
- branches (with how far ahead/behind the default branch they are) and tags
- raw files and zip/tar.gz downloads of any ref
- dark mode and a layout that works on phones

It never writes to your repositories and does not need a database.

## How it works

```
apps/
  server/   Fastify API that runs `git` (no shell) against REPOS_DIR
  web/      Vue 3 single-page app
```

The server shells out to the `git` binary with argument arrays (never a shell)
and validates every ref and path it receives. Repositories are the direct
subdirectories of `REPOS_DIR`; both bare repositories (`project.git`) and
regular clones work.

## Running locally

You need Node 22+ and git 2.30+.

```bash
npm install

# Point the server at a folder with some repositories in it
cp apps/server/.env.example apps/server/.env
# edit REPOS_DIR, e.g. REPOS_DIR=/home/me/code

npm run dev
```

Open http://localhost:5174. The API listens on :4100 and the Vite dev server
proxies `/api` to it.

## API

The web app is a thin client over a small JSON API, documented in
[docs/api.md](docs/api.md).

## Scripts

| Command             | What it does                                            |
| ------------------- | ------------------------------------------------------- |
| `npm run dev`       | Server and web app in watch mode                        |
| `npm test`          | Server tests (they create real git repos in a temp dir) |
| `npm run typecheck` | TypeScript and vue-tsc                                  |
| `npm run lint`      | ESLint                                                  |
| `npm run build`     | Production builds                                       |
