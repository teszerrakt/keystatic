import { expect, test } from 'vitest';

import { config } from '../../config';
import { hasDrafts } from './drafts';

test('drafts are off unless the storage config sets drafts: true', () => {
  const github = { kind: 'github', repo: 'owner/repo' } as const;
  expect(hasDrafts(config({ storage: github }))).toBe(false);
  expect(hasDrafts(config({ storage: { ...github, drafts: false } }))).toBe(
    false
  );
  expect(hasDrafts(config({ storage: { ...github, drafts: true } }))).toBe(
    true
  );
  expect(hasDrafts(config({ storage: { kind: 'local' } }))).toBe(false);
});

test('the old draftsOnly key is a type error and no longer turns drafts on', () => {
  const old = config({
    storage: {
      kind: 'github',
      repo: 'owner/repo',
      // @ts-expect-error renamed to `drafts`
      draftsOnly: true,
    },
  });
  expect(hasDrafts(old)).toBe(false);
});
