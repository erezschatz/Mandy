import { type Context, Hono } from 'hono';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SERVER_DIR = import.meta.dirname!;
const FRONT_DIR = path.resolve(SERVER_DIR, '../../front');
const HOME_DIR = os.homedir();

const MARKDOWN_EXTENSIONS = ['.md', '.markdown', '.txt'];

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function isMarkdownFile(filePath: string): boolean {
  return MARKDOWN_EXTENSIONS.includes(path.extname(filePath).toLowerCase());
}

export const router = new Hono();

// ── File API ─────────────────────────────────────────────────────────────────

router.get('/api/home', (c: Context) => c.json({ home: HOME_DIR }));

// Lists directories plus markdown files, so the dialog can walk anywhere the
// user can while still only offering files Mandy can actually open.
router.get('/api/browse', async (c: Context) => {
  const requestedPath = c.req.query('path') || HOME_DIR;
  const resolvedPath = path.resolve(requestedPath);

  try {
    const dirEntries = await fs.readdir(resolvedPath, { withFileTypes: true });
    const entries: { name: string; isDir: boolean; modified?: string }[] = [];

    for (const entry of dirEntries) {
      if (entry.name.startsWith('.')) {
        continue;
      }

      if (entry.isDirectory()) {
        entries.push({ name: entry.name, isDir: true });
      } else if (entry.isFile() && isMarkdownFile(entry.name)) {
        try {
          const stats = await fs.stat(path.join(resolvedPath, entry.name));
          entries.push({ name: entry.name, isDir: false, modified: stats.mtime.toISOString() });
        } catch {
          entries.push({ name: entry.name, isDir: false });
        }
      }
    }

    entries.sort((a, b) => {
      if (a.isDir !== b.isDir) {
        return a.isDir ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    const parsedRoot = path.parse(resolvedPath);
    const parent = resolvedPath !== parsedRoot.root ? path.dirname(resolvedPath) : null;
    return c.json({ path: resolvedPath, parent, entries });
  } catch (error) {
    return c.json({ error: 'Cannot read directory: ' + (error as Error).message }, 400);
  }
});

// `modified` is what lets the editor notice the file changing underneath it —
// another tool, a script, an agent. `stat=1` answers with that alone: the editor
// asks on every window focus while a file is open, and re-reading the whole
// document each time to look at one field would be the wrong trade.
router.get('/api/file', async (c: Context) => {
  const filePath = c.req.query('path');
  if (!filePath) {
    return c.json({ error: 'Path is required' }, 400);
  }

  const resolvedPath = path.resolve(filePath);
  if (!isMarkdownFile(resolvedPath)) {
    return c.json({ error: `File must be one of: ${MARKDOWN_EXTENSIONS.join(', ')}` }, 400);
  }

  try {
    const stats = await fs.stat(resolvedPath);
    const modified = stats.mtime.toISOString();
    const base = { path: resolvedPath, name: path.basename(resolvedPath), modified };
    if (c.req.query('stat')) {
      return c.json(base);
    }
    const content = await fs.readFile(resolvedPath, 'utf-8');
    return c.json({ ...base, content });
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') {
      return c.json({ error: 'File not found' }, 404);
    }
    return c.json({ error: 'Failed to read file: ' + (error as Error).message }, 500);
  }
});

router.post('/api/file', async (c: Context) => {
  let body: { path?: string; content?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const { path: filePath, content } = body;
  if (!filePath) {
    return c.json({ error: 'Path is required' }, 400);
  }
  if (typeof content !== 'string') {
    return c.json({ error: 'Content is required' }, 400);
  }

  const resolvedPath = path.resolve(filePath);
  if (!isMarkdownFile(resolvedPath)) {
    return c.json({ error: `File must be one of: ${MARKDOWN_EXTENSIONS.join(', ')}` }, 400);
  }

  // A save never conjures directories. The open file's path outlives the folder
  // it names — move or delete that folder and the editor still holds the old
  // path — so creating it would silently rebuild a tree the user got rid of,
  // and drop the document somewhere they would not think to look for it.
  const parent = path.dirname(resolvedPath);
  const parentStats = await fs.stat(parent).catch(() => null);
  if (!parentStats?.isDirectory()) {
    return c.json({ error: `Folder no longer exists: ${parent}` }, 400);
  }

  try {
    await fs.writeFile(resolvedPath, content, 'utf-8');
    // The mtime of what we just wrote, so the editor can re-baseline from the
    // reply. Without it the next focus check reads its own save as an outside
    // edit and reports the document stale against itself.
    const stats = await fs.stat(resolvedPath).catch(() => null);
    return c.json({
      path: resolvedPath,
      name: path.basename(resolvedPath),
      modified: stats?.mtime.toISOString(),
    });
  } catch (error) {
    return c.json({ error: 'Failed to save file: ' + (error as Error).message }, 500);
  }
});

// ── The browser checks ───────────────────────────────────────────────────────
//
// tests/browser-check.html, tests/list-indent-check.html and
// tests/list-empty-item-check.html measure what a real engine does with
// execCommand and with our own hand-rolled list surgery — the half the Deno
// suite has no editing engine to reach. They live in tests/, so the static
// handler below (pinned to FRONT_DIR) cannot serve them, and the two
// list-*-check pages need the app on their own origin: their <iframe src="/">
// reads straight into the running app's window. So serve exactly these files,
// GET only, name matched by a literal set — nothing here takes a path from the
// request.
const CHECK_PAGES = new Set([
  'browser-check.html',
  'list-indent-check.html',
  'list-empty-item-check.html',
]);
const TESTS_DIR = path.resolve(SERVER_DIR, '../../tests');

router.get('/tests/:name', async (c: Context) => {
  const name = c.req.param('name');
  if (!name || !CHECK_PAGES.has(name)) return c.text('Not found', 404);
  try {
    const file = await Deno.readFile(path.join(TESTS_DIR, name));
    return new Response(file, { headers: { 'Content-Type': MIME_TYPES['.html'] } });
  } catch {
    return c.text('Not found', 404);
  }
});

// Where a check page POSTs its JSON report. Printed so a headless run scrapes it
// from the process output; a hand run just reads the page. The body is ignored
// beyond that — this is a sink, not storage.
router.post('/report', async (c: Context) => {
  console.log('[report]', await c.req.text());
  return c.body(null, 204);
});

// ── Static frontend ──────────────────────────────────────────────────────────

router.get('/*', async (c: Context) => {
  const requested = decodeURIComponent(new URL(c.req.url).pathname);
  const relative = requested === '/' ? 'index.html' : requested.replace(/^\/+/, '');

  // Resolve inside FRONT_DIR and verify: a crafted path must not escape it.
  const resolvedPath = path.resolve(FRONT_DIR, relative);
  if (resolvedPath !== FRONT_DIR && !resolvedPath.startsWith(FRONT_DIR + path.sep)) {
    return c.text('Not found', 404);
  }

  try {
    const file = await Deno.readFile(resolvedPath);
    const contentType = MIME_TYPES[path.extname(resolvedPath).toLowerCase()] ??
      'application/octet-stream';
    return new Response(file, { headers: { 'Content-Type': contentType } });
  } catch {
    return c.text('Not found', 404);
  }
});
