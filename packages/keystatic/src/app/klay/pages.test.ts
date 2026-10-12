/** @vitest-environment node */
import { expect, test } from 'vitest';
import {
  ago,
  buildPageRows,
  frontmatterField,
  Language,
  pageFromCommit,
} from './pages';

const languages: Language[] = [
  { language: 'English', collection: 'docsEn', dir: 'src/content/docs/help' },
  {
    language: 'Bahasa Indonesia',
    collection: 'docsId',
    dir: 'src/content/docs/id/help',
  },
];
const none = () => undefined;

test('a page in two languages is one row; a missing translation shows', () => {
  const rows = buildPageRows({
    languages,
    slugs: new Map([
      ['docsEn', new Set(['create-a-bill', 'tax-settings'])],
      ['docsId', new Set(['create-a-bill'])],
    ]),
    title: none,
    section: none,
    updated: (c, s) =>
      c === 'docsId'
        ? '2026-10-10T00:00:00Z'
        : `2026-10-0${s.length % 9}T00:00:00Z`,
  });
  expect(rows.map(r => [r.title, r.languages, r.missing])).toEqual([
    ['Create a bill', ['English', 'Bahasa Indonesia'], []],
    ['Tax settings', ['English'], ['Bahasa Indonesia']],
  ]);
  expect(rows[0].updated).toBe('2026-10-10T00:00:00Z');
});

test('in a draft, deleted pages stay listed and new pages say so', () => {
  const rows = buildPageRows({
    languages,
    slugs: new Map([
      ['docsEn', new Set(['reconcile', 'upload'])],
      ['docsId', new Set(['upload'])],
    ]),
    baseSlugs: new Map([
      ['docsEn', new Set(['upload', 'add-a-vendor'])],
      ['docsId', new Set(['upload', 'add-a-vendor'])],
    ]),
    changes: [
      { collection: 'docsEn', slug: 'reconcile', kind: 'added' },
      { collection: 'docsId', slug: 'upload', kind: 'changed' },
      { collection: 'docsEn', slug: 'add-a-vendor', kind: 'removed' },
      { collection: 'docsId', slug: 'add-a-vendor', kind: 'removed' },
    ],
    title: none,
    section: none,
    updated: none,
  });
  expect(
    rows.map(r => [r.slug, r.draft, r.changedLanguages, r.deletedIn])
  ).toEqual([
    [
      'add-a-vendor',
      'deleted',
      ['English', 'Bahasa Indonesia'],
      ['docsEn', 'docsId'],
    ],
    ['reconcile', 'new', ['English'], []],
    ['upload', 'edited', ['Bahasa Indonesia'], []],
  ]);
});

test('the last save names the page to continue', () => {
  expect(
    pageFromCommit('Update src/content/docs/id/help/create-a-bill', languages)
  ).toEqual({
    collection: 'docsId',
    slug: 'create-a-bill',
    deleted: false,
  });
  expect(
    pageFromCommit('Delete src/content/docs/help/hello', languages)?.deleted
  ).toBe(true);
  expect(pageFromCommit('Merge branch main', languages)).toBeUndefined();
});

test('dates read in days and weeks', () => {
  const now = Date.parse('2026-10-12T12:00:00Z');
  expect(ago('2026-10-12T11:58:00Z', now)).toBe('2 min ago');
  expect(ago('2026-10-11T10:00:00Z', now)).toBe('yesterday');
  expect(ago('2026-10-09T10:00:00Z', now)).toBe('3 days ago');
  expect(ago('2026-10-03T10:00:00Z', now)).toBe('last week');
  expect(ago('2026-09-20T10:00:00Z', now)).toBe('3 weeks ago');
});

test('front matter fields', () => {
  expect(
    frontmatterField('---\ntitle: A\nsection: payable\n---\n', 'section')
  ).toBe('payable');
});
