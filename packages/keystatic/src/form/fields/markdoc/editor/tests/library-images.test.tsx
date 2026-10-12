/** @vitest-environment jsdom */
import { expect, test } from 'vitest';
import { Node } from 'prosemirror-model';
import { format, parse } from '#markdoc';
import { markdocToProseMirror } from '../markdoc/parse';
import { proseMirrorToMarkdoc } from '../markdoc/serialize';
import { createEditorSchema } from '../schema';
import { editorOptionsToConfig } from '../../config';
import { libraryImageAttrs } from '../image-library';

const dir = 'src/assets/images/docs';
const schema = createEditorSchema(
  editorOptionsToConfig({
    image: { directory: dir, publicPath: '../../../assets/images/docs/' },
  }),
  {},
  false
);
const own = new Uint8Array([1, 2, 3]);

function load(markdoc: string, slug: string) {
  return markdocToProseMirror(
    parse(markdoc),
    schema,
    new Map(),
    new Map([[dir, new Map([['own.png', own]])]]),
    slug
  );
}

function save(doc: Node, slug: string) {
  const otherFiles = new Map<string, Map<string, Uint8Array>>();
  const text = format(
    proseMirrorToMarkdoc(doc, {
      extraFiles: new Map(),
      otherFiles,
      schema,
      slug,
    })
  );
  return { text, files: otherFiles.get(dir) ?? new Map() };
}

function images(doc: Node) {
  const out: Record<string, unknown>[] = [];
  doc.descendants(n => {
    if (n.type.name === 'image') out.push(n.attrs);
  });
  return out;
}

test('a picture outside the page folder is a library reference', () => {
  const doc = load(
    [
      '![Own](../../../assets/images/docs/page/own.png)',
      '',
      '![Hero](../../../assets/images/docs/shared/hero%20one.png "Caption")',
    ].join('\n'),
    'page'
  );
  expect(images(doc).map(a => [a.filename, a.fromLibrary, a.title])).toEqual([
    ['own.png', false, ''],
    ['shared/hero one.png', true, 'Caption'],
  ]);
  const { text, files } = save(doc, 'page');
  expect([...files.keys()]).toEqual(['own.png']);
  expect(text).toContain(
    '![Hero](../../../assets/images/docs/shared/hero%20one.png "Caption")'
  );
});

test('a reference keeps its path when the page is renamed', () => {
  const doc = load(
    '![Hero](../../../assets/images/docs/shared/hero.png)',
    'page'
  );
  expect(save(doc, 'renamed').text).toContain(
    '../../../assets/images/docs/shared/hero.png'
  );
});

test('an inserted library picture stores a path, never the bytes', () => {
  const node = schema.schema.nodes.image.create(
    libraryImageAttrs(schema.config, {
      path: `${dir}/shared/promo.jpg`,
      bytes: new Uint8Array([9]),
      alt: 'October promo',
      title: '',
    })
  );
  const doc = schema.nodes.doc.create(
    {},
    schema.nodes.paragraph.create({}, node)
  );
  const { text, files } = save(doc, 'page');
  expect(files.size).toBe(0);
  expect(text.trim()).toBe(
    '![October promo](../../../assets/images/docs/shared/promo.jpg)'
  );
});
