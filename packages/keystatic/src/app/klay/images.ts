import { diffEntries, linkTargets, PICTURE, resolveFile } from './review';

// New uploads land here, under the image directory; per-page folders stay
// with their pages (D1).
export const SHARED = 'shared';
export const MAX_BYTES = 5 * 1024 * 1024;
// Default alt text, keyed by path under the image directory (D3).
export const ALT_FILE = 'alt-text.json';

const FORMATS = [
  { label: 'JPG', mime: 'image/jpeg', exts: ['jpg', 'jpeg'] },
  { label: 'PNG', mime: 'image/png', exts: ['png'] },
  { label: 'WebP', mime: 'image/webp', exts: ['webp'] },
  { label: 'SVG', mime: 'image/svg+xml', exts: ['svg'] },
];
const TYPES: Record<string, string> = Object.fromEntries(
  FORMATS.flatMap(f => f.exts.map(ext => [ext, f.mime]))
);

// For file choosers, so the system dialog offers only what uploads accept.
export const ACCEPTED = FORMATS.map(f => f.mime);
export const UPLOAD_HINT = `${FORMATS.map(f => f.label).join(', ')} · up to ${
  MAX_BYTES / 1024 / 1024
} MB`;

export function extension(name: string) {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

export const contentType = (name: string) => TYPES[extension(name)];

export function baseName(path: string) {
  return path.slice(path.lastIndexOf('/') + 1);
}

export const stem = (name: string) => name.replace(/\.[^.]+$/, '');

export const altKey = (dir: string, path: string) => path.slice(dir.length + 1);

export type LibraryImage = {
  path: string;
  name: string;
  sha: string;
  // Added or replaced in this draft
  draft: 'new' | 'replaced' | undefined;
};

type Entry = { sha: string; type?: string };

const isImageIn = (dir: string, path: string) =>
  path.startsWith(`${dir}/`) && PICTURE.test(path);

// Pictures under `dir` that a draft adds or replaces; removed ones leave
// the list and the count.
export function imageChanges(
  dir: string,
  current: Map<string, Entry>,
  base: Map<string, Entry>
) {
  return diffEntries(current, base).filter(
    c => c.kind !== 'removed' && isImageIn(dir, c.path)
  );
}

// Every picture under `dir`; with `base`, with what this draft did to it.
export function libraryImages(
  dir: string,
  current: Map<string, Entry>,
  base?: Map<string, Entry>
): LibraryImage[] {
  const changes = new Map(
    (base ? imageChanges(dir, current, base) : []).map(c => [c.path, c.kind])
  );
  return [...current]
    .filter(([path, e]) => e.type !== 'tree' && isImageIn(dir, path))
    .map(
      ([path, e]): LibraryImage => ({
        path,
        name: baseName(path),
        sha: e.sha,
        draft: changes.has(path)
          ? changes.get(path) === 'added'
            ? 'new'
            : 'replaced'
          : undefined,
      })
    )
    .sort(
      (a, b) =>
        Number(a.draft !== 'new') - Number(b.draft !== 'new') ||
        a.name.localeCompare(b.name)
    );
}

export function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1).replace(/\.0$/, '') : Math.round(mb)} MB`;
}

export function uploadProblem(file: { name: string; size: number }) {
  const ext = extension(file.name);
  const tooBig = file.size > MAX_BYTES;
  const badType = !TYPES[ext];
  if (!tooBig && !badType) return null;
  const type = `${ext ? ext.toUpperCase() : 'This file type'} isn't supported`;
  const size = `It is ${formatSize(file.size)}, over the 5 MB limit`;
  const reason =
    tooBig && badType
      ? `${size}, and ${type}. Save it as JPG or WebP.`
      : tooBig
      ? `${size}.`
      : `${type}. Save it as JPG, PNG, WebP or SVG.`;
  return `Not uploaded. ${reason}`;
}

