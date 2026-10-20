# Troubleshooting

## A repository is missing from the list

git-ui only looks at the **direct** subdirectories of `REPOS_DIR` (in docker:
the folder mounted at `/repos`, `REPOS_PATH` in `.env`). A directory is
skipped when:

- it is not a repository: it needs a `.git` folder or file, or the bare layout
  (`HEAD`, `objects/`, `refs/`)
- its name starts with a dot, or uses characters other than letters, digits,
  `.`, `_` and `-`
- it is a symlink that points outside `REPOS_DIR`; move or clone the
  repository into the folder instead
- another directory has the same name once `.git` is dropped (`notes` and
  `notes.git`); only one of them is shown

In docker, check what the container actually sees:

```bash
docker compose exec server ls -la /repos
```

## The demo repositories were not created

With `SEED_DEMO=true` (the docker default) the server creates three sample
repositories, but only when the folder has no repositories at all. If the
folder is not writable by the server, it logs
`could not create the demo repositories` and starts with an empty list.

Without `REPOS_PATH` this works out of the box: the demo data goes into a
docker volume. With `REPOS_PATH`, the folder has to be writable by the
server image's `node` user (uid 1000). A folder docker created for the mount
usually belongs to root:

```bash
sudo chown 1000 /path/to/repos
```

To start over with fresh demo data, remove the volume:
`docker compose down -v`.

## "git took too long to answer" (504)

git commands are stopped after 15 seconds (downloads are not limited). On very large repositories
this can happen for blame of a long file with deep history, a search across
the whole tree, or a compare between distant refs. Compare closer refs, open
the file's history instead of its blame, or pass `path` to the search API to
search a single folder.

## "The result is too large to display" (413)

git printed more than 32 MB for one request, typically a commit or
comparison that touches huge generated files. Individual files are still
available from the **Raw** button.

## A file says "This file is too large to display"

Files over 1 MB are not sent to the browser. Use **Raw** to open or save
them.

## A file has no syntax highlighting

Highlighting is skipped for unknown file types and for files over 200,000
characters or with a line longer than 3,000 characters (minified bundles),
since highlighting those would freeze the page.

## HTML files open as plain text

That is deliberate. Only raster images and SVG are served with their real
content type, and every raw file gets a sandboxing `Content-Security-Policy`,
so a file committed to a repository can never run script with access to
git-ui.

## The browser keeps asking for a password

Basic auth is on when both `AUTH_USERNAME` and `AUTH_PASSWORD` are set. Setting
only one of them, or a password under 8 characters, stops the server at start
with `Invalid environment: …` in its log. To turn auth off, leave both empty.

## "dubious ownership" when running git yourself

git-ui trusts each repository for the single command it runs, so it can read
folders owned by another user (common with docker volumes). Your own shell
does not get that exception. Run git as the owner, or trust the folder once:

```bash
git config --global --add safe.directory /path/to/repo
```

## Only 200 branches are listed

The branches page and the branch selector show the 200 branches with the
most recent commits. Older branches still work: open
`/<repo>/tree/<branch>` directly and every page will use that branch.
