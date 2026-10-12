import { gql } from '@ts-gql/tag/no-transform';
import { useEffect, useMemo, useState } from 'react';
import { useClient } from 'urql';
import { base64Encode } from '#base64';

import { getCollectionPath } from '../path-utils';
import { useConfig } from '../shell/context';
import {
  useBranches,
  useChanged,
  useCurrentBranch,
  useRepoInfo,
  useTree,
} from '../shell/data';
import { fetchBlob } from '../useItemData';
import { getEntriesInCollectionWithTreeKey } from '../utils';
import { sectionLabel } from './menu-sections';
import { useMenuSections } from './menu-sections-data';
import { buildPageRows, frontmatterField, Language, PageRow } from './pages';
import { ChangeKind } from './review';
import { pageFile, useLanguageOf } from './review-data';

const RestorePage = gql`
  mutation KlayRestorePage($input: CreateCommitOnBranchInput!) {
    createCommitOnBranch(input: $input) {
      ref {
        id
        target {
          id
          oid
          ... on Commit {
            tree {
              id
              oid
            }
          }
        }
      }
    }
  }
` as import('../../../__generated__/ts-gql/KlayRestorePage').type;

// Each navigation group is a language; its collections hold that language's pages.
export function useLanguages(): Language[] {
  const config = useConfig();
  const languageOf = useLanguageOf();
  return useMemo(() => {
    const nav = config.ui?.navigation;
    const keys = !nav
      ? Object.keys(config.collections ?? {})
      : Array.isArray(nav)
      ? nav
      : Object.values(nav).flat();
    return keys
      .filter(k => config.collections?.[k])
      .map(collection => ({
        collection,
        language: languageOf(collection),
        dir: getCollectionPath(config, collection),
      }));
  }, [config, languageOf]);
}

export type PagesData =
  | { kind: 'loading' }
  | { kind: 'loaded'; rows: PageRow[]; onLive: boolean };

