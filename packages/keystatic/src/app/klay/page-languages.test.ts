/** @vitest-environment node */
import { expect, test } from 'vitest';
import { languageMenuTitle, languageRows } from './page-languages';
import { Language } from './pages';

const languages: Language[] = [
  { language: 'English', collection: 'docsEn', dir: 'help' },
  { language: 'Bahasa Indonesia', collection: 'docsId', dir: 'id/help' },
  { language: 'Tiếng Việt', collection: 'docsVi', dir: 'vi/help' },
];
const now = Date.parse('2026-10-12T12:00:00Z');
const pick = (rows: ReturnType<typeof languageRows>) =>
  rows.map(r => [r.language, r.status, r.note]);

test('one row per configured language: editing, stale, missing', () => {
  const rows = languageRows({
    languages,
    collection: 'docsEn',
    exists: new Set(['docsEn', 'docsId']),
    updated: new Map([
      ['docsEn', '2026-10-10T00:00:00Z'],
      ['docsId', '2026-09-01T00:00:00Z'],
    ]),
    now,
  });
  expect(pick(rows)).toEqual([
    ['English', 'editing', 'Main language'],
    ['Bahasa Indonesia', 'stale', 'English changed after this was translated'],
    ['Tiếng Việt', 'missing', 'Readers see English with a note'],
  ]);
});

test('a translation newer than the main page is up to date', () => {
  const rows = languageRows({
    languages: languages.slice(0, 2),
    collection: 'docsId',
    exists: new Set(['docsEn', 'docsId']),
    updated: new Map([
      ['docsEn', '2026-09-01T00:00:00Z'],
      ['docsId', '2026-09-28T00:00:00Z'],
    ]),
    now,
  });
  expect(pick(rows)).toEqual([
    ['English', 'current', 'Main language'],
    ['Bahasa Indonesia', 'editing', 'Translated 2 weeks ago'],
  ]);
});

test('without dates nothing is called stale', () => {
  const rows = languageRows({
    languages: languages.slice(0, 2),
    collection: 'docsEn',
    exists: new Set(['docsEn', 'docsId']),
    updated: new Map(),
    now,
  });
  expect(rows[1].status).toBe('current');
  expect(rows[1].note).toBe('Translated');
});

test('a page only in a translation has no fallback to promise', () => {
  const rows = languageRows({
    languages: languages.slice(0, 2),
    collection: 'docsId',
    exists: new Set(['docsId']),
    updated: new Map(),
    now,
  });
  expect(pick(rows)[0]).toEqual(['English', 'missing', 'Main language']);
});

test('the menu title counts the languages that have the page', () => {
  expect(languageMenuTitle(2, 2)).toBe('This page in 2 languages');
  expect(languageMenuTitle(1, 2)).toBe('This page in 1 of 2 languages');
  expect(languageMenuTitle(1, 1)).toBe('This page in 1 language');
});
