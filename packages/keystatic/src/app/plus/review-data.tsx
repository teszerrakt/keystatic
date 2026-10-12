import { useEffect, useMemo, useState } from 'react';

import { Config } from '../../config';
import { getCollectionPath } from '../path-utils';
import { useConfig } from '../shell/context';
import {
  TreeData,
  useBranches,
  useChanged,
  useCurrentBranch,
  useRepoInfo,
  useTree,
} from '../shell/data';
import { fetchBlob } from '../useItemData';
import { getEntriesInCollectionWithTreeKey } from '../utils';
import {
  diffEntries,
  findProblems,
  frontmatterTitle,
  groupChanges,
  Group,
  humanize,
  PageChange,
  PageText,
  Problem,
} from './review';

const PAGE_FILE = /\.(md|mdoc|mdx)$/;

export function pageFile(tree: TreeData, dir: string, slug: string) {
  for (const path of tree.entries.keys()) {
    if (
      PAGE_FILE.test(path) &&
      (path.startsWith(`${dir}/${slug}.`) || path.startsWith(`${dir}/${slug}/`))
    ) {
      return path;
    }
  }
}

// `/help/{slug}/` from a preview URL on the draft host; links are checked
// only in collections whose address is known.
function pathTemplate(config: Config, collection: string) {
  const preview = config.collections?.[collection]?.previewUrl;
  const host =
    config.storage.kind === 'local'
      ? undefined
      : config.storage.draftPreviewUrl;
  if (!preview || !host || !preview.startsWith(host)) return;
  const rest = preview.slice(host.length);
  return rest.includes('{slug}') ? rest : undefined;
}

// Language names come from the navigation groups in the config.
export function useLanguageOf() {
  const config = useConfig();
  return useMemo(() => {
    const nav = config.ui?.navigation;
    const names = new Map<string, string>();
    if (nav && !Array.isArray(nav)) {
      for (const [group, keys] of Object.entries(nav)) {
        for (const key of keys) names.set(key, group);
      }
    }
    return (collection: string) =>
      names.get(collection) ??
      config.collections?.[collection]?.label ??
      collection;
  }, [config]);
}

type Fetch = { path: string; sha: string; commit: string };

export type DraftReview =
  | { kind: 'loading' }
  | {
      kind: 'loaded';
      groups: Group[];
      // undefined while the pages are still being read
      problems: Problem[] | undefined;
    };

