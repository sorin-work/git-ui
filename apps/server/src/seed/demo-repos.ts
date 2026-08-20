import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { git } from '../git/run.js';
import { RepoBuilder, type Author } from './builder.js';

// Fictional people for the sample history.
const maya: Author = { name: 'Maya Chen', email: 'maya@aurora.example' };
const leo: Author = { name: 'Leo Okafor', email: 'leo@aurora.example' };
const priya: Author = { name: 'Priya Nair', email: 'priya@aurora.example' };
const sam: Author = { name: 'Sam Rivera', email: 'sam@example.net' };
const ana: Author = { name: 'Ana Ruiz', email: 'ana@pixel.example' };
const tom: Author = { name: 'Tom Becker', email: 'tom@pixel.example' };

/** A small mock terminal screenshot (320x160), so image previews have something to show. */
const SCREENSHOT_PNG = Buffer.from(
  [
    'iVBORw0KGgoAAAANSUhEUgAAAUAAAACgCAIAAADywSLLAAACW0lEQVR42u3cvS4EURiAYSOjkOioRNCLglKlX9m9CY',
    'VCIXEB4gIkCoXCTezG9q6Aa5CISiOIQqNYmazsmRmz8bPHeZ5qMzmNT958mxEnW17fmgLiNG0EIGBAwICAIRF57Ynb',
    'zaXBh5Xru5qTp88fJw/mqk/OXswMPrzuvvkdwNiyirfQRbrDghkX6X46Gcq4SHeYjMFXaBBw5foNPg+u3+Dz4PqteA',
    '7YwCBgIKKAy945jz4ve+c8+rzsZZWXWGADQ3Ky2n9m8HdgiDhgwFdoQMCAgEHAwB/LX54eTQFsYEDAgIBBwICAAQED',
    'AgYBAwIGBAyJyr9+dPHyLMaf8H5n368ZGxgQMCBgQMAgYEDAgIAhIdn86popgA0MCBgQMAgYEDAgYEDAIGBAwICAIV',
    'ENrtTp97rmRZlWu2MINjAgYBAwIGBAwICAQcDARHClDtjAgIABAYOAAQEDAgYEDAIGBAwIGBLmSp3/xtU2NjAgYEDA',
    'gIBBwICAAQFD6lypAzYwIGBAwCBgQMCAgAEBg4ABAQMChoQ1uFLn8ObYvPgJJxtHhmADg4ABAQMCBgQMAgYEDHwbV+',
    'qADQwIGBAwCBgQMCBgQMAgYEDAgIAhYQ2u1On3uub1O1rtjiFgA4OAAQEDAgYEDAIGBAyMyZU6YAMDAgYEDAIGBAwI',
    'GBAwCBgQMCBgSFiDK3UezrfNK2ULe1eGYAMDAgYEDAIGBAwIGAQMRMCVOmADAwIGBAwCBgQMCBgQMAgYEDAgYBAwIG',
    'BAwICAQcCAgAEBAwIGAQMCBgQMAgYEDAgYEDAIGJhA73VTR2hl6hg9AAAAAElFTkSuQmCC',
  ].join(''),
  'base64',
);

const MIT = (holder: string) => `MIT License

Copyright (c) 2025 ${holder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
`;

