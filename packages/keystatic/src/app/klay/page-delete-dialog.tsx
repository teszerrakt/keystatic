import { useEffect, useMemo, useState } from 'react';

import { Button, ButtonGroup } from '@keystar/ui/button';
import { Dialog, useDialogContainer } from '@keystar/ui/dialog';
import { Flex } from '@keystar/ui/layout';
import { Notice } from '@keystar/ui/notice';
import { Radio, RadioGroup } from '@keystar/ui/radio';
import { Content } from '@keystar/ui/slots';
import { css, tokenSchema } from '@keystar/ui/style';
import { TextField } from '@keystar/ui/text-field';
import { Heading, Text } from '@keystar/ui/typography';

import { getPathPrefix } from '../path-utils';
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
import { liveHrefFor, useDraftsContext } from './draft-data';
import { useNewDraftName } from './drafts';
import {
  collectionsToDelete,
  deleteMessage,
  DeleteScope,
  filesToDelete,
  slugConfirmed,
} from './page-delete';
import { useLanguages } from './pages-data';
import { findProblems, PageText } from './review';
import { pageFile, pathTemplate } from './review-data';

const code = css({
  background: tokenSchema.color.background.surfaceTertiary,
  borderRadius: tokenSchema.size.radius.small,
  fontFamily: tokenSchema.typography.fontFamily.code,
  fontWeight: tokenSchema.typography.fontWeight.semibold,
  paddingInline: tokenSchema.size.space.small,
});

// Commits to the open draft, or on the live site starts the draft `newDraft`.
function useDeletePage() {
  const config = useConfig();
  const trees = useTree();
  const languages = useLanguages();
  const commit = useCommitToDraft();
  // Read during render: the compiler hoists property reads out of closures.
  const current =
    trees.merged.kind === 'loaded' ? trees.merged.data.current : null;
  return async (slug: string, collections: string[], newDraft: string) => {
    if (!current) return;
    const dirs = languages
      .filter(l => collections.includes(l.collection))
      .map(l => l.dir);
    const prefix = getPathPrefix(config.storage) ?? '';
    const paths = filesToDelete({ paths: current.entries.keys(), dirs, slug });
    if (!paths.length) throw new Error('This page has no files to delete.');
    await commit({
      newDraft,
      message: deleteMessage(paths.map(p => prefix + p)),
      deletions: paths,
      href: b => `/keystatic/branch/${encodeURIComponent(b)}/pages`,
    });
  };
}

// How many other pages link to the copies about to go.
function useLinkingPages(slug: string, collections: string[]) {
  const config = useConfig();
  const trees = useTree();
  const repoInfo = useRepoInfo();
  const branches = useBranches();
  const branch = useCurrentBranch();
  const languages = useLanguages();
  const [count, setCount] = useState<number | undefined>(undefined);
  const current =
    trees.merged.kind === 'loaded' ? trees.merged.data.current : null;
  const head = branches.get(branch)?.commitSha ?? '';
  const key = collections.join(',');

  const plan = useMemo(() => {
    if (!current) return null;
    const targets = key.split(',');
    const pages = languages.flatMap(l => {
      const template = pathTemplate(config, l.collection);
      return getEntriesInCollectionWithTreeKey(
        config,
        l.collection,
        current.tree
      ).flatMap(e => {
        const path = pageFile(current, l.dir, e.slug);
        const url = template?.replace('{slug}', e.slug);
        return path && url
          ? [{ collection: l.collection, slug: e.slug, path, url }]
          : [];
      });
    });
    const deleting = (p: { collection: string; slug: string }) =>
      p.slug === slug && targets.includes(p.collection);
    return {
      scan: pages.filter(p => !deleting(p)),
      deletedUrls: new Map(
        pages.filter(deleting).map(p => [p.url, p.slug] as const)
      ),
      pageUrls: new Set(pages.map(p => p.url)),
      prefixes: languages.flatMap(l => {
        const t = pathTemplate(config, l.collection);
        return t ? [t.slice(0, t.indexOf('{slug}'))] : [];
      }),
    };
  }, [current, languages, config, slug, key]);

  useEffect(() => {
    if (!plan || !current || !repoInfo) return;
    let cancelled = false;
    const decoder = new TextDecoder();
    Promise.all(
      plan.scan.map(async p => {
        const sha = current.entries.get(p.path)!.sha;
        const bytes = await fetchBlob(config, sha, p.path, head, repoInfo);
        const page: PageText = {
          title: p.slug,
          url: p.url,
          filePath: p.path,
          text: decoder.decode(bytes),
          page: p,
        };
        return page;
      })
    ).then(
      pages => {
        if (cancelled) return;
        const problems = findProblems({
          pages,
          pageUrls: plan.pageUrls,
          deletedUrls: plan.deletedUrls,
          prefixes: plan.prefixes,
          files: new Set(),
        });
        setCount(
          new Set(
            problems
              .filter(p => p.kind === 'deleted-page')
              .map(p => p.from.filePath)
          ).size
        );
      },
      () => {}
    );
    return () => {
      cancelled = true;
    };
  }, [plan, current, config, head, repoInfo]);
  return count;
}

