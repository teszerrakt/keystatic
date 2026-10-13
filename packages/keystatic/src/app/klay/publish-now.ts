import {
  ChangeKind,
  diffEntries,
  FileChange,
  humanize,
  PageChange,
} from './review';

export const PICTURE = /\.(png|jpe?g|gif|webp|svg|avif)$/i;

// Read back from the pull request body.
export const publishNowNote =
  'Published from the docs editor with Publish now, without a preview.';

export const isPublishNow = (body: string | null | undefined) =>
  !!body?.includes(publishNowNote);

export type PublishNowPlan = {
  // False when the draft changes more than this page and its pictures (D2).
  allowed: boolean;
  // This page, then its other language versions the draft changes.
  pages: { collection: string; kind: ChangeKind }[];
  pictures: { path: string; title: string; kind: ChangeKind }[];
};

type Entry = { sha: string; type?: string };
type Changed = Map<
  string,
  { added: Set<string>; changed: Set<string>; removed: Set<string> }
>;

// `dirs` are the collection folders: files there are pages, not files.
export function draftChanges(input: {
  collections: Changed;
  current: Map<string, Entry>;
  base: Map<string, Entry>;
  dirs: string[];
}) {
  const pages: PageChange[] = [];
  for (const [collection, c] of input.collections) {
    for (const slug of c.added) pages.push({ collection, slug, kind: 'added' });
    for (const slug of c.changed) {
      pages.push({ collection, slug, kind: 'changed' });
    }
    for (const slug of c.removed) {
      pages.push({ collection, slug, kind: 'removed' });
    }
  }
  const files = diffEntries(input.current, input.base).filter(
    f => !input.dirs.some(d => f.path.startsWith(`${d}/`))
  );
  return { pages, files };
}

const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

export function publishNowPlan(input: {
  page: { collection: string; slug: string };
  // Collections that hold one page's language versions under one slug.
  languages: string[];
  // What the open draft already changes against the live site.
  pages: PageChange[];
  files: FileChange[];
  // What the save itself changes against the live site, besides the page's
  // own file; then the page's text.
  saving: FileChange[];
  // Files the save deletes that were never live: no longer a change.
  dropped: string[];
  pageText: string;
}): PublishNowPlan {
  const { collection, slug } = input.page;
  const versions = input.languages.includes(collection)
    ? input.languages
    : [collection];
  // Ruled by the user: a page's other languages are the same page.
  const isPage = (p: PageChange) =>
    p.slug === slug && versions.includes(p.collection);
  const own = input.pages.find(
    p => p.collection === collection && p.slug === slug
  );

  const changed = new Map(input.files.map(f => [f.path, f.kind]));
  for (const path of input.dropped) changed.delete(path);
  for (const f of input.saving) {
    if (!changed.has(f.path)) changed.set(f.path, f.kind);
  }
  // The page's own save writes only pictures it shows or drops.
  const saved = new Set(input.saving.map(f => f.path));
  const allowed =
    input.pages.every(isPage) &&
    [...changed.keys()].every(
      path =>
        PICTURE.test(path) &&
        (saved.has(path) || input.pageText.includes(fileName(path)))
    );

  return {
    allowed,
    pages: [
      { collection, kind: own?.kind === 'added' ? 'added' : 'changed' },
      ...input.pages
        .filter(p => isPage(p) && p.collection !== collection)
        .map(p => ({ collection: p.collection, kind: p.kind })),
    ],
    pictures: [...changed]
      .filter(([path]) => PICTURE.test(path))
      .map(([path, kind]) => ({ path, title: humanize(fileName(path)), kind })),
  };
}