async function auroraNotes(dir: string) {
  const repo = await RepoBuilder.init(dir);
  await repo.describe('Plain-text notes from the terminal, with #tags and search');

  await repo.commit(maya, '2025-01-06T09:12:00+01:00', 'Initial commit', {
    'README.md': '# aurora-notes\n\nTake notes from your terminal.\n',
    LICENSE: MIT('Maya Chen'),
    '.gitignore': 'node_modules/\ndist/\n',
    'package.json':
      JSON.stringify(
        { name: 'aurora-notes', version: '0.0.1', type: 'module', bin: { notes: 'dist/cli.js' } },
        null,
        2,
      ) + '\n',
  });
  await repo.commit(maya, '2025-01-07T20:41:00+01:00', 'Add note model and in-memory store', {
    'src/note.ts': `export interface Note {\n  id: number;\n  text: string;\n  createdAt: string;\n}\n`,
    'src/store.ts': `import type { Note } from './note.js';\n\nexport class Store {\n  private notes: Note[] = [];\n\n  add(text: string): Note {\n    const note = { id: this.notes.length + 1, text, createdAt: new Date().toISOString() };\n    this.notes.push(note);\n    return note;\n  }\n\n  list(): Note[] {\n    return [...this.notes];\n  }\n}\n`,
  });
  await repo.commit(maya, '2025-01-09T21:05:00+01:00', 'CLI: add and list notes', {
    'src/cli.ts': `#!/usr/bin/env node\nimport { Store } from './store.js';\n\nconst store = new Store();\nconst [command, ...rest] = process.argv.slice(2);\n\nif (command === 'add') {\n  const note = store.add(rest.join(' '));\n  console.log(\`Added note #\${note.id}\`);\n} else {\n  for (const note of store.list()) console.log(\`#\${note.id} \${note.text}\`);\n}\n`,
  });
  await repo.commit(
    leo,
    '2025-01-14T18:22:00+00:00',
    'Persist notes to a JSON file\n\nNotes used to disappear when the process exited. They are now saved to\n~/.aurora-notes.json after every change.',
    {
      'src/store.ts': `import { existsSync, readFileSync, writeFileSync } from 'node:fs';\nimport type { Note } from './note.js';\n\nexport class Store {\n  private notes: Note[];\n\n  constructor(private readonly file: string) {\n    this.notes = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [];\n  }\n\n  add(text: string): Note {\n    const note = { id: this.notes.length + 1, text, createdAt: new Date().toISOString() };\n    this.notes.push(note);\n    this.save();\n    return note;\n  }\n\n  list(): Note[] {\n    return [...this.notes];\n  }\n\n  private save() {\n    writeFileSync(this.file, JSON.stringify(this.notes, null, 2));\n  }\n}\n`,
    },
  );
  await repo.commit(maya, '2025-01-15T19:30:00+01:00', 'Add tests for the store', {
    'test/store.test.ts': `import { strict as assert } from 'node:assert';\nimport { test } from 'node:test';\nimport { Store } from '../src/store.js';\n\ntest('adds notes with increasing ids', () => {\n  const store = new Store('/tmp/aurora-test.json');\n  assert.equal(store.add('a').id + 1, store.add('b').id);\n});\n`,
  });
  await repo.tag(
    maya,
    '2025-01-15T19:45:00+01:00',
    'v0.1.0',
    'First usable version\n\nAdd and list notes, saved to a JSON file.',
  );

  await repo.branch('feature/tags');
  await repo.commit(priya, '2025-02-03T10:15:00+05:30', 'Support #tags in note text', {
    'src/tags.ts': `/** "#work call Ana #urgent" -> ["work", "urgent"] */\nexport function extractTags(text: string): string[] {\n  return [...text.matchAll(/#([\\w-]+)/g)].map((m) => m[1]!.toLowerCase());\n}\n`,
  });
  await repo.commit(priya, '2025-02-04T11:02:00+05:30', 'Filter notes by tag', {
    'src/cli.ts': `#!/usr/bin/env node\nimport { homedir } from 'node:os';\nimport { join } from 'node:path';\nimport { Store } from './store.js';\nimport { extractTags } from './tags.js';\n\nconst store = new Store(join(homedir(), '.aurora-notes.json'));\nconst [command, ...rest] = process.argv.slice(2);\n\nif (command === 'add') {\n  const note = store.add(rest.join(' '));\n  console.log(\`Added note #\${note.id}\`);\n} else if (command === 'tag') {\n  const tag = rest[0]?.toLowerCase();\n  for (const note of store.list().filter((n) => tag && extractTags(n.text).includes(tag))) {\n    console.log(\`#\${note.id} \${note.text}\`);\n  }\n} else {\n  for (const note of store.list()) console.log(\`#\${note.id} \${note.text}\`);\n}\n`,
  });
  await repo.checkout('main');
  await repo.commit(leo, '2025-02-05T17:48:00+00:00', 'Fix crash when the notes file is empty', {
    'src/store.ts': `import { existsSync, readFileSync, writeFileSync } from 'node:fs';\nimport type { Note } from './note.js';\n\nfunction load(file: string): Note[] {\n  if (!existsSync(file)) return [];\n  const text = readFileSync(file, 'utf8').trim();\n  return text ? JSON.parse(text) : [];\n}\n\nexport class Store {\n  private notes: Note[];\n\n  constructor(private readonly file: string) {\n    this.notes = load(file);\n  }\n\n  add(text: string): Note {\n    const note = { id: this.notes.length + 1, text, createdAt: new Date().toISOString() };\n    this.notes.push(note);\n    this.save();\n    return note;\n  }\n\n  list(): Note[] {\n    return [...this.notes];\n  }\n\n  private save() {\n    writeFileSync(this.file, JSON.stringify(this.notes, null, 2));\n  }\n}\n`,
  });
  await repo.merge(
    maya,
    '2025-02-06T09:30:00+01:00',
    'feature/tags',
    "Merge branch 'feature/tags'",
  );
  await repo.commit(maya, '2025-02-10T20:12:00+01:00', 'docs: usage and a screenshot', {
    'README.md':
      '# aurora-notes\n\nTake notes from your terminal.\n\n![Screenshot](docs/screenshot.png)\n\n## Usage\n\n```sh\nnotes add "Call Ana about the #budget"\nnotes list\nnotes tag budget\n```\n\nSee the [guide](docs/café-guide.md) for more.\n',
    'docs/screenshot.png': SCREENSHOT_PNG,
  });
  await repo.tag(
    maya,
    '2025-02-10T20:20:00+01:00',
    'v0.2.0',
    'Tags\n\nNotes can be tagged with #words and filtered with `notes tag`.',
  );

  await repo.move('src/store.ts', 'src/storage/file-store.ts');
  await repo.commit(
    priya,
    '2025-03-12T14:40:00+05:30',
    'Move storage into its own module\n\nCo-authored-by: Leo Okafor <leo@aurora.example>',
    {
      'src/cli.ts': `#!/usr/bin/env node\nimport { homedir } from 'node:os';\nimport { join } from 'node:path';\nimport { Store } from './storage/file-store.js';\nimport { extractTags } from './tags.js';\n\nconst store = new Store(join(homedir(), '.aurora-notes.json'));\nconst [command, ...rest] = process.argv.slice(2);\n\nif (command === 'add') {\n  const note = store.add(rest.join(' '));\n  console.log(\`Added note #\${note.id}\`);\n} else if (command === 'tag') {\n  const tag = rest[0]?.toLowerCase();\n  for (const note of store.list().filter((n) => tag && extractTags(n.text).includes(tag))) {\n    console.log(\`#\${note.id} \${note.text}\`);\n  }\n} else {\n  for (const note of store.list()) console.log(\`#\${note.id} \${note.text}\`);\n}\n`,
      'test/store.test.ts': `import { strict as assert } from 'node:assert';\nimport { test } from 'node:test';\nimport { Store } from '../src/storage/file-store.js';\n\ntest('adds notes with increasing ids', () => {\n  const store = new Store('/tmp/aurora-test.json');\n  assert.equal(store.add('a').id + 1, store.add('b').id);\n});\n`,
    },
  );
  await repo.commit(leo, '2025-03-20T19:05:00+00:00', 'Add search command', {
    'src/search.ts': `import type { Note } from './note.js';\n\nexport function search(notes: Note[], query: string): Note[] {\n  return notes.filter((note) => note.text.includes(query));\n}\n`,
  });
  await repo.commit(sam, '2025-04-02T08:55:00-05:00', 'docs: add a short guide', {
    'docs/café-guide.md':
      '# Guide\n\nNotes are stored in `~/.aurora-notes.json`.\n\n| Command | What it does |\n| --- | --- |\n| `notes add <text>` | Add a note |\n| `notes list` | Show every note |\n| `notes tag <tag>` | Notes with a #tag |\n',
  });
  await repo.commit(maya, '2025-04-10T21:30:00+02:00', 'Release 1.0.0', {
    'package.json':
      JSON.stringify(
        { name: 'aurora-notes', version: '1.0.0', type: 'module', bin: { notes: 'dist/cli.js' } },
        null,
        2,
      ) + '\n',
  });
  await repo.tag(
    maya,
    '2025-04-10T21:35:00+02:00',
    'v1.0.0',
    'Stable release\n\n- search command\n- storage moved to src/storage\n- user guide',
  );

  await repo.branch('experiment/sqlite');
  await repo.commit(leo, '2025-05-02T22:10:00+00:00', 'WIP: try a SQLite store', {
    'src/storage/sqlite-store.ts': `// Experiment: not wired up yet.\nexport class SqliteStore {}\n`,
  });
  await repo.checkout('main');

  await repo.commit(maya, '2025-06-14T10:00:00+02:00', 'Export notes to markdown', {
    'src/export.ts': `import type { Note } from './note.js';\n\nexport function toMarkdown(notes: Note[]): string {\n  return notes.map((n) => \`- \${n.text}\`).join('\\n');\n}`,
  });
  await repo.commit(priya, '2025-07-01T16:20:00+05:30', 'Make search case-insensitive', {
    'src/search.ts': `import type { Note } from './note.js';\n\nexport function search(notes: Note[], query: string): Note[] {\n  const needle = query.toLowerCase();\n  return notes.filter((note) => note.text.toLowerCase().includes(needle));\n}\n`,
  });
  await repo.commit(
    leo,
    '2025-07-08T18:00:00+00:00',
    'chore: tidy imports | no functional change',
    {
      'src/export.ts': `import type { Note } from './note.js';\n\n/** One bullet per note. */\nexport function toMarkdown(notes: Note[]): string {\n  return notes.map((n) => \`- \${n.text}\`).join('\\n') + '\\n';\n}\n`,
    },
  );
  await repo.tag(
    priya,
    '2025-07-08T18:30:00+00:00',
    'v1.1.0',
    'Markdown export and case-insensitive search',
  );

  await repo.branch('fix/accent-search');
  await repo.commit(sam, '2025-09-15T07:45:00-05:00', 'Ignore accents when searching', {
    'src/search.ts': `import type { Note } from './note.js';\n\nconst fold = (s: string) => s.normalize('NFD').replace(/\\p{Diacritic}/gu, '').toLowerCase();\n\nexport function search(notes: Note[], query: string): Note[] {\n  const needle = fold(query);\n  return notes.filter((note) => fold(note.text).includes(needle));\n}\n`,
  });
  await repo.checkout('main');
}

