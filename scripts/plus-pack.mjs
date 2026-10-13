// Packs packages/keystatic as @teszerrakt/keystatic-core and design-system/pkg
// as @teszerrakt/keystar-ui without renaming them in the repo, so upstream
// merges stay clean. Run `pnpm build:packages` first.
// Usage: node scripts/plus-pack.mjs <version>   e.g. 0.6.9-plus.1.0.0
// Version: <upstream core version>-plus.<major>.<minor>.<patch>. Bump major
// on a breaking fork change; keep it when only the upstream base changes.
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const version = process.argv[2];
if (!version) throw new Error('Usage: node scripts/plus-pack.mjs <version>');
const suffix = version.slice(version.indexOf('-') + 1);
if (!version.includes('-') || !suffix) {
  throw new Error(
    `Expected a prerelease version like 0.6.9-plus.1.0.0, got ${version}`
  );
}

const out = resolve('plus-dist');
mkdirSync(out, { recursive: true });

function pack(dir, name, edit) {
  const work = mkdtempSync(join(tmpdir(), 'plus-pack-'));
  // pnpm pack resolves workspace: and catalog: ranges to real versions.
  execFileSync('pnpm', ['pack', '--pack-destination', work], {
    cwd: dir,
    stdio: 'inherit',
  });
  const tgz = readdirSync(work).find(f => f.endsWith('.tgz'));
  execFileSync('tar', ['-xzf', join(work, tgz), '-C', work]);

  const pkgPath = join(work, 'package', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  pkg.name = name;
  pkg.repository = {
    type: 'git',
    url: 'https://github.com/teszerrakt/keystatic/',
    directory: dir,
  };
  edit(pkg);
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

  const file = join(
    out,
    `${name.slice(1).replace('/', '-')}-${pkg.version}.tgz`
  );
  execFileSync('tar', ['-czf', file, '-C', work, 'package']);
  console.log(file);
  return pkg.version;
}

// Plus adds components to @keystar/ui (SplitButton), so core must not get the
// upstream release from npm.
const uiVersion = pack('design-system/pkg', '@teszerrakt/keystar-ui', pkg => {
  pkg.version = `${pkg.version}-${suffix}`;
});

pack('packages/keystatic', '@teszerrakt/keystatic-core', pkg => {
  pkg.version = version;
  // An npm: alias keeps the `@keystar/ui` import path. A peer dependency can't
  // carry the alias, and pnpm would auto-install the upstream release for it.
  pkg.dependencies['@keystar/ui'] = `npm:@teszerrakt/keystar-ui@${uiVersion}`;
  delete pkg.peerDependencies?.['@keystar/ui'];
});
