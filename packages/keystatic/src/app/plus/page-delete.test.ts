/** @vitest-environment node */
import { expect, test } from 'vitest';
import {
  collectionsToDelete,
  deleteMessage,
  filesToDelete,
  slugConfirmed,
} from './page-delete';

test('the slug must be typed exactly; spaces around it are fine', () => {
  expect(slugConfirmed('', 'add-a-vendor')).toBe(false);
  expect(slugConfirmed('add-a-vendo', 'add-a-vendor')).toBe(false);
  expect(slugConfirmed('Add-a-vendor', 'add-a-vendor')).toBe(false);
  expect(slugConfirmed('Add a vendor', 'add-a-vendor')).toBe(false);
  expect(slugConfirmed(' add-a-vendor ', 'add-a-vendor')).toBe(true);
});

test('every language deletes each copy; only this one deletes the one in view', () => {
  const present = ['docsEn', 'docsId'];
  expect(
    collectionsToDelete({ present, collection: 'docsId', scope: 'all' })
  ).toEqual(['docsEn', 'docsId']);
  expect(
    collectionsToDelete({ present, collection: 'docsId', scope: 'one' })
  ).toEqual(['docsId']);
  expect(
    collectionsToDelete({
      present: ['docsEn'],
      collection: 'docsEn',
      scope: 'all',
    })
  ).toEqual(['docsEn']);
  expect(
    collectionsToDelete({
      present: ['docsEn'],
      collection: 'docsId',
      scope: 'one',
    })
  ).toEqual([]);
});

test('files: the entry file and its folder, never a page whose slug starts the same', () => {
  const paths = [
    'src/content/docs/help/add-a-vendor.md',
    'src/content/docs/help/add-a-vendor-2.md',
    'src/content/docs/help/add-a-vendor/diagram.png',
    'src/content/docs/help/other.md',
    'src/content/docs/id/help/add-a-vendor.md',
    'src/content/docs/id/help/add-a-vendors.md',
    'src/content/docs/help-old/add-a-vendor.md',
  ];
  expect(
    filesToDelete({
      paths,
      dirs: ['src/content/docs/help', 'src/content/docs/id/help'],
      slug: 'add-a-vendor',
    })
  ).toEqual([
    'src/content/docs/help/add-a-vendor.md',
    'src/content/docs/help/add-a-vendor/diagram.png',
    'src/content/docs/id/help/add-a-vendor.md',
  ]);
  expect(
    filesToDelete({
      paths,
      dirs: ['src/content/docs/id/help'],
      slug: 'add-a-vendor',
    })
  ).toEqual(['src/content/docs/id/help/add-a-vendor.md']);
});

test('the headline keeps the "Delete <path>" shape; more files go in the body', () => {
  expect(deleteMessage(['a/x.md'])).toEqual({ headline: 'Delete a/x.md' });
  expect(deleteMessage(['a/x.md', 'b/x.md'])).toEqual({
    headline: 'Delete a/x.md',
    body: 'Delete b/x.md',
  });
});