async function pixelWeather(reposDir: string) {
  const work = await mkdtemp(path.join(tmpdir(), 'pixel-weather-'));
  try {
    const repo = await RepoBuilder.init(work);
    await repo.commit(ana, '2025-03-01T11:00:00+01:00', 'Initial commit', {
      'README.md': '# pixel-weather\n\nA tiny dashboard for a home weather station.\n',
      'requirements.txt': 'flask==3.1.0\n',
    });
    await repo.commit(ana, '2025-03-02T15:30:00+01:00', 'Read sensor values over serial', {
      'weather/sensor.py':
        'import serial\n\n\ndef read(port="/dev/ttyUSB0"):\n    with serial.Serial(port, 9600, timeout=2) as conn:\n        temperature, humidity = conn.readline().decode().split(",")\n        return float(temperature), float(humidity)\n',
    });
    await repo.commit(tom, '2025-03-09T10:10:00+01:00', 'Serve the latest reading', {
      'weather/app.py':
        'from flask import Flask, jsonify\n\nfrom .sensor import read\n\napp = Flask(__name__)\n\n\n@app.get("/api/now")\ndef now():\n    temperature, humidity = read()\n    return jsonify(temperature=temperature, humidity=humidity)\n',
    });
    await repo.tag(ana, '2025-03-09T12:00:00+01:00', 'v0.1', 'First reading on the web');
    await repo.commit(tom, '2025-04-18T19:45:00+02:00', 'Keep the last 24 hours in memory', {
      'weather/history.py':
        'from collections import deque\n\nHISTORY = deque(maxlen=24 * 60)\n\n\ndef record(reading):\n    HISTORY.append(reading)\n',
    });
    await repo.commit(ana, '2025-05-05T08:20:00+02:00', 'Add a pixel-art chart', {
      'weather/static/chart.js':
        'export function draw(canvas, points) {\n  const ctx = canvas.getContext("2d");\n  points.forEach((p, x) => ctx.fillRect(x, canvas.height - p, 1, 1));\n}\n',
    });
    await repo.tag(ana, '2025-05-05T09:00:00+02:00', 'v0.2', 'Charts');
    await git(reposDir, ['clone', '--quiet', '--bare', work, 'pixel-weather.git']);
    await writeFile(
      path.join(reposDir, 'pixel-weather.git', 'description'),
      'Tiny dashboard for a home weather station\n',
    );
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function dotfiles(dir: string) {
  const repo = await RepoBuilder.init(dir);
  await repo.commit(sam, '2025-08-01T21:00:00-05:00', 'Shell basics', {
    '.zshrc': 'export EDITOR=nvim\nalias gs="git status -sb"\n',
  });
  await repo.commit(sam, '2025-08-03T09:15:00-05:00', 'Git config', {
    '.gitconfig': '[pull]\n\trebase = true\n[init]\n\tdefaultBranch = main\n',
  });
  await repo.commit(sam, '2025-08-20T23:40:00-05:00', 'Add install script', {
    'install.sh':
      '#!/bin/sh\nset -e\nfor f in .zshrc .gitconfig; do ln -sf "$PWD/$f" "$HOME/$f"; done\n',
  });
}

/**
 * Creates a few sample repositories in `reposDir` so a fresh install has
 * something to browse: branches, merges, tags, a rename, a binary file and a
 * file name with an accent.
 */
export async function createDemoRepos(reposDir: string): Promise<string[]> {
  await auroraNotes(path.join(reposDir, 'aurora-notes'));
  await pixelWeather(reposDir);
  await dotfiles(path.join(reposDir, 'dotfiles'));
  return ['aurora-notes', 'pixel-weather', 'dotfiles'];
}
