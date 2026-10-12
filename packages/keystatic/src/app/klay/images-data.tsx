import { useEffect, useMemo, useState } from 'react';
import { base64Encode } from '#base64';

import { Config } from '../../config';
import { useConfig } from '../shell/context';
import {
  useBranches,
  useCurrentBranch,
  useRepoInfo,
  useTree,
} from '../shell/data';
import { fetchBlob } from '../useItemData';
import { getEntriesInCollectionWithTreeKey } from '../utils';
import { useCommitToDraft } from './draft-commit';
import { useNewDraftName } from './drafts';
import {
  ALT_FILE,
  imageUsage,
  LibraryImage,
  libraryImages,
  PageFile,
  parseAltTexts,
} from './images';
import { useLanguages } from './pages-data';
import { frontmatterTitle, humanize } from './review';
import { pageFile } from './review-data';

// The image directory of the pages' content field. A markdoc field lists its
// image directory after its components' directories.
export function imageDirectory(config: Config, collection: string | undefined) {
  const schema = collection ? config.collections?.[collection]?.schema : null;
  for (const field of Object.values(schema ?? {})) {
    if (field.kind === 'form' && field.formKind === 'content') {
      const dirs = field.directories ?? [];
      if (dirs.length) return dirs[dirs.length - 1];
    }
  }
}

export function useImageDirectory() {
  const config = useConfig();
  const languages = useLanguages();
  return imageDirectory(config, languages[0]?.collection);
}

export type PageUse = {
  slug: string;
  title: string;
  collection: string;
  languages: string[];
};

export type Library =
  | { kind: 'loading' }
  | {
      kind: 'loaded';
      dir: string;
      images: LibraryImage[];
      onLive: boolean;
      // undefined while the pages are being read
      usage: Map<string, PageUse[]> | undefined;
      alts: Record<string, string>;
    };

const decoder = new TextDecoder();

export function useLibrary(): Library {
  const config = useConfig();
  const trees = useTree();
  const repoInfo = useRepoInfo();
  const branches = useBranches();
  const branch = useCurrentBranch();
  const languages = useLanguages();
  const dir = useImageDirectory();
  const [texts, setTexts] = useState(new Map<string, string>());
  const onLive = !repoInfo || branch === repoInfo.defaultBranch;

  const plan = useMemo(() => {
    if (trees.merged.kind !== 'loaded' || !dir) return null;
    const { current, default: base } = trees.merged.data;
    const pages = languages.flatMap(l =>
      getEntriesInCollectionWithTreeKey(config, l.collection, current.tree)
        .map(e => ({
          slug: e.slug,
          collection: l.collection,
          language: l.language,
          path: pageFile(current, l.dir, e.slug),
        }))
        .flatMap(p => (p.path ? [{ ...p, path: p.path }] : []))
    );
    const altPath = `${dir}/${ALT_FILE}`;
    const reads = [
      ...pages.map(p => p.path),
      ...(current.entries.has(altPath) ? [altPath] : []),
    ].map(path => ({ path, sha: current.entries.get(path)!.sha }));
    return {
      dir,
      altPath,
      pages,
      reads,
      current,
      images: libraryImages(
        dir,
        current.entries,
        onLive ? undefined : base.entries
      ),
    };
  }, [trees, dir, languages, config, onLive]);

  const head = branches.get(branch)?.commitSha ?? '';
  useEffect(() => {
    if (!plan) return;
    let cancelled = false;
    Promise.all(
      plan.reads.map(async r => {
        const bytes = await fetchBlob(config, r.sha, r.path, head, repoInfo);
        return [r.sha, decoder.decode(bytes)] as const;
      })
    ).then(
      entries => !cancelled && setTexts(new Map(entries)),
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, [plan, config, head, repoInfo]);

  return useMemo((): Library => {
    if (!plan) return { kind: 'loading' };
    const read = (path: string) =>
      texts.get(plan.current.entries.get(path)?.sha ?? '');
    const ready = plan.reads.every(r => texts.has(r.sha));
    let usage: Map<string, PageUse[]> | undefined;
    if (ready) {
      const files: (PageFile & { language: string })[] = plan.pages.map(p => ({
        ...p,
        filePath: p.path,
        text: read(p.path) ?? '',
      }));
      usage = new Map(
        [...imageUsage(files)].map(([path, users]) => {
          const bySlug = new Map<string, PageUse>();
          for (const u of users as typeof files) {
            const use = bySlug.get(u.slug) ?? {
              slug: u.slug,
              title: frontmatterTitle(u.text) ?? humanize(u.slug),
              collection: u.collection,
              languages: [],
            };
            use.languages.push(u.language);
            bySlug.set(u.slug, use);
          }
          return [path, [...bySlug.values()]];
        })
      );
    }
    return {
      kind: 'loaded',
      dir: plan.dir,
      images: plan.images,
      onLive,
      usage,
      alts: parseAltTexts(read(plan.altPath)),
    };
  }, [plan, texts, onLive]);
}

// Removed pictures are read from the live site.
export function useImageBytes(image: LibraryImage | undefined) {
  const config = useConfig();
  const repoInfo = useRepoInfo();
  const branches = useBranches();
  const branch = useCurrentBranch();
  const commit =
    branches.get(
      image?.draft === 'removed' && repoInfo ? repoInfo.defaultBranch : branch
    )?.commitSha ?? '';
  const [bytes, setBytes] = useState<{ sha: string; data: Uint8Array }>();
  const sha = image?.sha;
  const path = image?.path;
  useEffect(() => {
    if (!sha || !path) return;
    let cancelled = false;
    Promise.resolve(fetchBlob(config, sha, path, commit, repoInfo)).then(
      data => !cancelled && setBytes({ sha, data }),
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, [sha, path, config, commit, repoInfo]);
  return bytes && bytes.sha === sha ? bytes.data : undefined;
}

export type FileWrite = { path: string; contents: Uint8Array };

// Every library change is one commit into the open draft, or a new draft on
// the live site; the Images page opens again on that draft.
export function useImageCommit() {
  const commit = useCommitToDraft();
  const newDraftName = useNewDraftName();
  return (input: {
    draft: string;
    headline: string;
    additions?: FileWrite[];
    deletions?: string[];
  }) =>
    commit({
      newDraft: newDraftName(input.draft),
      message: { headline: input.headline },
      additions: (input.additions ?? []).map(a => ({
        path: a.path,
        contents: base64Encode(a.contents),
      })),
      deletions: input.deletions,
      href: b => `/keystatic/branch/${encodeURIComponent(b)}/images`,
    });
}
