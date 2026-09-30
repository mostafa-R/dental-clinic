/**
 * Reports the *static* import closure of each built HTML entry.
 *
 * `vite build` prints per-chunk sizes, which is a different question from "what
 * does this page actually download". With more than one entry, Rollup hoists
 * everything the entries share into a common chunk, so a page's real cost is
 * the closure of static imports reachable from its entry script. Dynamic
 * `import()` is deliberately not followed: that is fetched on demand, so it is
 * not part of first load.
 *
 * Usage: node scripts/report-entry-size.mjs
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

/** Minified static-import forms: `import"./x.js"` and `import{a}from"./x.js"`.
 *  A dynamic `import("./x.js")` starts with `(` after `import`, so this
 *  deliberately does not match it. */
const STATIC_IMPORT_RE = /(?:^|[;\n}])\s*import(?:[^'"();]*?from\s*)?["']([^"']+)["']/g;

function entryScripts(html) {
  return [...html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)].map((m) => m[1]);
}

function staticImports(code) {
  return [...code.matchAll(STATIC_IMPORT_RE)].map((m) => m[1]);
}

/** Resolve a relative specifier against a bundle URL path.
 *  Deliberately string-based: `path.resolve('/assets', './x.js')` treats
 *  `/assets` as drive-rooted on Windows and yields `C:\assets\x.js`, which
 *  silently drops every dependency from the report. */
function joinUrlPath(baseFile, specifier) {
  const out = baseFile.split('/').slice(0, -1);
  for (const seg of specifier.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return '/' + out.filter(Boolean).join('/');
}

function closure(entryRelPath) {
  const seen = new Set();
  const queue = [entryRelPath];
  let raw = 0;
  let gzip = 0;
  const files = [];

  while (queue.length > 0) {
    const rel = queue.pop();
    if (seen.has(rel)) continue;
    seen.add(rel);

    const abs = resolve(distDir, rel.replace(/^\/+/, ''));
    if (!existsSync(abs)) continue;

    const bytes = readFileSync(abs);
    raw += bytes.length;
    gzip += gzipSync(bytes, { level: 9 }).length;
    files.push(rel);

    for (const dep of staticImports(bytes.toString('utf8'))) {
      if (dep.startsWith('/')) queue.push(dep);
      else if (dep.startsWith('.')) queue.push(joinUrlPath(rel, dep));
    }
  }

  return { files, raw, gzip };
}

const targets = [
  ['index.html', 'authenticated app'],
  ['pricing.html', 'public /pricing'],
];

for (const [file, label] of targets) {
  if (!existsSync(resolve(distDir, file))) {
    console.log(`\n${file}: NOT BUILT`);
    continue;
  }

  const scripts = entryScripts(readFileSync(resolve(distDir, file), 'utf8'));
  let raw = 0;
  let gzip = 0;
  const files = [];
  for (const script of scripts) {
    const r = closure(script);
    raw += r.raw;
    gzip += r.gzip;
    files.push(...r.files);
  }

  console.log(`\n=== ${file}  (${label}) ===`);
  console.log(`entry scripts: ${scripts.join(', ')}`);
  for (const f of files.sort()) console.log(`  ${f}`);
  console.log(
    `TOTAL: ${(raw / 1024).toFixed(1)} kB raw  /  ${(gzip / 1024).toFixed(1)} kB gzip`,
  );
}
