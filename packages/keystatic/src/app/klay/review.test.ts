/** @vitest-environment node */
import { expect, test } from 'vitest';
import {
  changeSummary,
  diffEntries,
  draftChanges,
  findProblems,
  frontmatterTitle,
  groupChanges,
  PageText,
  totalChanges,
} from './review';

const language = (c: string) =>
  c === 'docsEn' ? 'English' : 'Bahasa Indonesia';
const title = (p: { slug: string }) => p.slug;

test('a tree diff lists added, changed and removed files', () => {
  const current = new Map([
    ['a.md', { sha: '1' }],
    ['b.md', { sha: '2b' }],
    ['dir', { sha: 'd2', type: 'tree' }],
  ]);
  const base = new Map([
    ['b.md', { sha: '2' }],
    ['c.md', { sha: '3' }],
    ['dir', { sha: 'd1', type: 'tree' }],
  ]);
  expect(diffEntries(current, base)).toEqual([
    { path: 'a.md', kind: 'added' },
    { path: 'b.md', kind: 'changed' },
    { path: 'c.md', kind: 'removed' },
  ]);
});

test('a page changed in two languages is one row', () => {
  const groups = groupChanges({
    pages: [
      { collection: 'docsEn', slug: 'create-a-bill', kind: 'changed' },
      { collection: 'docsId', slug: 'create-a-bill', kind: 'changed' },
      { collection: 'docsEn', slug: 'add-a-vendor', kind: 'removed' },
    ],
    files: [
      {
        path: 'src/assets/images/docs/void-a-bill/void-button.png',
        kind: 'added',
      },
    ],
    language,
    title,
  });
  expect(groups.map(g => [g.key, g.short, g.rows.map(r => r.detail)])).toEqual([
    ['edited', '1 edited', ['English +1']],
    ['deleted', '1 deleted', ['English']],
    ['pictures', '1 picture', ['New · Void a bill']],
  ]);
  expect(groups[1].rows[0].page).toBeUndefined();
  expect(totalChanges(groups)).toBe(3);
  expect(changeSummary(groups)).toBe('2 pages and 1 picture');
});

test('change summaries read as a sentence', () => {
  const one = groupChanges({
    pages: [{ collection: 'docsEn', slug: 'a', kind: 'added' }],
    files: [],
    language,
    title,
  });
  expect(changeSummary(one)).toBe('1 page');
  expect(changeSummary([])).toBeNull();
});

test('titles come from the front matter', () => {
  expect(frontmatterTitle('---\ntitle: "Void a bill"\nx: 1\n---\nbody')).toBe(
    'Void a bill'
  );
  expect(frontmatterTitle('no front matter')).toBeUndefined();
});

const page = (text: string): PageText => ({
  title: 'Getting started',
  url: '/help/getting-started/',
  filePath: 'src/content/docs/help/getting-started.md',
  text,
  page: { collection: 'docsEn', slug: 'getting-started' },
});

test('links to deleted, missing and outside pages', () => {
  const problems = findProblems({
    pages: [
      page(
        [
          '[vendor](/help/add-a-vendor/)',
          '[bill](../create-a-bill/#steps)',
          '[gone](/help/nope)',
          '[home](/)',
          '[web](https://example.com/help/x/)',
        ].join('\n')
      ),
    ],
    pageUrls: new Set(['/help/getting-started/', '/help/create-a-bill/']),
    deletedUrls: new Map([['/help/add-a-vendor/', 'Add a vendor']]),
    prefixes: ['/help/', '/id/help/'],
    files: new Set(),
  });
  expect(problems.map(p => [p.kind, p.target])).toEqual([
    ['deleted-page', 'Add a vendor'],
    ['missing-page', '/help/nope/'],
  ]);
});

test('pictures resolve from the page file', () => {
  const problems = findProblems({
    pages: [
      page(
        '![a](../../../assets/images/docs/a.webp)\n![b](../../../assets/images/docs/b.webp)'
      ),
    ],
    pageUrls: new Set(),
    deletedUrls: new Map(),
    prefixes: ['/help/'],
    files: new Set(['src/assets/images/docs/a.webp']),
  });
  expect(problems.map(p => [p.kind, p.target])).toEqual([
    ['missing-picture', '../../../assets/images/docs/b.webp'],
  ]);
});

test('draft changes split pages from the files outside page folders', () => {
  const changes = draftChanges({
    collections: new Map([
      [
        'docsEn',
        {
          added: new Set(['new']),
          changed: new Set(['old']),
          removed: new Set<string>(),
        },
      ],
    ]),
    current: new Map([
      ['src/content/docs/help/new.md', { sha: '1' }],
      ['src/assets/images/docs/a.png', { sha: '2' }],
    ]),
    base: new Map(),
    dirs: ['src/content/docs/help'],
  });
  expect(changes.pages).toEqual([
    { collection: 'docsEn', slug: 'new', kind: 'added' },
    { collection: 'docsEn', slug: 'old', kind: 'changed' },
  ]);
  expect(changes.files).toEqual([
    { path: 'src/assets/images/docs/a.png', kind: 'added' },
  ]);
});