export function useDraftReview(): DraftReview {
  const config = useConfig();
  const changed = useChanged();
  const trees = useTree();
  const repoInfo = useRepoInfo();
  const branches = useBranches();
  const branch = useCurrentBranch();
  const language = useLanguageOf();
  const [texts, setTexts] = useState(new Map<string, string>());

  const plan = useMemo(() => {
    if (trees.merged.kind !== 'loaded' || !repoInfo) return null;
    const { current, default: base } = trees.merged.data;
    const head = branches.get(branch)?.commitSha ?? '';
    const baseHead = branches.get(repoInfo.defaultBranch)?.commitSha ?? '';
    const collections = Object.keys(config.collections ?? {});
    const dirs = collections.map(c => getCollectionPath(config, c));

    const pages: PageChange[] = [];
    for (const [collection, c] of changed.collections) {
      for (const slug of c.added) {
        pages.push({ collection, slug, kind: 'added' });
      }
      for (const slug of c.changed) {
        pages.push({ collection, slug, kind: 'changed' });
      }
      for (const slug of c.removed) {
        pages.push({ collection, slug, kind: 'removed' });
      }
    }
    const files = diffEntries(current.entries, base.entries).filter(
      f => !dirs.some(d => f.path.startsWith(`${d}/`))
    );

    // Every page in the draft, with its address when it has one.
    const all = collections.flatMap(collection => {
      const template = pathTemplate(config, collection);
      const dir = getCollectionPath(config, collection);
      return getEntriesInCollectionWithTreeKey(
        config,
        collection,
        current.tree
      ).map(e => ({
        collection,
        slug: e.slug,
        url: template?.replace('{slug}', e.slug),
        path: pageFile(current, dir, e.slug),
      }));
    });
    const removed = pages
      .filter(p => p.kind === 'removed')
      .map(p => {
        const template = pathTemplate(config, p.collection);
        const path = pageFile(
          base,
          getCollectionPath(config, p.collection),
          p.slug
        );
        return { ...p, url: template?.replace('{slug}', p.slug), path };
      });
    // A deleted page can break links anywhere; otherwise only the edited pages can.
    const toScan = removed.length
      ? all
      : all.filter(a =>
          pages.some(
            p =>
              p.collection === a.collection &&
              p.slug === a.slug &&
              p.kind !== 'removed'
          )
        );

    const fetches: Fetch[] = [
      ...toScan.flatMap(a =>
        a.path
          ? [
              {
                path: a.path,
                sha: current.entries.get(a.path)!.sha,
                commit: head,
              },
            ]
          : []
      ),
      ...removed.flatMap(r =>
        r.path
          ? [
              {
                path: r.path,
                sha: base.entries.get(r.path)!.sha,
                commit: baseHead,
              },
            ]
          : []
      ),
    ];
    return { current, pages, files, all, removed, toScan, fetches };
  }, [trees, repoInfo, branches, branch, config, changed]);

  useEffect(() => {
    if (!plan || !repoInfo) return;
    let cancelled = false;
    const decoder = new TextDecoder();
    Promise.all(
      plan.fetches.map(async f => {
        const bytes = await fetchBlob(
          config,
          f.sha,
          f.path,
          f.commit,
          repoInfo
        );
        return [f.sha, decoder.decode(bytes)] as const;
      })
    ).then(
      entries => {
        if (!cancelled) setTexts(new Map(entries));
      },
      () => {
        if (!cancelled) setTexts(new Map());
      }
    );
    return () => {
      cancelled = true;
    };
  }, [plan, config, repoInfo]);

  return useMemo((): DraftReview => {
    if (!plan) return { kind: 'loading' };
    const { current, all, removed, toScan } = plan;
    const read = (path: string | undefined, tree: TreeData) => {
      const sha = path && tree.entries.get(path)?.sha;
      return sha ? texts.get(sha) : undefined;
    };
    const titleOf = (p: {
      collection: string;
      slug: string;
      kind?: string;
    }) => {
      const tree =
        p.kind === 'removed' && trees.merged.kind === 'loaded'
          ? trees.merged.data.default
          : current;
      const file =
        p.kind === 'removed'
          ? removed.find(
              r => r.slug === p.slug && r.collection === p.collection
            )?.path
          : all.find(a => a.slug === p.slug && a.collection === p.collection)
              ?.path;
      const text = read(file, tree);
      return (text && frontmatterTitle(text)) ?? humanize(p.slug);
    };
    const groups = groupChanges({
      pages: plan.pages,
      files: plan.files,
      language,
      title: titleOf,
    });

    const ready = plan.fetches.every(f => texts.has(f.sha));
    let problems: Problem[] | undefined;
    if (ready) {
      const pagesText: PageText[] = toScan.flatMap(a => {
        const text = read(a.path, current);
        return a.url && a.path && text !== undefined
          ? [{ title: titleOf(a), url: a.url, filePath: a.path, text, page: a }]
          : [];
      });
      const prefixes = Object.keys(config.collections ?? {}).flatMap(c => {
        const t = pathTemplate(config, c);
        return t ? [t.slice(0, t.indexOf('{slug}'))] : [];
      });
      problems = findProblems({
        pages: pagesText,
        pageUrls: new Set(all.flatMap(a => (a.url ? [a.url] : []))),
        deletedUrls: new Map(
          removed.flatMap(r => (r.url ? [[r.url, titleOf(r)] as const] : []))
        ),
        prefixes,
        files: new Set(current.entries.keys()),
      });
    }
    return { kind: 'loaded', groups, problems };
  }, [plan, texts, language, trees, config]);
}
