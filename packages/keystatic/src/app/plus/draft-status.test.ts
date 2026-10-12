/** @vitest-environment node */
import { expect, test } from 'vitest';
import { Draft, draftStatus, draftTitle, savedAgo } from './draft-status';

const draft = (over: Partial<Draft> = {}): Draft => ({
  name: 'draft/void-a-bill',
  refId: 'REF_1',
  author: 'sari',
  savedAt: undefined,
  build: 'building',
  checks: 'building',
  alias: 'draft-void-a-bill',
  failureUrl: undefined,
  pr: undefined,
  ...over,
});

test('a draft GitHub has not listed yet is building', () => {
  expect(draftStatus(undefined)).toBe('building');
});

test('the preview build sets the status before publishing', () => {
  expect(draftStatus(draft({ build: 'none' }))).toBe('building');
  expect(draftStatus(draft({ build: 'ready' }))).toBe('ready');
  expect(draftStatus(draft({ build: 'failed' }))).toBe('failed');
});

test('a queued publish is publishing until a check fails', () => {
  const pr = { id: 'PR_1', number: 1, queued: true };
  expect(draftStatus(draft({ build: 'ready', pr }))).toBe('publishing');
  expect(draftStatus(draft({ build: 'ready', checks: 'failed', pr }))).toBe(
    'failed'
  );
});

test('draft names read as words', () => {
  expect(draftTitle('draft/void-a-bill', 'draft/')).toBe('Void a bill');
  expect(draftTitle('draft/langkah-ppn-2', 'draft/')).toBe('Langkah ppn 2');
  expect(draftTitle('fix/x', 'draft/')).toBe('Fix x');
});

test('save times round down to the unit a writer reads', () => {
  const now = Date.parse('2026-10-12T10:00:00Z');
  expect(savedAgo(undefined, now)).toBe('Saved just now');
  expect(savedAgo('2026-10-12T09:59:30Z', now)).toBe('Saved just now');
  expect(savedAgo('2026-10-12T09:58:00Z', now)).toBe('Saved 2 min ago');
  expect(savedAgo('2026-10-12T07:00:00Z', now)).toBe('Saved 3 h ago');
  expect(savedAgo('2026-10-11T09:00:00Z', now)).toBe('Saved 1 day ago');
});
