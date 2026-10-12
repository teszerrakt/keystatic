import {
  ChangeKind,
  FileChange,
  humanize,
  PageChange,
  PICTURE,
} from './review';

// Read back from the pull request body.
export const publishNowNote =
  'Published from the docs editor with Publish now, without a preview.';

export const isPublishNow = (body: string | null | undefined) =>
  !!body?.includes(publishNowNote);

export type PublishNowPlan = {
  // False when the draft changes more than this page and its pictures (D2).
  allowed: boolean;
  page: ChangeKind;
  pictures: { path: string; title: string; kind: ChangeKind }[];
};

const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

export function publishNowPlan(input: {
  page: { collection: string; slug: string };
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
  const isPage = (p: PageChange) =>
    p.collection === input.page.collection && p.slug === input.page.slug;

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
    page: input.pages.find(isPage)?.kind === 'added' ? 'added' : 'changed',
    pictures: [...changed]
      .filter(([path]) => PICTURE.test(path))
      .map(([path, kind]) => ({ path, title: humanize(fileName(path)), kind })),
  };
}
