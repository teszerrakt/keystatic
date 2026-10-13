import type { Node } from 'prosemirror-model';
import { EditorView } from 'prosemirror-view';
import { createContext, useContext } from 'react';

import { getSrcPrefix } from '../../image/getSrcPrefix';
import { getUploadedFileObject } from '../../image/ui';
import { EditorConfig, libraryConfig } from '../config';
import type { EditorSchema } from './schema';

// Paths are repo paths under the configured image directory.
export type PickedImage = {
  path: string;
  bytes: Uint8Array;
  alt: string;
  title: string;
};

// Pictures kept once under the image directory and shown on many pages. A
// page stores a library picture as a src, never as a file in its own folder.
export type ImageLibrary = {
  load(path: string): Promise<Uint8Array>;
  // Checks a new picture and queues it for the page's next save; null when
  // it was refused (the library says why).
  stage(file: File): Promise<{ path: string; bytes: Uint8Array } | null>;
  // The Insert image dialog; `current` is set by "Change image".
  pick(options: {
    current?: { path: string; alt: string; title: string };
  }): Promise<PickedImage | null>;
};

export const ImageLibraryContext = createContext<ImageLibrary | null>(null);

export function useImageLibrary(config: EditorConfig) {
  const library = useContext(ImageLibraryContext);
  return library && libraryConfig(config) ? library : null;
}

const srcBase = (config: EditorConfig) =>
  getSrcPrefix(libraryConfig(config)?.publicPath, undefined);

// A src under the image directory but outside the page's folder
// (`pagePrefix`); a missing file in that folder stays as text.
export function libraryImageNode(
  schema: EditorSchema,
  src: string,
  pagePrefix: string,
  alt: string | undefined,
  title: string | null | undefined
) {
  const base = libraryConfig(schema.config) && srcBase(schema.config);
  if (base && pagePrefix !== base && src.startsWith(pagePrefix)) return;
  const filename = base && src.startsWith(base) && src.slice(base.length);
  if (!filename || !schema.nodes.image) return;
  return schema.nodes.image.createChecked({
    src: new Uint8Array(),
    alt,
    title,
    filename,
    fromLibrary: true,
  });
}

// The encoded src of a library picture node; undefined for any other image.
export function librarySrc(config: EditorConfig, node: Node) {
  if (!node.attrs.fromLibrary) return;
  return encodeURI(`${srcBase(config)}${node.attrs.filename}`);
}

export function libraryImagePath(config: EditorConfig, filename: string) {
  return `${libraryConfig(config)?.directory}/${filename}`;
}

function libraryFilenameOf(config: EditorConfig, path: string) {
  const dir = libraryConfig(config)?.directory;
  return dir && path.startsWith(`${dir}/`) ? path.slice(dir.length + 1) : path;
}

// What `useEditorView` hands every node view and plugin.
export function viewImageLibrary(view: EditorView) {
  const props = view.props as { imageLibrary?: ImageLibrary | null };
  return props.imageLibrary ?? null;
}

// With a library, a new picture never lands in the page's own folder.
export async function newImageAttrs(
  file: File,
  config: EditorConfig,
  view: EditorView
) {
  const library = viewImageLibrary(view);
  if (library && libraryConfig(config)) {
    const staged = await library.stage(file);
    return (
      staged && {
        src: staged.bytes,
        filename: libraryFilenameOf(config, staged.path),
        fromLibrary: true,
      }
    );
  }
  return {
    src: new Uint8Array(await file.arrayBuffer()),
    filename: config.image!.transformFilename(file.name),
  };
}

// Without a library provider (a library site outside drafts mode, or a
// singleton) a chosen file goes to the page's folder, so it is saved.
export function chosenFileAttrs(
  config: EditorConfig,
  attrs: { fromLibrary?: boolean },
  file: { name: string; bytes: Uint8Array }
) {
  return attrs.fromLibrary
    ? {
        src: file.bytes,
        filename: config.image!.transformFilename(file.name),
        fromLibrary: false,
      }
    : { src: file.bytes };
}

export function libraryImageAttrs(config: EditorConfig, image: PickedImage) {
  return {
    src: image.bytes,
    filename: libraryFilenameOf(config, image.path),
    fromLibrary: true,
    alt: image.alt,
    title: image.title,
  };
}

// The toolbar button and the insert menu: the Insert image dialog when there
// is a library, else the file chooser.
export async function chooseImageAttrs(config: EditorConfig, view: EditorView) {
  const library = viewImageLibrary(view);
  if (library && libraryConfig(config)) {
    const image = await library.pick({});
    return image && libraryImageAttrs(config, image);
  }
  const file = await getUploadedFileObject('image/*');
  return file ? newImageAttrs(file, config, view) : null;
}
