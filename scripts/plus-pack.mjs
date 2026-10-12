// Packs packages/keystatic as @teszerrakt/keystatic-core without renaming it in
// the repo, so upstream merges stay clean. Run `pnpm build:packages` first.
// Usage: node scripts/plus-pack.mjs <version>   e.g. 0.6.9-plus.1
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const version = process.argv[2];
if (!version) throw new Error('Usage: node scripts/plus-pack.mjs <version>');

const out = resolve('plus-dist');
mkdirSync(out, { recursive: true });
const work = mkdtempSync(join(tmpdir(), 'plus-pack-'));

// pnpm pack resolves workspace: and catalog: ranges to real versions.
execFileSync('pnpm', ['pack', '--pack-destination', work], { cwd: 'packages/keystatic', stdio: 'inherit' });
const tgz = readdirSync(work).find((f) => f.endsWith('.tgz'));
execFileSync('tar', ['-xzf', join(work, tgz), '-C', work]);

const pkgPath = join(work, 'package', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
pkg.name = '@teszerrakt/keystatic-core';
pkg.version = version;
pkg.repository = { type: 'git', url: 'https://github.com/teszerrakt/keystatic/', directory: 'packages/keystatic' };
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

const file = join(out, `teszerrakt-keystatic-core-${version}.tgz`);
execFileSync('tar', ['-czf', file, '-C', work, 'package']);
console.log(file);
