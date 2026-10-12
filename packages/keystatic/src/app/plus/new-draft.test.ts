/** @vitest-environment node */
import { expect, test } from 'vitest';

import { commitOnBase, DraftChanges, saveHandoff } from './new-draft';

const changes: DraftChanges = {
  message: { headline: 'Delete docs/a.mdoc', body: 'Delete docs/a/b.png' },
  additions: [{ path: 'docs/c.mdoc', contents: 'aGk=' }],
  deletions: [{ path: 'docs/a.mdoc' }],
};

test('a new draft is one commit on the base, built without moving a branch', async () => {
  const calls: { url: string; method: string; body?: any }[] = [];
  const fake = async (url: string, init: RequestInit) => {
    const body = init.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ url, method: init.method!, body });
    const sha = url.endsWith('/commits/base1')
      ? { sha: 'base1', tree: { sha: 'tree0' } }
      : url.endsWith('/blobs')
      ? { sha: 'blob1' }
      : url.endsWith('/trees')
      ? { sha: 'tree1' }
      : { sha: 'commit1' };
    return new Response(JSON.stringify(sha), { status: 201 });
  };
  const oid = await commitOnBase({
    repo: 'o/r',
    token: 't',
    baseOid: 'base1',
    changes,
    fetch: fake as typeof fetch,
  });
  expect(oid).toBe('commit1');
  expect(calls.map(c => `${c.method} ${c.url.split('/git/')[1]}`)).toEqual([
    'GET commits/base1',
    'POST blobs',
    'POST trees',
    'POST commits',
  ]);
  expect(calls[2].body).toEqual({
    base_tree: 'tree0',
    tree: [
      { path: 'docs/c.mdoc', mode: '100644', type: 'blob', sha: 'blob1' },
      { path: 'docs/a.mdoc', mode: '100644', type: 'blob', sha: null },
    ],
  });
  expect(calls[3].body).toEqual({
    message: 'Delete docs/a.mdoc\n\nDelete docs/a/b.png',
    tree: 'tree1',
    parents: ['base1'],
  });
});

test('a refused request names GitHub’s reason', async () => {
  const fake = async () =>
    new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
  await expect(
    commitOnBase({
      repo: 'o/r',
      token: 't',
      baseOid: 'x',
      changes,
      fetch: fake as typeof fetch,
    })
  ).rejects.toThrow('GitHub did not save the draft: Not Found');
});

test('the handed-off save is done once its draft starts', () => {
  const handoff = saveHandoff();
  handoff.stage('base1', changes);
  expect(handoff.changesOn('other')).toBeNull();
  expect(handoff.changesOn('base1')).toBe(changes);
  expect(handoff.take('draft/a')).toBe(false);
  handoff.committed('draft/a');
  expect(handoff.changesOn('base1')).toBeNull();
  expect(handoff.take('draft/b')).toBe(false);
  expect(handoff.take('draft/a')).toBe(true);
  expect(handoff.take('draft/a')).toBe(false);
});
