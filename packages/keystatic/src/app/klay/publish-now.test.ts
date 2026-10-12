/** @vitest-environment node */
import { expect, test } from 'vitest';
import { isPublishNow, publishNowNote, publishNowPlan } from './publish-now';

const page = { collection: 'docsEn', slug: 'about-us' };
const base = {
  page,
  pages: [],
  files: [],
  saving: [],
  dropped: [],
  pageText: 'We started Klay.',
};

test('an edit on the live site publishes just the page', () => {
  expect(publishNowPlan(base)).toEqual({
    allowed: true,
    page: 'changed',
    pictures: [],
  });
});

test('a new picture saved with the page goes live with it', () => {
  const plan = publishNowPlan({
    ...base,
    saving: [
      { path: 'src/assets/images/docs/team-2026.png', kind: 'added' as const },
    ],
    pageText: '![Team](../../assets/images/docs/team-2026.png)',
  });
  expect(plan.allowed).toBe(true);
  expect(plan.pictures).toEqual([
    {
      path: 'src/assets/images/docs/team-2026.png',
      title: 'Team 2026',
      kind: 'added',
    },
  ]);
});

test('pictures the save replaces or drops go live with the page', () => {
  const plan = publishNowPlan({
    ...base,
    saving: [
      { path: 'src/assets/images/docs/cover.png', kind: 'changed' as const },
      { path: 'src/assets/images/docs/old.png', kind: 'removed' as const },
    ],
  });
  expect(plan.allowed).toBe(true);
  expect(plan.pictures.map(p => [p.title, p.kind])).toEqual([
    ['Cover', 'changed'],
    ['Old', 'removed'],
  ]);
});

test('a draft with only this page, new, and a picture it uses is allowed', () => {
  const plan = publishNowPlan({
    ...base,
    pages: [{ ...page, kind: 'added' }],
    files: [{ path: 'src/assets/images/docs/map.webp', kind: 'added' }],
    pageText: '![Map](../../assets/images/docs/map.webp)',
  });
  expect(plan.allowed).toBe(true);
  expect(plan.page).toBe('added');
  expect(plan.pictures.map(p => p.title)).toEqual(['Map']);
});

test('a draft that changes another page is blocked', () => {
  const plan = publishNowPlan({
    ...base,
    pages: [
      { ...page, kind: 'changed' },
      { collection: 'docsEn', slug: 'pricing', kind: 'changed' },
    ],
  });
  expect(plan.allowed).toBe(false);
});

test('the same page in another language counts as another page', () => {
  const plan = publishNowPlan({
    ...base,
    pages: [{ collection: 'docsId', slug: 'about-us', kind: 'added' }],
  });
  expect(plan.allowed).toBe(false);
});

test('a picture the page does not use is blocked', () => {
  const plan = publishNowPlan({
    ...base,
    files: [{ path: 'src/assets/images/docs/old.png', kind: 'removed' }],
  });
  expect(plan.allowed).toBe(false);
});

test('a non-picture file in the draft or the save is blocked', () => {
  expect(
    publishNowPlan({
      ...base,
      files: [{ path: 'astro.config.mjs', kind: 'changed' }],
    }).allowed
  ).toBe(false);
  expect(
    publishNowPlan({
      ...base,
      saving: [{ path: 'src/menu.yaml', kind: 'changed' as const }],
    }).allowed
  ).toBe(false);
});

test('the pull request note marks a Publish now', () => {
  expect(isPublishNow(`Some text\n\n${publishNowNote}`)).toBe(true);
  expect(isPublishNow('Published from the docs editor.')).toBe(false);
  expect(isPublishNow(null)).toBe(false);
});

test('a draft picture the save drops is no longer a change', () => {
  const plan = publishNowPlan({
    ...base,
    pages: [{ ...page, kind: 'changed' }],
    files: [{ path: 'src/assets/images/docs/about-us/old.png', kind: 'added' }],
    saving: [
      {
        path: 'src/assets/images/docs/about-us/new.png',
        kind: 'added' as const,
      },
    ],
    dropped: ['src/assets/images/docs/about-us/old.png'],
  });
  expect(plan.allowed).toBe(true);
  expect(plan.pictures.map(p => p.title)).toEqual(['New']);
});
