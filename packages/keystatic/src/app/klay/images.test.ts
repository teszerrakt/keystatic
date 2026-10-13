/** @vitest-environment node */
import { expect, test } from 'vitest';
import {
  clashMessage,
  emptyListText,
  formatSize,
  imageChanges,
  freePath,
  imageUsage,
  libraryImages,
  parseAltTexts,
  planUploads,
  safeName,
  serializeAltTexts,
  uploadProblem,
  usageLabel,
  usedOnPagesText,
  withAlt,
} from './images';

const dir = 'src/assets/images/docs';

test('the library lists pictures with what the draft did; removed ones leave', () => {
  const current = new Map([
    [`${dir}/shared`, { sha: 't', type: 'tree' }],
    [`${dir}/shared/new.png`, { sha: '1' }],
    [`${dir}/create-a-bill/1.webp`, { sha: '2b' }],
    [`${dir}/create-a-bill/2.webp`, { sha: '3' }],
    [`${dir}/alt-text.json`, { sha: '4' }],
    ['src/assets/logo.png', { sha: '5' }],
  ]);
  const base = new Map([
    [`${dir}/create-a-bill/1.webp`, { sha: '2' }],
    [`${dir}/create-a-bill/2.webp`, { sha: '3' }],
    [`${dir}/old.jpg`, { sha: '6' }],
  ]);
  expect(libraryImages(dir, current, base).map(i => [i.path, i.draft])).toEqual(
    [
      [`${dir}/shared/new.png`, 'new'],
      [`${dir}/create-a-bill/1.webp`, 'replaced'],
      [`${dir}/create-a-bill/2.webp`, undefined],
    ]
  );
  expect(libraryImages(dir, current).every(i => !i.draft)).toBe(true);
});

test('upload problems name every reason', () => {
  expect(uploadProblem({ name: 'a.jpg', size: 1000 })).toBeNull();
  expect(
    uploadProblem({ name: 'drone-raw.tiff', size: 18 * 1024 * 1024 })
  ).toBe(
    "Not uploaded. It is 18 MB, over the 5 MB limit, and TIFF isn't supported. Save it as JPG or WebP."
  );
  expect(uploadProblem({ name: 'big.png', size: 6.2 * 1024 * 1024 })).toBe(
    'Not uploaded. It is 6.2 MB, over the 5 MB limit.'
  );
  expect(uploadProblem({ name: 'anim.gif', size: 10 })).toBe(
    "Not uploaded. GIF isn't supported. Save it as JPG, PNG, WebP or SVG."
  );
});

test('sizes, usage and clash copy', () => {
  expect(formatSize(6 * 1024)).toBe('6 KB');
  expect(formatSize(412 * 1024)).toBe('412 KB');
  expect(formatSize(1.2 * 1024 * 1024)).toBe('1.2 MB');
  expect(usageLabel(0)).toBe('Not used');
  expect(usageLabel(1)).toBe('On 1 page');
  expect(usageLabel(2)).toBe('On 2 pages');
  expect(clashMessage(['Home'])).toBe(
    'An image with this name already exists. Home uses it.'
  );
  expect(clashMessage(['Home', 'About'])).toBe(
    'An image with this name already exists. 2 pages use it.'
  );
});

test('a taken name gets a number; # and ? become dashes', () => {
  const taken = new Set(['a/photo.jpg', 'a/photo-2.jpg']);
  expect(freePath('a/photo.jpg', p => taken.has(p))).toBe('a/photo-3.jpg');
  expect(freePath('a/new.jpg', p => taken.has(p))).toBe('a/new.jpg');
  expect(safeName('My Photo (1).JPG')).toBe('My Photo (1).JPG');
  expect(safeName('team#2?.png')).toBe('team-2-.png');
});