export function usePages(): PagesData {
  const config = useConfig();
  const trees = useTree();
  const changed = useChanged();
  const repoInfo = useRepoInfo();
  const branches = useBranches();
  const branch = useCurrentBranch();
  const client = useClient();
  const languages = useLanguages();
  const { sections } = useMenuSections();
  const [texts, setTexts] = useState(new Map<string, string>());
  const [updated, setUpdated] = useState(new Map<string, string>());
  const onLive = branch === repoInfo?.defaultBranch;

  const plan = useMemo(() => {
    if (trees.merged.kind !== 'loaded' || !repoInfo) return null;
    const { current, default: base } = trees.merged.data;
    const slugsIn = (tree: typeof current) =>
      new Map(
        languages.map(l => [
          l.collection,
          new Set(
            getEntriesInCollectionWithTreeKey(
              config,
              l.collection,
              tree.tree
            ).map(e => e.slug)
          ),
        ])
      );
    const changes: { collection: string; slug: string; kind: ChangeKind }[] =
      [];
    if (!onLive) {
      for (const l of languages) {
        const c = changed.collections.get(l.collection);
        if (!c) continue;
        for (const slug of c.added) {
          changes.push({ collection: l.collection, slug, kind: 'added' });
        }
        for (const slug of c.changed) {
          changes.push({ collection: l.collection, slug, kind: 'changed' });
        }
        for (const slug of c.removed) {
          changes.push({ collection: l.collection, slug, kind: 'removed' });
        }
      }
    }
    // Every page file, from the draft or (for deleted pages) from the live branch.
    const files = new Map<
      string,
      { path: string; sha: string; commit: string }
    >();
    const head = branches.get(branch)?.commitSha ?? '';
    const baseHead = branches.get(repoInfo.defaultBranch)?.commitSha ?? '';
    const slugs = slugsIn(current);
    const baseSlugs = onLive ? undefined : slugsIn(base);
    for (const l of languages) {
      for (const slug of slugs.get(l.collection) ?? []) {
        const path = pageFile(current, l.dir, slug);
        if (path) {
          files.set(`${l.collection}/${slug}`, {
            path,
            sha: current.entries.get(path)!.sha,
            commit: head,
          });
        }
      }
      for (const slug of baseSlugs?.get(l.collection) ?? []) {
        if (files.has(`${l.collection}/${slug}`)) continue;
        const path = pageFile(base, l.dir, slug);
        if (path) {
          files.set(`${l.collection}/${slug}`, {
            path,
            sha: base.entries.get(path)!.sha,
            commit: baseHead,
          });
        }
      }
    }
    return { slugs, baseSlugs, changes, files, head };
  }, [trees, repoInfo, languages, config, changed, onLive, branches, branch]);

  useEffect(() => {
    if (!plan || !repoInfo) return;
    let cancelled = false;
    const decoder = new TextDecoder();
    Promise.all(
      [...plan.files.values()].map(async f => {
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
      entries => !cancelled && setTexts(new Map(entries)),
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, [plan, config, repoInfo]);

  // One request for every page's last commit: history per path, aliased.
  useEffect(() => {
    if (!plan || !repoInfo || !plan.files.size) return;
    let cancelled = false;
    const keys = [...plan.files.keys()];
    const fields = keys
      .map(
        (k, i) =>
          `f${i}: history(first: 1, path: ${JSON.stringify(
            plan.files.get(k)!.path
          )}) { nodes { id committedDate } }`
      )
      .join('\n');
    const query = `query KlayPagesUpdated($owner: String!, $name: String!, $ref: String!) {
      repository(owner: $owner, name: $name) { id object(expression: $ref) { id ... on Commit { ${fields} } } }
    }`;
    client
      .query(
        query,
        {
          owner: repoInfo.owner,
          name: repoInfo.name,
          ref: plan.head || branch,
        },
        { requestPolicy: 'network-only' }
      )
      .toPromise()
      .then(res => {
        const obj = res.data?.repository?.object;
        if (cancelled || !obj) return;
        setUpdated(
          new Map(
            keys.flatMap((k, i) => {
              const date = obj[`f${i}`]?.nodes?.[0]?.committedDate;
              return date ? [[k, date] as const] : [];
            })
          )
        );
      });
    return () => {
      cancelled = true;
    };
  }, [plan, client, repoInfo, branch]);

  return useMemo((): PagesData => {
    if (!plan) return { kind: 'loading' };
    const text = (c: string, s: string) => {
      const f = plan.files.get(`${c}/${s}`);
      return f ? texts.get(f.sha) : undefined;
    };
    const main = languages[0]?.language ?? '';
    const labels = new Map(
      (sections ?? []).map(s => [s.id, sectionLabel(s, main, main)])
    );
    const rows = buildPageRows({
      languages,
      slugs: plan.slugs,
      baseSlugs: plan.baseSlugs,
      changes: plan.changes,
      title: (c, s) => {
        const t = text(c, s);
        return t ? frontmatterField(t, 'title') : undefined;
      },
      section: (_collection, s) => {
        // Only the first language carries the menu fields; look across all.
        for (const l of languages) {
          const t = text(l.collection, s);
          const value = t && frontmatterField(t, 'section');
          if (value) return labels.get(value) ?? value;
        }
        return undefined;
      },
      updated: (c, s) => updated.get(`${c}/${s}`),
    });
    return { kind: 'loaded', rows, onLive };
  }, [plan, texts, updated, languages, sections, onLive]);
}

// Puts a page this draft deletes back, as it is on the live site.
export function useRestorePage() {
  const config = useConfig();
  const client = useClient();
  const trees = useTree();
  const repoInfo = useRepoInfo();
  const branches = useBranches();
  const branch = useCurrentBranch();
  const languages = useLanguages();
  // Read during render: the compiler hoists property reads out of closures.
  const base =
    trees.merged.kind === 'loaded' ? trees.merged.data.default : null;
  return async (row: PageRow) => {
    if (!base || !repoInfo) return;
    const baseHead = branches.get(repoInfo.defaultBranch)?.commitSha ?? '';
    const additions = [];
    for (const collection of row.deletedIn) {
      const dir = languages.find(l => l.collection === collection)?.dir;
      const path = dir && pageFile(base, dir, row.slug);
      if (!path) continue;
      const bytes = await fetchBlob(
        config,
        base.entries.get(path)!.sha,
        path,
        baseHead,
        repoInfo
      );
      additions.push({ path, contents: base64Encode(bytes) });
    }
    const res = await client
      .mutation(RestorePage, {
        input: {
          branch: {
            repositoryNameWithOwner: `${repoInfo.owner}/${repoInfo.name}`,
            branchName: branch,
          },
          expectedHeadOid: branches.get(branch)?.commitSha ?? '',
          message: {
            headline: `Restore ${additions.map(a => a.path).join(', ')}`,
          },
          fileChanges: { additions },
        },
      })
      .toPromise();
    if (res.error) {
      throw new Error(res.error.message.replace(/^\[GraphQL\] /, ''));
    }
  };
}
