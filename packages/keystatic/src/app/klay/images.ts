import { linkTargets, PICTURE, resolveFile } from './review';

// New uploads land here, under the image directory; per-page folders stay
// with their pages (D1).
export const SHARED = 'shared';
export const MAX_BYTES = 5 * 1024 * 1024;
// Default alt text, keyed by path under the image directory (D3).
export const ALT_FILE = 'alt-text.json';

const TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};

export const ACCEPTED = 'image/jpeg,image/png,image/webp,image/svg+xml';

export function extension(name: string) {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

export const contentType = (name: string) => TYPES[extension(name)];

export function baseName(path: string) {
  return path.slice(path.lastIndexOf('/') + 1);
}

export type ImageDraftState = 'new' | 'replaced' | 'removed';

export type LibraryImage = {
  path: string;
  name: string;
  sha: string;
  // Removed images come from the live site, so the bytes are read there.
  draft: ImageDraftState | undefined;
};

type Entry = { sha: string; type?: string };

// Every picture under `dir`. With `base`, also those this draft removes.
export function libraryImages(
  dir: string,
  current: Map<string, Entry>,
  base?: Map<string, Entry>
): LibraryImage[] {
  const under = (path: string, e: Entry) =>
    e.type !== 'tree' && path.startsWith(`${dir}/`) && PICTURE.test(path);
  const out: LibraryImage[] = [];
  for (const [path, e] of current) {
    if (!under(path, e)) continue;
    const before = base?.get(path);
    out.push({
      path,
      name: baseName(path),
      sha: e.sha,
      draft: !base
        ? undefined
        : !before
        ? 'new'
        : before.sha !== e.sha
        ? 'replaced'
        : undefined,
    });
  }
  for (const [path, e] of base ?? []) {
    if (under(path, e) && !current.has(path)) {
      out.push({ path, name: baseName(path), sha: e.sha, draft: 'removed' });
    }
  }
  const rank = (i: LibraryImage) => (i.draft === 'new' ? 0 : 1);
  return out.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}

export function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1).replace(/\.0$/, '') : Math.round(mb)} MB`;
}

// "Not uploaded. It is 18 MB, over the 5 MB limit, and TIFF isn't supported. Save it as JPG or WebP."
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

// "An image with this name already exists. Home uses it."
export function clashMessage(pages: string[]) {
  const used =
    pages.length === 1
      ? ` ${pages[0]} uses it.`
      : pages.length > 1
      ? ` ${pages.length} pages use it.`
      : '';
  return `An image with this name already exists.${used}`;
}

export type PageFile = {
  filePath: string;
  text: string;
  slug: string;
  collection: string;
};

// Which pages show each picture, by the picture's repo path.
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

export function serializeAltTexts(alts: Record<string, string>) {
  const entries = Object.entries(alts)
    .map(([k, v]) => [k, v.trim()] as const)
    .filter(([, v]) => v)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(Object.fromEntries(entries), null, 2) + '\n';
}

// Characters a markdown link would trip over become dashes.
export function safeName(name: string) {
  return (
    name
      .replace(/[^\w.-]+/g, '-')
      .replace(/-+(\.[^.]*)?$/, '$1')
      .replace(/^-+/, '') || 'image'
  );
}

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
