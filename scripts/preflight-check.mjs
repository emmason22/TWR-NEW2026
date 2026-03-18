import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const root = process.cwd();
const rootHtmlFiles = readdirSync(root)
  .filter((f) => f.endsWith('.html'))
  .map((f) => join(root, f));
const twr2HtmlFiles = collectHtmlFiles(join(root, 'TWR2'));
const htmlFiles = [...rootHtmlFiles, ...twr2HtmlFiles]
  .map((abs) => relative(root, abs))
  .sort();

const requiredMeta = [
  'meta property="og:title"',
  'meta property="og:description"',
  'meta property="og:image"',
  'meta name="twitter:title"',
  'meta name="twitter:description"',
  'meta name="twitter:image"',
];

const missing = [];
const warnings = [];
const redirectsNoindex = new Set(['privacy.html', 'terms.html', 'donation-disclosure.html']);

function collectHtmlFiles(dir) {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true });
  const out = [];

  for (const entry of entries) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectHtmlFiles(abs));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.html')) {
      out.push(abs);
    }
  }

  return out;
}

function isLocalRef(ref) {
  return ref && !ref.startsWith('http://') && !ref.startsWith('https://') && !ref.startsWith('mailto:') && !ref.startsWith('#') && !ref.startsWith('tel:');
}

function isExactCasePath(absPath) {
  if (!existsSync(absPath)) return false;
  const relPath = relative(root, absPath);
  if (relPath.startsWith('..')) return false;
  const segments = relPath.split('/').filter(Boolean);

  let cursor = root;
  for (const segment of segments) {
    const names = readdirSync(cursor);
    if (!names.includes(segment)) return false;
    cursor = join(cursor, segment);
  }
  return true;
}

function validateReference(file, ref, attrLabel = 'local reference') {
  if (!isLocalRef(ref) || ref.startsWith('data:')) return;

  const cleanRef = ref.split('#')[0].split('?')[0];
  if (!cleanRef) return;

  const decodedRef = (() => {
    try {
      return decodeURI(cleanRef);
    } catch {
      return cleanRef;
    }
  })();

  const fileAbs = join(root, file);
  const refPath = decodedRef.startsWith('/')
    ? resolve(root, decodedRef.replace(/^\/+/, ''))
    : resolve(dirname(fileAbs), decodedRef);

  if (!existsSync(refPath)) {
    missing.push(`${file}: missing ${attrLabel} -> ${ref}`);
    return;
  }

  if (!isExactCasePath(refPath)) {
    missing.push(`${file}: wrong path casing for ${attrLabel} -> ${ref}`);
  }
}

for (const file of htmlFiles) {
  const abs = join(root, file);
  const content = readFileSync(abs, 'utf8');

  if (!redirectsNoindex.has(file)) {
    if (!content.includes('meta name="description"')) {
      warnings.push(`${file}: missing meta description`);
    }
    if (!content.includes('link rel="canonical"')) {
      warnings.push(`${file}: missing canonical link`);
    }
    if (!content.includes('meta name="robots"')) {
      warnings.push(`${file}: missing robots meta`);
    }
  }

  requiredMeta.forEach((metaNeedle) => {
    if (!redirectsNoindex.has(file) && !content.includes(metaNeedle)) {
      warnings.push(`${file}: missing ${metaNeedle}`);
    }
  });

  const attrRegex = /(?:href|src)="([^"]+)"/g;
  let match;
  while ((match = attrRegex.exec(content)) !== null) {
    validateReference(file, match[1], 'local reference');
  }

  const dataAssetRegex = /data-asset="([^"]+)"/g;
  while ((match = dataAssetRegex.exec(content)) !== null) {
    validateReference(file, match[1], 'data-asset');
  }
}

if (warnings.length) {
  console.log('Warnings:');
  warnings.forEach((w) => console.log(`  - ${w}`));
}

if (missing.length) {
  console.log('Errors:');
  missing.forEach((m) => console.log(`  - ${m}`));
  process.exit(1);
}

console.log(`Preflight passed for ${htmlFiles.length} HTML files.`);
