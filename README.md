# git-ui

A fast, read-only web interface for browsing the git repositories on a machine
or server. Point it at a folder of repositories and get:

- a repository list with descriptions and latest activity
- a file browser for any branch, tag or commit, with syntax highlighting,
  rendered Markdown, the last commit of every file and a go-to-file finder (`t`)
- commit history with message, author and path filters (following renames)
- commit pages with unified or side-by-side diffs
- blame, compare, code search, contributor insights and a language breakdown
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
regular clones work. [docs/architecture.md](docs/architecture.md) has the
details.

## Running with docker

```bash
docker compose up -d --build
```

Open http://localhost:8090. Out of the box the server fills a docker volume
with three demo repositories. To browse your own, create a `.env` next to
`docker-compose.yml`:

```bash
REPOS_PATH=/home/me/code   # folder with your repositories
SEED_DEMO=false
WEB_PORT=8090
# AUTH_USERNAME=admin
# AUTH_PASSWORD=a-long-password
```

The server container runs as uid 1000 and only needs read access to that
folder.

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
proxies `/api` to it. `npm run seed -w apps/server` creates the demo
repositories in `REPOS_DIR` if you want something to click through.

## Configuration

The server reads these environment variables (or `apps/server/.env`):

| Variable        | Default   | Description                                                           |
| --------------- | --------- | --------------------------------------------------------------------- |
| `REPOS_DIR`     | `./repos` | Folder whose subdirectories are the repositories to serve             |
| `PORT`          | `4100`    | API port                                                              |
| `HOST`          | `0.0.0.0` | Interface to listen on                                                |
| `LOG_LEVEL`     | `info`    | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`        |
| `SEED_DEMO`     | `false`   | Create demo repositories on start when `REPOS_DIR` has none           |
| `AUTH_USERNAME` |           | With `AUTH_PASSWORD`, require HTTP basic auth (not for `/api/health`) |
| `AUTH_PASSWORD` |           | At least 8 characters; set both or neither                            |

Docker compose adds `REPOS_PATH` (host folder mounted as `REPOS_DIR`, a named
volume when unset) and `WEB_PORT`, and defaults `SEED_DEMO` to `true`.

## Keyboard shortcuts

`t` jumps to a file, `/` focuses the search or filter box, shift-click selects
a range of lines and `?` lists them all.

## Documentation

- [docs/api.md](docs/api.md): the JSON API the web app is built on
- [docs/architecture.md](docs/architecture.md): how the server and web app work
- [docs/troubleshooting.md](docs/troubleshooting.md): missing repositories,
  timeouts, permissions

## Scripts

| Command             | What it does                     |
| ------------------- | -------------------------------- |
| `npm run dev`       | Server and web app in watch mode |
| `npm test`          | Server and web tests             |
| `npm run typecheck` | TypeScript and vue-tsc           |
| `npm run lint`      | ESLint                           |
| `npm run build`     | Production builds                |
