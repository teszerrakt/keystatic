import { EditorView } from 'prosemirror-view';
import { createContext, ReactElement, useContext } from 'react';

import { fixPath } from '../../../../app/path-utils';
import { getSrcPrefix } from '../../image/getSrcPrefix';
import { EditorConfig } from '../config';

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
  Picker: (props: {
    directory: string;
    // Set when "Change image" opened the picker.
    current?: { path: string; alt: string; title: string };
    onPick(image: PickedImage): void;
  }) => ReactElement;
};

export const ImageLibraryContext = createContext<ImageLibrary | null>(null);

type LibraryConfig = { directory: string; publicPath: string };

function libraryConfig(config: EditorConfig): LibraryConfig | undefined {
  const image = config.image;
  return typeof image?.directory === 'string' &&
    typeof image.publicPath === 'string'
    ? { directory: fixPath(image.directory), publicPath: image.publicPath }
    : undefined;
}

// The library needs a public path: without one a src cannot name another folder.
export function useImageLibrary(config: EditorConfig) {
  const library = useContext(ImageLibraryContext);
  const image = libraryConfig(config);
  return library && image ? { library, ...image } : null;
}

// Node `filename` of a library picture: its path under the image directory.
export function libraryFilename(config: EditorConfig, src: string) {
  const image = libraryConfig(config);
  if (!image) return;
  const base = getSrcPrefix(image.publicPath, undefined);
  return src.startsWith(base) ? src.slice(base.length) : undefined;
}

export function libraryImageSrc(config: EditorConfig, filename: string) {
  const image = libraryConfig(config);
  return `${getSrcPrefix(image?.publicPath, undefined)}${filename}`;
}

export function libraryImagePath(config: EditorConfig, filename: string) {
  return `${libraryConfig(config)?.directory}/${filename}`;
}

export function libraryFilenameOf(config: EditorConfig, path: string) {
  const dir = libraryConfig(config)?.directory;
  return dir && path.startsWith(`${dir}/`) ? path.slice(dir.length + 1) : path;
}

// What `useEditorView` hands every node view and plugin.
export function viewImageLibrary(view: EditorView) {
  return (view.props as { imageLibrary?: ImageLibrary }).imageLibrary;
}

// A picture added by drop, paste or the file chooser joins the library when
// there is one, so it never lands in the page's own folder.
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

export function libraryImageAttrs(config: EditorConfig, image: PickedImage) {
  return {
    src: image.bytes,
    filename: libraryFilenameOf(config, image.path),
    fromLibrary: true,
    alt: image.alt,
    title: image.title,
  };
}
