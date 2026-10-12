/** @vitest-environment node */
import { expect, test } from 'vitest';

import {
  frontmatterValue,
  insertAt,
  moveItem,
  newSectionId,
  OrderRow,
  parseSections,
  placeOrders,
  sectionLabel,
  sectionOptions,
  serializeSections,
  sortRows,
  withFrontmatterValue,
} from './menu-sections';

const EN = 'English';
const ID = 'Bahasa Indonesia';

test('parseSections reads ids and labels, skipping junk and repeats', () => {
  const text = JSON.stringify({
    sections: [
      { id: 'ledger', label: { [EN]: 'Ledger', [ID]: 'Pembukuan' } },
      { id: 'tax', label: { [EN]: 'Tax', [ID]: '  ' } },
      { id: 'ledger', label: { [EN]: 'Again' } },
      { label: { [EN]: 'No id' } },
      'nonsense',
    ],
  });
  expect(parseSections(text)).toEqual([
    { id: 'ledger', label: { [EN]: 'Ledger', [ID]: 'Pembukuan' } },
    { id: 'tax', label: { [EN]: 'Tax' } },
  ]);
});

test('parseSections is empty for a missing or broken file', () => {
  expect(parseSections(undefined)).toEqual([]);
  expect(parseSections('{')).toEqual([]);
  expect(parseSections('{"sections": 3}')).toEqual([]);
});

test('serializeSections writes configured languages first and drops empties', () => {
  const text = serializeSections(
    [
      {
        id: 'bank',
        label: {
          Deutsch: 'Bank',
          [ID]: 'Bank & kas',
          [EN]: 'Bank & cash',
          Other: '',
        },
      },
    ],
    [EN, ID]
  );
  expect(text).toBe(
    `{
  "sections": [
    {
      "id": "bank",
      "label": {
        "English": "Bank & cash",
        "Bahasa Indonesia": "Bank & kas",
        "Deutsch": "Bank"
      }
    }
  ]
}
`
  );
  expect(parseSections(text)[0].label[ID]).toBe('Bank & kas');
});

test('an empty translation shows the main language name', () => {
  const s = { id: 'tax', label: { [EN]: 'Tax' } };
  expect(sectionLabel(s, ID, EN)).toBe('Tax');
  expect(sectionLabel({ id: 'tax', label: {} }, ID, EN)).toBe('tax');
  expect(sectionOptions([s], EN)).toEqual([{ value: 'tax', label: 'Tax' }]);
});

test('newSectionId slugs the name and avoids taken ids', () => {
  expect(newSectionId('Bank & cash', new Set())).toBe('bank-cash');
  expect(newSectionId('Bank & cash', new Set(['bank-cash']))).toBe(
    'bank-cash-2'
  );
  expect(newSectionId('Pajak Pertambahan Nilai (PPN)', new Set())).toBe(
    'pajak-pertambahan-nilai-ppn'
  );
  expect(newSectionId('Café', new Set())).toBe('cafe');
  expect(newSectionId('!!!', new Set())).toBe('section');
});

test('moveItem and insertAt clamp to the list', () => {
  expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
  expect(moveItem(['a', 'b', 'c'], 2, -4)).toEqual(['c', 'a', 'b']);
  expect(moveItem(['a', 'b'], 5, 0)).toEqual(['a', 'b']);
  expect(insertAt(['a', 'b'], 'x', 1)).toEqual(['a', 'x', 'b']);
  expect(insertAt(['a', 'b'], 'x', 9)).toEqual(['a', 'b', 'x']);
});

test('sortRows matches the site menu: order, then title', () => {
  const rows = [
    { title: 'Tax settings', order: 100 },
    { title: 'Hello', order: 1 },
    { title: 'Create a bill', order: 100 },
  ];
  expect(sortRows(rows).map(r => r.title)).toEqual([
    'Hello',
    'Create a bill',
    'Tax settings',
  ]);
});

const page = (
  key: string,
  order: number | undefined,
  title = key
): OrderRow => ({
  key,
  title,
  order,
});

test('placeOrders gives a new page a free number between its neighbours', () => {
  const rows = [page('hello', 1), page('new', undefined), page('bill', 100)];
  expect(placeOrders(rows, 'new')).toEqual(new Map([['new', 50]]));
});

test('placeOrders puts a page first and last without touching others', () => {
  expect(placeOrders([page('new', undefined), page('a', 1)], 'new')).toEqual(
    new Map([['new', 0]])
  );
  expect(placeOrders([page('a', 100), page('new', undefined)], 'new')).toEqual(
    new Map([['new', 110]])
  );
  expect(placeOrders([page('new', undefined)], 'new')).toEqual(
    new Map([['new', 10]])
  );
});

test('placeOrders renumbers the section when no number fits', () => {
  const rows = [
    page('hello', 1, 'Hello'),
    page('bill', 100, 'Create a bill'),
    page('new', undefined, 'Add a vendor'),
    page('tax', 100, 'Tax settings'),
  ];
  expect(placeOrders(rows, 'new')).toEqual(
    new Map([
      ['hello', 10],
      ['bill', 20],
      ['new', 30],
      ['tax', 40],
    ])
  );
});

test('placeOrders uses the title tie-break when it already gives the order', () => {
  const rows = [
    page('a', 100, 'Alpha'),
    page('new', undefined, 'Beta'),
    page('c', 100, 'Gamma'),
  ];
  // No number between 100 and 100, but 100 itself sorts Beta between them.
  expect(placeOrders(rows, 'new')).toEqual(new Map([['new', 100]]));
  expect(
    placeOrders([page('a', 100, 'Alpha'), page('b', 100, 'Beta')], 'b')
  ).toEqual(new Map());
});

test('placeOrders leaves a page that has not moved alone', () => {
  const rows = [page('hello', 1), page('bill', 100), page('tax', 200)];
  expect(placeOrders(rows, 'bill')).toEqual(new Map());
});

test('placeOrders moves an existing page past its old neighbour', () => {
  const rows = [page('hello', 1), page('tax', 200), page('bill', 100)];
  expect(placeOrders(rows, 'bill')).toEqual(new Map([['bill', 210]]));
});

const PAGE = `---
title: Create a bill
section: payable
sidebar:
  order: 100
---
A bill is money you owe.

---
Not frontmatter.
`;

test('frontmatterValue reads a nested key', () => {
  expect(frontmatterValue(PAGE, ['sidebar', 'order'])).toBe(100);
  expect(frontmatterValue(PAGE, ['section'])).toBe('payable');
  expect(frontmatterValue('no frontmatter', ['section'])).toBeUndefined();
});

test('withFrontmatterValue changes one key and keeps the body', () => {
  const out = withFrontmatterValue(PAGE, ['sidebar', 'order'], 20);
  expect(out).toBe(`---
title: Create a bill
section: payable
sidebar:
  order: 20
---
A bill is money you owe.

---
Not frontmatter.
`);
});

test('withFrontmatterValue adds a missing parent key', () => {
  const out = withFrontmatterValue(
    '---\ntitle: Hello\n---\nBody',
    ['sidebar', 'order'],
    30
  );
  expect(out).toBe('---\ntitle: Hello\nsidebar:\n  order: 30\n---\nBody');
});
