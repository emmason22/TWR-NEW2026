import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

const root = process.cwd();
const htmlFiles = readdirSync(root).filter((f) => f.endsWith('.html'));

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

function isLocalRef(ref) {
  return ref && !ref.startsWith('http://') && !ref.startsWith('https://') && !ref.startsWith('mailto:') && !ref.startsWith('#') && !ref.startsWith('tel:');
}

for (const file of htmlFiles) {
  const abs = join(root, file);
  const content = readFileSync(abs, 'utf8');

  requiredMeta.forEach((metaNeedle) => {
    if (!content.includes(metaNeedle)) {
      warnings.push(`${file}: missing ${metaNeedle}`);
    }
  });

  const attrRegex = /(?:href|src)="([^"]+)"/g;
  let match;
  while ((match = attrRegex.exec(content)) !== null) {
    const ref = match[1];
    if (!isLocalRef(ref)) continue;
    if (ref.startsWith('data:')) continue;

    const cleanRef = ref.split('#')[0].split('?')[0];
    if (!cleanRef) continue;
    const refPath = cleanRef.startsWith('/')
      ? resolve(root, cleanRef.replace(/^\/+/, ''))
      : resolve(dirname(abs), cleanRef);
    if (!existsSync(refPath)) {
      missing.push(`${file}: missing local reference -> ${ref}`);
    }
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
