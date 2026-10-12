import { useEffect, useMemo, useState } from 'react';
import { base64Encode } from '#base64';

import type { WithImageLibrary } from '../../form/fields/markdoc';
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
import { branchHref, useDraftsContext } from './draft-data';
import { useNewDraftName } from './drafts';
import {
  ALT_FILE,
  imageUsage,
  LibraryImage,
  libraryImages,
  PageFile,
  parseAltTexts,
  usageLabel,
} from './images';
import { useLanguages } from './pages-data';
import { frontmatterTitle, humanize } from './review';
import { pageFile } from './review-data';

// The image directory and public path of the pages' content field.
export function useImageDirectory() {
  const config = useConfig();
  const collection = useLanguages()[0]?.collection;
  const schema = collection ? config.collections?.[collection]?.schema : null;
  for (const field of Object.values(schema ?? {})) {
    const image = (field as Partial<WithImageLibrary>).image;
    if (image) return image.directory;
  }
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
      usersOf: (path: string) => PageUse[] | undefined;
      // "On 2 pages"; empty while the pages are being read
      usageOf: (path: string) => string;
      // undefined until the alt text file is read
      alts: Record<string, string> | undefined;
      // The alt text file as it is now, to merge a save into.
      readAltFile: () => Promise<string | undefined>;
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
  const [altText, setAltText] = useState<{ sha: string; text: string }>();
  const onLive = useDraftsContext()?.onLive ?? true;

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
    const reads = pages.map(p => ({
      path: p.path,
      sha: current.entries.get(p.path)!.sha,
    }));
    return {
      dir,
      altPath,
      altSha: current.entries.get(altPath)?.sha,
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

  useEffect(() => {
    const sha = plan?.altSha;
    if (!plan || !sha) return;
    let cancelled = false;
    Promise.resolve(fetchBlob(config, sha, plan.altPath, head, repoInfo)).then(
      bytes => !cancelled && setAltText({ sha, text: decoder.decode(bytes) }),
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
      usersOf: path => (usage ? usage.get(path) ?? [] : undefined),
      usageOf: path => (usage ? usageLabel(usage.get(path)?.length ?? 0) : ''),
      alts: !plan.altSha
        ? {}
        : altText?.sha === plan.altSha
        ? parseAltTexts(altText.text)
        : undefined,
      readAltFile: async () =>
        plan.altSha
          ? decoder.decode(
              await fetchBlob(config, plan.altSha, plan.altPath, head, repoInfo)
            )
          : undefined,
    };
  }, [plan, texts, onLive, altText, config, head, repoInfo]);
}

export function useImageBytes(image: LibraryImage | undefined) {
  const config = useConfig();
  const repoInfo = useRepoInfo();
  const branches = useBranches();
  const branch = useCurrentBranch();
  const commit = branches.get(branch)?.commitSha ?? '';
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

// Every library change is one commit into the open draft, or a new draft on
// the live site; the Images page opens again on that draft. `draftName` is
// the new draft a commit on the live site starts.
export function useImageCommit() {
  const commitToDraft = useCommitToDraft();
  const draftName = useNewDraftName();
  const commit = (input: {
    draft: string;
    headline: string;
    additions?: { path: string; contents: Uint8Array }[];
    deletions?: string[];
  }) =>
    commitToDraft({
      newDraft: draftName(input.draft),
      message: { headline: input.headline },
      additions: (input.additions ?? []).map(a => ({
        path: a.path,
        contents: base64Encode(a.contents),
      })),
      deletions: input.deletions,
      href: b => `${branchHref(b)}/images`,
    });
  return { commit, draftName };
}