// `photo.jpg` taken: `photo-2.jpg`.
export function freePath(path: string, taken: (path: string) => boolean) {
  if (!taken(path)) return path;
  const dot = path.lastIndexOf('.');
  const stem = dot > path.lastIndexOf('/') ? path.slice(0, dot) : path;
  const ext = stem === path ? '' : path.slice(dot);
  for (let n = 2; ; n++) {
    const next = `${stem}-${n}${ext}`;
    if (!taken(next)) return next;
  }
}

export function usageLabel(pages: number) {
  return pages === 0
    ? 'Not used'
    : pages === 1
    ? 'On 1 page'
    : `On ${pages} pages`;
}

export function clashMessage(pages: string[]) {
  const used =
    pages.length === 1
      ? ` ${pages[0]} uses it.`
      : pages.length > 1
      ? ` ${pages.length} pages use it.`
      : '';
  return `An image with this name already exists.${used}`;
}

// The remove dialog's warning, singular for one page.
export function usedOnPagesText(pages: number) {
  return pages === 1
    ? {
        count: '1 page uses this image.',
        effect:
          "It shows a broken picture after you publish, and it's listed when you review the draft.",
        keep: 'that page',
      }
    : {
        count: `${pages} pages use this image.`,
        effect:
          "They show a broken picture after you publish, and they're listed when you review the draft.",
        keep: 'those pages',
      };
}

export function emptyListText(input: {
  changedView: boolean;
  filtered: boolean;
}) {
  return input.changedView
    ? 'No images changed in this draft yet.'
    : input.filtered
    ? 'No images match.'
    : 'No images yet.';
}

export type PageFile = {
  filePath: string;
  text: string;
  slug: string;
  collection: string;
};

export function imageUsage(pages: PageFile[]) {
  const out = new Map<string, PageFile[]>();
  for (const page of pages) {
    for (const target of linkTargets(page.text)) {
      if (!PICTURE.test(target) || target.startsWith('/')) continue;
      let decoded = target;
      try {
        decoded = decodeURI(target);
      } catch {}
      const path = resolveFile(page.filePath, decoded);
      const list = out.get(path) ?? [];
      if (!list.includes(page)) out.set(path, [...list, page]);
    }
  }
  return out;
}

export function parseAltTexts(
  text: string | undefined
): Record<string, string> {
  if (!text) return {};
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(
          Object.entries(value).filter(
            (e): e is [string, string] => typeof e[1] === 'string'
          )
        )
      : {};
  } catch {
    return {};
  }
}

// Merges one default into the alt text file as it is now.
export function withAlt(text: string | undefined, key: string, alt: string) {
  return serializeAltTexts({ ...parseAltTexts(text), [key]: alt });
}

export function serializeAltTexts(alts: Record<string, string>) {
  const entries = Object.entries(alts)
    .map(([k, v]) => [k, v.trim()] as const)
    .filter(([, v]) => v)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(Object.fromEntries(entries), null, 2) + '\n';
}

// The stored src is encodeURI'd, which leaves `#` and `?`: in a file name
// they would cut the src short.
export const safeName = (name: string) => name.replace(/[#?]/g, '-');

export type UploadPlan =
  | { status: 'refused'; message: string }
  | { status: 'clash' | 'ready'; path: string };

// A clash waits for the writer; two new files with one name keep both.
export function planUploads(
  files: { name: string; size: number }[],
  dir: string,
  exists: (path: string) => boolean
): UploadPlan[] {
  const claimed = new Set<string>();
  return files.map((f): UploadPlan => {
    const message = uploadProblem(f);
    if (message) return { status: 'refused', message };
    const path = `${dir}/${SHARED}/${safeName(f.name)}`;
    if (exists(path)) return { status: 'clash', path };
    const free = freePath(path, p => claimed.has(p) || exists(p));
    claimed.add(free);
    return { status: 'ready', path: free };
  });
}
