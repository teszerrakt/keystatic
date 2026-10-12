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
  // Files the save writes besides the page's own file, and the page's text.
  saving: string[];
  pageText: string;
  isLive: (path: string) => boolean;
}): PublishNowPlan {
  const isPage = (p: PageChange) =>
    p.collection === input.page.collection && p.slug === input.page.slug;

  const changed = new Map(input.files.map(f => [f.path, f.kind]));
  for (const path of input.saving) {
    const live = input.isLive(path);
    // A page rewrites every picture it shows; one already live is unchanged.
    if (changed.has(path) || (live && PICTURE.test(path))) continue;
    changed.set(path, live ? 'changed' : 'added');
  }
  const allowed =
    input.pages.every(isPage) &&
    [...changed.keys()].every(
      path => PICTURE.test(path) && input.pageText.includes(fileName(path))
    );

  return {
    allowed,
    page: input.pages.find(isPage)?.kind === 'added' ? 'added' : 'changed',
    pictures: [...changed]
      .filter(([path]) => PICTURE.test(path))
      .map(([path, kind]) => ({ path, title: humanize(fileName(path)), kind })),
  };
}