test('uploads go to shared/; a clash waits; two new files keep both', () => {
  const exists = (p: string) => p === `${dir}/shared/hero.jpg`;
  expect(
    planUploads(
      [
        { name: 'hero.jpg', size: 10 },
        { name: 'a.png', size: 10 },
        { name: 'a.png', size: 20 },
        { name: 'x.tiff', size: 10 },
      ],
      dir,
      exists
    )
  ).toEqual([
    { status: 'clash', path: `${dir}/shared/hero.jpg` },
    { status: 'ready', path: `${dir}/shared/a.png` },
    { status: 'ready', path: `${dir}/shared/a-2.png` },
    {
      status: 'refused',
      message:
        "Not uploaded. TIFF isn't supported. Save it as JPG, PNG, WebP or SVG.",
    },
  ]);
});

test('usage resolves each page’s picture paths', () => {
  const en = {
    filePath: 'src/content/docs/help/create-a-bill.md',
    slug: 'create-a-bill',
    collection: 'docsEn',
    text: '![a](../../../assets/images/docs/shared/hero%20one.png)\n![b](https://x.test/b.png)',
  };
  const id = {
    filePath: 'src/content/docs/id/help/create-a-bill.md',
    slug: 'create-a-bill',
    collection: 'docsId',
    text: '![a](../../../../assets/images/docs/shared/hero%20one.png)',
  };
  const usage = imageUsage([en, id]);
  expect([...usage.keys()]).toEqual([`${dir}/shared/hero one.png`]);
  expect(usage.get(`${dir}/shared/hero one.png`)).toEqual([en, id]);
});

test('alt text file round-trips, sorted, without blanks', () => {
  const text = serializeAltTexts({
    'b.png': 'Bee',
    'a.png': ' Ay ',
    'c.png': '',
  });
  expect(text).toBe('{\n  "a.png": "Ay",\n  "b.png": "Bee"\n}\n');
  expect(parseAltTexts(text)).toEqual({ 'a.png': 'Ay', 'b.png': 'Bee' });
  expect(parseAltTexts('not json')).toEqual({});
  expect(parseAltTexts(undefined)).toEqual({});
});

test('an alt text save merges into the file as it is now', () => {
  const now = serializeAltTexts({ 'shared/a.png': 'A', 'shared/b.png': 'B' });
  expect(parseAltTexts(withAlt(now, 'shared/b.png', 'Bee'))).toEqual({
    'shared/a.png': 'A',
    'shared/b.png': 'Bee',
  });
  expect(withAlt(undefined, 'shared/a.png', 'A')).toBe(
    '{\n  "shared/a.png": "A"\n}\n'
  );
});

test('a picture with parentheses in its name is counted as used', () => {
  const page = {
    filePath: 'src/content/docs/help/a.md',
    slug: 'a',
    collection: 'docsEn',
    text: '![p](../../../assets/images/docs/shared/My%20Photo%20(1).JPG)',
  };
  expect([...imageUsage([page]).keys()]).toEqual([
    `${dir}/shared/My Photo (1).JPG`,
  ]);
});

test('the sidebar counts what the Changed view lists', () => {
  const current = new Map([
    [`${dir}/shared/new.png`, { sha: '1' }],
    [`${dir}/shared/hero.png`, { sha: '2b' }],
  ]);
  const base = new Map([
    [`${dir}/shared/hero.png`, { sha: '2' }],
    [`${dir}/shared/old.png`, { sha: '3' }],
  ]);
  const changed = libraryImages(dir, current, base).filter(i => i.draft);
  expect(imageChanges(dir, current, base)).toHaveLength(changed.length);
  expect(changed.map(i => i.name)).toEqual(['new.png', 'hero.png']);
});

test('the remove warning is singular for one page', () => {
  expect(usedOnPagesText(1)).toEqual({
    count: '1 page uses this image.',
    effect:
      "It shows a broken picture after you publish, and it's listed when you review the draft.",
    keep: 'that page',
  });
  expect(usedOnPagesText(2).count).toBe('2 pages use this image.');
  expect(usedOnPagesText(2).keep).toBe('those pages');
});

test('an empty list says why', () => {
  expect(emptyListText({ changedView: false, filtered: false })).toBe(
    'No images yet.'
  );
  expect(emptyListText({ changedView: false, filtered: true })).toBe(
    'No images match.'
  );
  expect(emptyListText({ changedView: true, filtered: false })).toBe(
    'No images changed in this draft yet.'
  );
});
