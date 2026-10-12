import { gql } from '@ts-gql/tag/no-transform';
import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useClient, useQuery } from 'urql';

import { Config } from '../../config';
import { useRouter } from '../router';
import { useConfig } from '../shell/context';
import { parseRepoConfig } from '../repo-config';
import {
  GitHubAppShellQuery,
  useBranches,
  useCurrentBranch,
  useRepoInfo,
} from '../shell/data';
import { useViewer } from '../shell/viewer-data';
import { draftPrefix, isDraftsOnly } from './drafts';
import {
  Build,
  Draft,
  DraftStatus,
  draftStatus,
  draftTitle,
} from './draft-status';

// Cloudflare names a branch preview after the branch: lowercase, anything
// else becomes a dash. Used until the build's own check run names it.
export function previewAlias(branch: string) {
  return branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function fillPreviewUrl(template: string, branch: string, slug = '') {
  return template
    .replace('{alias}', previewAlias(branch))
    .replace('{branch}', branch)
    .replace('{slug}', slug);
}

const DraftsQuery = gql`
  query KlayDrafts($owner: String!, $name: String!, $query: String!) {
    repository(owner: $owner, name: $name) {
      id
      refs(refPrefix: "refs/heads/", query: $query, first: 100) {
        nodes {
          id
          name
          target {
            __typename
            id
            oid
            ... on Commit {
              committedDate
              author {
                user {
                  id
                  login
                }
              }
              checkSuites(first: 20) {
                nodes {
                  id
                  checkRuns(first: 10) {
                    nodes {
                      id
                      name
                      status
                      conclusion
                      detailsUrl
                    }
                  }
                }
              }
            }
          }
          associatedPullRequests(first: 1, states: [OPEN]) {
            nodes {
              id
              number
              autoMergeRequest {
                enabledAt
              }
              mergeStateStatus
            }
          }
          merged: associatedPullRequests(
            first: 1
            states: [MERGED]
            orderBy: { field: UPDATED_AT, direction: DESC }
          ) {
            nodes {
              id
              headRefOid
            }
          }
        }
      }
    }
  }
` as import('../../../__generated__/ts-gql/KlayDrafts').type;

const CreatePullRequest = gql`
  mutation KlayCreatePullRequest($input: CreatePullRequestInput!) {
    createPullRequest(input: $input) {
      pullRequest {
        id
        number
      }
    }
  }
` as import('../../../__generated__/ts-gql/KlayCreatePullRequest').type;

const EnableAutoMerge = gql`
  mutation KlayEnableAutoMerge($id: ID!, $headline: String!, $body: String!) {
    enablePullRequestAutoMerge(
      input: {
        pullRequestId: $id
        mergeMethod: SQUASH
        commitHeadline: $headline
        commitBody: $body
      }
    ) {
      pullRequest {
        id
      }
    }
  }
` as import('../../../__generated__/ts-gql/KlayEnableAutoMerge').type;

const MergePullRequest = gql`
  mutation KlayMergePullRequest($id: ID!, $headline: String!, $body: String!) {
    mergePullRequest(
      input: {
        pullRequestId: $id
        mergeMethod: SQUASH
        commitHeadline: $headline
        commitBody: $body
      }
    ) {
      pullRequest {
        id
      }
    }
  }
` as import('../../../__generated__/ts-gql/KlayMergePullRequest').type;

const DeleteDraft = gql`
  mutation KlayDeleteDraft($id: ID!) {
    deleteRef(input: { refId: $id }) {
      clientMutationId
    }
  }
` as import('../../../__generated__/ts-gql/KlayDeleteDraft').type;

const PullRequestState = gql`
  query KlayPullRequestState($id: ID!) {
    node(id: $id) {
      __typename
      id
      ... on PullRequest {
        mergeStateStatus
        number
        title
        files(first: 100) {
          nodes {
            path
          }
        }
      }
    }
  }
` as import('../../../__generated__/ts-gql/KlayPullRequestState').type;

type CheckRun = {
  name: string;
  status: string;
  conclusion: string | null;
  detailsUrl: string | null;
};

const runState = (runs: CheckRun[]): Build =>
  runs.length === 0
    ? 'none'
    : runs.some(r => r.status !== 'COMPLETED')
    ? 'building'
    : runs.every(r =>
        ['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(r.conclusion ?? '')
      )
    ? 'ready'
    : 'failed';

const isHostBuild = (run: CheckRun) => /^Workers Builds/.test(run.name);
const failed = (run: CheckRun) =>
  run.status === 'COMPLETED' &&
  !['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(run.conclusion ?? '');

function useDraftList(head: string | undefined, branch: string) {
  const config = useConfig();
  const repoInfo = useRepoInfo();
  const prefix = draftPrefix(config);
  const [result, refetch] = useQuery({
    query: DraftsQuery,
    pause: !repoInfo || !isDraftsOnly(config),
    variables: {
      owner: repoInfo?.upstream.owner ?? '',
      name: repoInfo?.upstream.name ?? '',
      query: prefix,
    },
    requestPolicy: 'cache-and-network',
  });

  const { drafts, published } = useMemo(() => {
    const drafts: Draft[] = [];
    // Branches whose head is already merged: kept on GitHub, done for writers.
    const published = new Set<string>();
    for (const ref of result.data?.repository?.refs?.nodes ?? []) {
      if (!ref?.name.startsWith(prefix)) continue;
      const commit = ref.target?.__typename === 'Commit' ? ref.target : null;
      if (
        ref.merged?.nodes?.some(pr => pr?.headRefOid === ref.target?.oid) &&
        !ref.associatedPullRequests?.nodes?.length
      ) {
        published.add(ref.name);
        continue;
      }
      const runs: CheckRun[] =
        commit?.checkSuites?.nodes?.flatMap(
          s => s?.checkRuns?.nodes?.flatMap(r => (r ? [r] : [])) ?? []
        ) ?? [];
      const hostRuns = runs.filter(isHostBuild);
      const fromCheck = hostRuns
        .map(r => r.detailsUrl?.match(/\/previews\/([^/]+)\//)?.[1])
        .find(Boolean);
      const pr = ref.associatedPullRequests?.nodes?.[0];
      drafts.push({
        name: ref.name,
        refId: ref.id,
        author: commit?.author?.user?.login,
        savedAt: commit?.committedDate,
        build: runState(hostRuns),
        checks: runState(runs),
        alias: fromCheck ?? previewAlias(ref.name),
        failureUrl: runs.find(failed)?.detailsUrl ?? undefined,
        pr: pr
          ? { id: pr.id, number: pr.number, queued: !!pr.autoMergeRequest }
          : undefined,
      });
    }
    drafts.sort((a, b) => (b.savedAt ?? '').localeCompare(a.savedAt ?? ''));
    return { drafts, published };
  }, [result.data, prefix]);

  // A save moves the head; reload so the new draft and its build show up.
  useEffect(() => {
    if (head) refetch({ requestPolicy: 'network-only' });
  }, [head, refetch]);

  const missing =
    !!head &&
    branch.startsWith(prefix) &&
    !published.has(branch) &&
    !drafts.some(d => d.name === branch);
  const busy =
    missing ||
    drafts.some(
      d => d.build === 'none' || d.build === 'building' || d.pr?.queued
    );
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(
      () => refetch({ requestPolicy: 'network-only' }),
      missing ? 4000 : 10000
    );
    return () => clearInterval(id);
  }, [busy, missing, refetch]);

  const refresh = useCallback(
    () => refetch({ requestPolicy: 'network-only' }),
    [refetch]
  );
  return { drafts, published, missing, refresh };
}

type PublishState =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'done' }
  | { kind: 'error'; message: string };

function usePublish(draft: Draft | undefined, onDone: () => void) {
  const client = useClient();
  const viewer = useViewer();
  const repoInfo = useRepoInfo();
  const config = useConfig();
  const [state, setState] = useState<PublishState>({ kind: 'idle' });

  // The body lists every changed file, one per line, so a publish notice can
  // link the pages without its own GitHub access.
  async function commitMessage(id: string) {
    const res = await client
      .query(PullRequestState, { id }, { requestPolicy: 'network-only' })
      .toPromise();
    const pr =
      res.data?.node?.__typename === 'PullRequest' ? res.data.node : null;
    const files = pr?.files?.nodes?.flatMap(f => (f ? [f.path] : [])) ?? [];
    return {
      headline: pr ? `${pr.title} (#${pr.number})` : 'Publish draft',
      body: [
        ...files.map(f => `- ${f}`),
        '',
        `Published-by: ${viewer?.login ?? 'unknown'}`,
      ].join('\n'),
    };
  }

  async function canMergeNow(id: string) {
    // GitHub reports UNKNOWN while it works out a fresh pull request.
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await client
        .query(PullRequestState, { id }, { requestPolicy: 'network-only' })
        .toPromise();
      const node = res.data?.node;
      const status =
        node?.__typename === 'PullRequest' ? node.mergeStateStatus : 'UNKNOWN';
      if (status !== 'UNKNOWN') {
        return ['CLEAN', 'HAS_HOOKS', 'UNSTABLE'].includes(status);
      }
      await new Promise(r => setTimeout(r, 1500));
    }
    return false;
  }

  async function publish() {
    if (!draft || !repoInfo) return;
    setState({ kind: 'working' });
    try {
      let id = draft.pr?.id;
      if (!id) {
        const created = await client
          .mutation(CreatePullRequest, {
            input: {
              repositoryId: repoInfo.id,
              baseRefName: repoInfo.defaultBranch,
              headRefName: draft.name,
              title: draftTitle(draft.name, draftPrefix(config)),
              body: 'Published from the docs editor.',
            },
          })
          .toPromise();
        if (created.error) throw created.error;
        id = created.data?.createPullRequest?.pullRequest?.id;
        if (!id) throw new Error('GitHub did not open the pull request.');
      }
      const message = await commitMessage(id);
      const queued = await client
        .mutation(EnableAutoMerge, { id, ...message })
        .toPromise();
      // Auto-merge refuses a pull request that can merge already, and is
      // off on repos without branch protection: merge now when GitHub allows.
      if (queued.error) {
        if (!(await canMergeNow(id))) throw queued.error;
        const merged = await client
          .mutation(MergePullRequest, { id, ...message })
          .toPromise();
        if (merged.error) throw merged.error;
      }
      setState({ kind: queued.error ? 'done' : 'idle' });
      onDone();
    } catch (e) {
      setState({ kind: 'error', message: explain((e as Error).message) });
    }
  }
  return [state, publish, () => setState({ kind: 'idle' })] as const;
}

function explain(message: string) {
  const m = message.replace(/^\[GraphQL\] /, '');
  if (/auto-merge is not allowed|not enabled for this repository/i.test(m)) {
    return 'Publishing is switched off for this repository. Ask an admin to allow auto-merge in its GitHub settings.';
  }
  if (/no commits between/i.test(m)) {
    return 'This draft has no changes yet. Save a page first.';
  }
  if (/merge conflict|not mergeable/i.test(m)) {
    return 'This draft clashes with a newer change on the live site. Ask an engineer to help.';
  }
  return m;
}

// params: branch, <name>, collection, <c>, item, <slug>
function pageUrl(
  config: Config,
  params: string[],
  fill: (t: string) => string
) {
  const collection =
    params[2] === 'collection' ? config.collections?.[params[3]] : undefined;
  if (!collection?.previewUrl || params[4] !== 'item' || !params[5]) return;
  const url = fill(collection.previewUrl).replace('{slug}', params[5]);
  return /^https?:/.test(url) ? url : undefined;
}

export function previewHrefFor(config: Config, draft: Draft, params: string[]) {
  if (config.storage.kind === 'local' || !config.storage.draftPreviewUrl) {
    return undefined;
  }
  const fill = (t: string) =>
    t.replace('{alias}', draft.alias).replace('{branch}', draft.name);
  return pageUrl(config, params, fill) ?? fill(config.storage.draftPreviewUrl);
}

// The live page is the preview page with the site's own address in front.
export function liveHrefFor(config: Config, params: string[]) {
  if (config.storage.kind === 'local' || !config.storage.siteUrl) return;
  const { siteUrl, draftPreviewUrl } = config.storage;
  const page =
    draftPreviewUrl &&
    pageUrl(config, params, t =>
      t.startsWith(draftPreviewUrl)
        ? siteUrl + t.slice(draftPreviewUrl.length)
        : t
    );
  return page?.startsWith(siteUrl) ? page : siteUrl;
}

type Saving = { branch: string | null; title: string; baseOid: string };
type Published = { title: string; href: string | undefined };

type DraftsValue = {
  drafts: Draft[];
  current: Draft | undefined;
  status: DraftStatus;
  onLive: boolean;
  saving: Saving | null;
  setSaving: (saving: Saving | null) => void;
  published: Published | null;
  dismissPublished: () => void;
  publishState: PublishState;
  publish: () => void;
  discard: (draft: Draft) => Promise<void>;
  title: (branch: string) => string;
  // Where "Back to editing" goes from the review page.
  editHref: string;
  reviewHref: string;
};

const DraftsContext = createContext<DraftsValue | null>(null);

export function useDraftsContext() {
  return useContext(DraftsContext);
}

export function DraftsProvider(props: { children: ReactNode }) {
  const config = useConfig();
  return isDraftsOnly(config) ? (
    <DraftsProviderInner>{props.children}</DraftsProviderInner>
  ) : (
    props.children
  );
}

const branchHref = (branch: string) =>
  `/keystatic/branch/${encodeURIComponent(branch)}`;

function DraftsProviderInner(props: { children: ReactNode }) {
  const config = useConfig();
  const repoInfo = useRepoInfo();
  const router = useRouter();
  const branch = useCurrentBranch();
  const head = useBranches().get(branch)?.commitSha;
  const prefix = draftPrefix(config);
  const client = useClient();
  const list = useDraftList(head, branch);
  const current = list.drafts.find(d => d.name === branch);
  const [publishState, publish, resetPublish] = usePublish(
    current,
    list.refresh
  );
  const [saving, setSaving] = useState<Saving | null>(null);
  const [published, setPublished] = useState<Published | null>(null);
  const onLive = !repoInfo || branch === repoInfo.defaultBranch;
  const title = useCallback((b: string) => draftTitle(b, prefix), [prefix]);
  const reviewHref = `${branchHref(branch)}/publish`;

  const lastEdit = useRef<string | null>(null);
  if (!router.href.endsWith('/publish')) lastEdit.current = router.href;
  const editHref =
    lastEdit.current?.startsWith(`${branchHref(branch)}/`) ||
    lastEdit.current === branchHref(branch)
      ? lastEdit.current
      : branchHref(branch);

  // The shell caches every branch head; refresh it before leaving a branch
  // that was just merged or deleted, or the live page opens stale.
  const leaveTo = useCallback(
    async (href: string) => {
      if (!repoInfo) return;
      const repo =
        config.storage.kind === 'github'
          ? parseRepoConfig(config.storage.repo)
          : { owner: repoInfo.owner, name: repoInfo.name };
      await client
        .query(GitHubAppShellQuery, repo, { requestPolicy: 'network-only' })
        .toPromise()
        .catch(() => {});
      list.refresh();
      router.push(href);
    },
    [client, config, repoInfo, router, list]
  );

  // The first save is done once the new branch has moved past its base.
  useEffect(() => {
    if (saving?.branch === branch && head && head !== saving.baseOid) {
      setSaving(null);
    }
  }, [saving, branch, head]);

  // A queued draft that leaves the list was merged and its branch deleted.
  const wasQueued = useRef<string | null>(null);
  if (current?.pr?.queued) wasQueued.current = branch;
  const isPublished =
    !onLive &&
    (list.published.has(branch) ||
      publishState.kind === 'done' ||
      (wasQueued.current === branch && !current));
  const leaving = useRef<string | null>(null);
  useEffect(() => {
    if (onLive) leaving.current = null;
    if (!isPublished || !repoInfo || leaving.current === branch) return;
    leaving.current = branch;
    setPublished({
      title: title(branch),
      href: liveHrefFor(config, router.params),
    });
    const live = editHref.replace(
      /\/branch\/[^/]+/,
      '/branch/' + encodeURIComponent(repoInfo.defaultBranch)
    );
    leaveTo(live).finally(resetPublish);
  }, [
    onLive,
    isPublished,
    repoInfo,
    branch,
    title,
    config,
    router,
    editHref,
    leaveTo,
    resetPublish,
  ]);

  const discard = async (draft: Draft) => {
    if (!repoInfo) return;
    const res = await client
      .mutation(DeleteDraft, { id: draft.refId })
      .toPromise();
    if (res.error) throw new Error(explain(res.error.message));
    leaving.current = draft.name;
    if (draft.name === branch) {
      await leaveTo(branchHref(repoInfo.defaultBranch));
    } else {
      list.refresh();
    }
  };

  const value: DraftsValue = {
    drafts: list.drafts,
    current,
    status: draftStatus(current),
    onLive,
    saving,
    setSaving,
    published: onLive ? published : null,
    dismissPublished: () => setPublished(null),
    publishState,
    publish: () => {
      setPublished(null);
      publish();
    },
    discard,
    title,
    editHref,
    reviewHref,
  };
  return (
    <DraftsContext.Provider value={value}>
      {props.children}
    </DraftsContext.Provider>
  );
}

// "Saved 2 min ago" has to move on by itself.
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