export function DeletePageDialog(props: {
  slug: string;
  title: string;
  // The language in view: "Only <language>" deletes this one.
  collection: string;
}) {
  const config = useConfig();
  const trees = useTree();
  const branch = useCurrentBranch();
  const languages = useLanguages();
  const drafts = useDraftsContext();
  const dialog = useDialogContainer();
  const deletePage = useDeletePage();
  const newDraftName = useNewDraftName();
  const [scope, setScope] = useState<DeleteScope>('all');
  const [typed, setTyped] = useState('');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current =
    trees.merged.kind === 'loaded' ? trees.merged.data.current : null;
  const present = current
    ? languages
        .filter(l => pageFile(current, l.dir, props.slug))
        .map(l => l.collection)
    : [];
  const targets = collectionsToDelete({
    present,
    collection: props.collection,
    scope,
  });
  const links = useLinkingPages(props.slug, targets);
  const language = languages.find(l => l.collection === props.collection)
    ?.language;
  const address = liveHrefFor(config, [
    'branch',
    branch,
    'collection',
    props.collection,
    'item',
    props.slug,
  ])
    ?.replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
  // Fixed once the delete starts: the new branch would make the next name unique.
  const [newDraft, setNewDraft] = useState<string | null>(null);
  const proposed = newDraft ?? newDraftName(`remove-${props.slug}`);
  const draftName = drafts?.title(drafts.onLive ? proposed : branch);
  const ready = slugConfirmed(typed, props.slug) && targets.length > 0;

  const run = async () => {
    setWorking(true);
    setError(null);
    setNewDraft(proposed);
    try {
      await deletePage(props.slug, targets, proposed);
      dialog.dismiss();
    } catch (e) {
      setError((e as Error).message);
      setWorking(false);
      setNewDraft(null);
    }
  };

  return (
    <Dialog size="medium">
      <Heading>{`Delete “${props.title}”?`}</Heading>
      <Content>
        <Flex direction="column" gap="xlarge">
          <Text color="neutralSecondary">
            It stays on the site until you publish. Until then you can undo it.
          </Text>
          {present.length > 1 && (
            <RadioGroup
              label="Delete it in"
              orientation="horizontal"
              value={scope}
              onChange={v => setScope(v as DeleteScope)}
            >
              <Radio value="all">{`Every language it has (${present.length})`}</Radio>
              <Radio value="one">{`Only ${language}`}</Radio>
            </RadioGroup>
          )}
          {!!links && (
            <Notice tone="caution">
              <Text>
                <strong>
                  {links === 1
                    ? '1 page links here.'
                    : `${links} pages link here.`}
                </strong>{' '}
                They're listed when you review the draft, so you can fix them
                before publishing.
              </Text>
            </Notice>
          )}
          <Text>
            {drafts?.onLive ? (
              <>
                This starts a new draft, <strong>{draftName}</strong>. Inside a
                draft, it joins that draft instead.
              </>
            ) : (
              <>
                It goes into your draft, <strong>{draftName}</strong>.
              </>
            )}
          </Text>
          <TextField
            label={
              <>
                To confirm, type <span className={code}>{props.slug}</span>
              </>
            }
            description={
              address
                ? `The last part of the page's address: ${address}`
                : "The last part of the page's address."
            }
            value={typed}
            onChange={setTyped}
            placeholder={props.slug}
            autoComplete="off"
            spellCheck="false"
            UNSAFE_className={css({
              '& input': { fontFamily: tokenSchema.typography.fontFamily.code },
            })}
          />
          {error && <Notice tone="critical">{error}</Notice>}
        </Flex>
      </Content>
      <ButtonGroup>
        <Button onPress={dialog.dismiss} isDisabled={working}>
          Cancel
        </Button>
        <Button
          tone="critical"
          prominence="high"
          isDisabled={!ready || working}
          onPress={run}
        >
          {working ? 'Deleting…' : 'Delete in draft'}
        </Button>
      </ButtonGroup>
    </Dialog>
  );
}
