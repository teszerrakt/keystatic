import { useEffect, useMemo, useState } from 'react';

import { Config } from '../../config';
import { ComponentSchema } from '../../form/api';
import {
  getCollectionPath,
  getEntryDataFilepath,
  getSingletonFormat,
  getSingletonPath,
} from '../path-utils';
import { useConfig } from '../shell/context';
import {
  useBranches,
  useCurrentBranch,
  useRepoInfo,
  useTree,
} from '../shell/data';
import { fetchBlob } from '../useItemData';
import { getEntriesInCollectionWithTreeKey } from '../utils';
import {
  DEFAULT_ORDER,
  frontmatterValue,
  MenuSection,
  parseSections,
} from './menu-sections';
import { pageFile } from './review-data';

// Set by fields.menuSection and fields.menuOrder.
type Marked = {
  kind?: string;
  fields?: Record<string, ComponentSchema>;
  menuSections?: { singleton: string };
  menuOrder?: true;
  defaultValue?: () => unknown;
};

export type MenuSetup = {
  singleton: string;
  // The sections file, relative to the content root.
  path: string;
  // The collection whose pages carry the menu fields.
  collection: string;
  dir: string;
  slugField: string;
  sectionField: string;
  defaultSection: string;
  orderPath: string[] | undefined;
};

function findPath(
  schema: Record<string, ComponentSchema>,
  prefix: string[] = []
): string[] | undefined {
  for (const [key, field] of Object.entries(schema)) {
    const f = field as Marked;
    if (f.menuOrder) return [...prefix, key];
    if (f.kind === 'object' && f.fields) {
      const found = findPath(f.fields, [...prefix, key]);
      if (found) return found;
    }
  }
}

export function menuSetup(config: Config): MenuSetup | null {
  for (const [collection, c] of Object.entries(config.collections ?? {})) {
    for (const [key, field] of Object.entries(c.schema)) {
      const f = field as Marked;
      const singleton = f.menuSections?.singleton;
      if (!singleton || !config.singletons?.[singleton]) continue;
      return {
        singleton,
        path: getEntryDataFilepath(
          getSingletonPath(config, singleton),
          getSingletonFormat(config, singleton)
        ),
        collection,
        dir: getCollectionPath(config, collection),
        slugField: c.slugField,
        sectionField: key,
        defaultSection: String(f.defaultValue?.() ?? ''),
        orderPath: findPath(c.schema),
      };
    }
  }
  return null;
}

export function useMenuSetup() {
  const config = useConfig();
  return useMemo(() => menuSetup(config), [config]);
}

// Text of blobs by sha; `undefined` until fetched.
function useBlobTexts(files: { path: string; sha: string; commit: string }[]) {
  const config = useConfig();
  const repoInfo = useRepoInfo();
  const [texts, setTexts] = useState(new Map<string, string>());
  const key = files.map(f => `${f.sha}:${f.path}:${f.commit}`).join('|');
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const decoder = new TextDecoder();
    const list = key.split('|').map(k => {
      const [sha, path, commit] = k.split(':');
      return { sha, path, commit };
    });
    Promise.all(
      list.map(async f => {
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
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, [key, config, repoInfo]);
  return texts;
}

export type MenuSectionsData = {
  setup: MenuSetup | null;
  // undefined while loading; [] when the file does not exist yet.
  sections: MenuSection[] | undefined;
  base: MenuSection[] | undefined;
  // The file's sha on this branch, if it exists.
  sha: string | undefined;
  changed: boolean;
};

export function useMenuSections(): MenuSectionsData {
  const setup = useMenuSetup();
  const trees = useTree();
  const repoInfo = useRepoInfo();
  const branches = useBranches();
  const branch = useCurrentBranch();
  const loaded = trees.merged.kind === 'loaded' ? trees.merged.data : null;
  const current = setup && loaded?.current.entries.get(setup.path);
  const base = setup && loaded?.default?.entries.get(setup.path);
  const head = branches.get(branch)?.commitSha ?? '';
  const baseHead = repoInfo
    ? branches.get(repoInfo.defaultBranch)?.commitSha ?? ''
    : head;
  const files = [
    ...(current && setup
      ? [{ path: setup.path, sha: current.sha, commit: head }]
      : []),
    ...(base && setup
      ? [{ path: setup.path, sha: base.sha, commit: baseHead }]
      : []),
  ];
  const texts = useBlobTexts(files);
  const currentSha = current ? current.sha : undefined;
  const baseSha = base ? base.sha : undefined;
  const sections = useMemo(
    () =>
      !loaded
        ? undefined
        : !currentSha
        ? []
        : texts.has(currentSha)
        ? parseSections(texts.get(currentSha))
        : undefined,
    [loaded, texts, currentSha]
  );
  const baseSections = useMemo(
    () =>
      !loaded
        ? undefined
        : !baseSha
        ? []
        : texts.has(baseSha)
        ? parseSections(texts.get(baseSha))
        : undefined,
    [loaded, texts, baseSha]
  );
  return {
    setup,
    sections,
    base: baseSections,
    sha: currentSha,
    changed: !!loaded && currentSha !== baseSha,
  };
}

export type MenuPage = {
  slug: string;
  title: string;
  section: string;
  order: number;
  path: string;
  text: string;
};

// Pages of the menu collection on this branch, with their section and order.
export function useMenuPages(): MenuPage[] | undefined {
  const config = useConfig();
  const setup = useMenuSetup();
  const trees = useTree();
  const branches = useBranches();
  const branch = useCurrentBranch();
  const current =
    trees.merged.kind === 'loaded' ? trees.merged.data.current : null;
  const head = branches.get(branch)?.commitSha ?? '';
  const files = useMemo(() => {
    if (!setup || !current) return [];
    return getEntriesInCollectionWithTreeKey(
      config,
      setup.collection,
      current.tree
    ).flatMap(e => {
      const path = pageFile(current, setup.dir, e.slug);
      return path
        ? [
            {
              slug: e.slug,
              path,
              sha: current.entries.get(path)!.sha,
              commit: head,
            },
          ]
        : [];
    });
  }, [setup, current, config, head]);
  const texts = useBlobTexts(files);
  return useMemo(() => {
    if (!setup || !current) return undefined;
    if (!files.every(f => texts.has(f.sha))) return undefined;
    return files.map(f => {
      const text = texts.get(f.sha)!;
      const title = frontmatterValue(text, [setup.slugField]);
      const section = frontmatterValue(text, [setup.sectionField]);
      const order = setup.orderPath
        ? frontmatterValue(text, setup.orderPath)
        : undefined;
      return {
        slug: f.slug,
        path: f.path,
        text,
        title: typeof title === 'string' && title ? title : f.slug,
        section:
          typeof section === 'string' && section
            ? section
            : setup.defaultSection,
        order: typeof order === 'number' ? order : DEFAULT_ORDER,
      };
    });
  }, [setup, current, files, texts]);
}
