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
import { draftPrefix, hasDrafts } from './drafts';
import { previewAlias, previewPlugin, runState } from './preview';
import { Draft, DraftStatus, draftStatus, draftTitle } from './draft-status';
import { saveHandoff } from './new-draft';
import { isPublishNow, publishNowNote } from './publish-now';

export function fillPreviewUrl(template: string, branch: string, slug = '') {
  return template
    .replace('{alias}', previewAlias(branch))
    .replace('{branch}', branch)
    .replace('{slug}', slug);
}

const DraftsQuery = gql`
  query PlusDrafts($owner: String!, $name: String!, $query: String!) {
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
              messageHeadline
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
              deployments(first: 5) {
                nodes {
                  id
                  environment
                  createdAt
                  latestStatus {
                    id
                    state
                    environmentUrl
                    logUrl
                  }
                }
              }
            }
          }
          associatedPullRequests(first: 1, states: [OPEN]) {
            nodes {
              id
              number
              body
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
` as import('../../../__generated__/ts-gql/PlusDrafts').type;

const CreatePullRequest = gql`
  mutation PlusCreatePullRequest($input: CreatePullRequestInput!) {
    createPullRequest(input: $input) {
      pullRequest {
        id
        number
      }
    }
  }
` as import('../../../__generated__/ts-gql/PlusCreatePullRequest').type;

const EnableAutoMerge = gql`
  mutation PlusEnableAutoMerge($id: ID!, $headline: String!, $body: String!) {
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
` as import('../../../__generated__/ts-gql/PlusEnableAutoMerge').type;

const MergePullRequest = gql`
  mutation PlusMergePullRequest($id: ID!, $headline: String!, $body: String!) {
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
` as import('../../../__generated__/ts-gql/PlusMergePullRequest').type;

const UpdatePullRequestBody = gql`
  mutation PlusUpdatePullRequestBody($id: ID!, $body: String!) {
    updatePullRequest(input: { pullRequestId: $id, body: $body }) {
      pullRequest {
        id
      }
    }
  }
` as import('../../../__generated__/ts-gql/PlusUpdatePullRequestBody').type;

const DeleteDraft = gql`
  mutation PlusDeleteDraft($id: ID!) {
    deleteRef(input: { refId: $id }) {
      clientMutationId
    }
  }
` as import('../../../__generated__/ts-gql/PlusDeleteDraft').type;

const PullRequestState = gql`
  query PlusPullRequestState($id: ID!) {
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
` as import('../../../__generated__/ts-gql/PlusPullRequestState').type;

type CheckRun = {
  name: string;
  status: string;
  conclusion: string | null;
  detailsUrl: string | null;
};

const failed = (run: CheckRun) =>
  run.status === 'COMPLETED' &&
  !['SUCCESS', 'NEUTRAL', 'SKIPPED'].includes(run.conclusion ?? '');

function useDraftList(head: string | undefined, branch: string) {
  const config = useConfig();
  const repoInfo = useRepoInfo();
  const prefix = draftPrefix(config);
  const client = useClient();
  const owner = repoInfo?.upstream.owner ?? '';
  const name = repoInfo?.upstream.name ?? '';
  const [result, refetch] = useQuery({
    query: DraftsQuery,
    pause: !repoInfo || !hasDrafts(config),
    variables: { owner, name, query: prefix },
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
      const preview = previewPlugin(config.storage).read({
        branch: ref.name,
        checkRuns: runs,
        deployments:
          commit?.deployments?.nodes?.flatMap(d =>
            d
              ? [
                  {
                    environment: d.environment,
                    createdAt: d.createdAt,
                    state: d.latestStatus?.state,
                    environmentUrl: d.latestStatus?.environmentUrl,
                    logUrl: d.latestStatus?.logUrl,
                  },
                ]
              : []
          ) ?? [],
      });
      const pr = ref.associatedPullRequests?.nodes?.[0];
      drafts.push({
        name: ref.name,
        refId: ref.id,
        author: commit?.author?.user?.login,
        savedAt: commit?.committedDate,
        lastSave: commit?.messageHeadline,
        build: preview.build,
        checks: runState(runs),
        alias: preview.alias ?? previewAlias(ref.name),
        previewUrl: preview.url,
        failureUrl:
          preview.failureUrl ?? runs.find(failed)?.detailsUrl ?? undefined,
        pr: pr
          ? {
              id: pr.id,
              number: pr.number,
              queued: !!pr.autoMergeRequest,
              now: isPublishNow(pr.body),
            }
          : undefined,
      });
    }
    drafts.sort((a, b) => (b.savedAt ?? '').localeCompare(a.savedAt ?? ''));
    return { drafts, published };
  }, [result.data, prefix, config.storage]);

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
  // Resolves once the list holds GitHub's answer.
  const reload = useCallback(
    () =>
      client
        .query(
          DraftsQuery,
          { owner, name, query: prefix },
          { requestPolicy: 'network-only' }
        )
        .toPromise(),
    [client, owner, name, prefix]
  );
  return { drafts, published, missing, refresh, reload };
}

type PublishState =
  | { kind: 'idle' }
  | { kind: 'working'; now: boolean }
  | { kind: 'done' }
  | { kind: 'error'; message: string };

type Publishable = { name: string; pr?: Draft['pr'] };

function usePublish(onDone: () => void, reload: () => Promise<unknown>) {
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

  async function publish(draft: Publishable | undefined, now = false) {
    if (!draft || !repoInfo) return;
    setState({ kind: 'working', now });
    try {
      const body = now ? publishNowNote : 'Published from the docs editor.';
      let id = draft.pr?.id;
      if (id && !!draft.pr?.now !== now) {
        // A pull request left open by the other kind of publish.
        const updated = await client
          .mutation(UpdatePullRequestBody, { id, body })
          .toPromise();
        if (updated.error) throw updated.error;
      }
      if (!id) {
        const created = await client
          .mutation(CreatePullRequest, {
            input: {
              repositoryId: repoInfo.id,
              baseRefName: repoInfo.defaultBranch,
              headRefName: draft.name,
              title: draftTitle(draft.name, draftPrefix(config)),
              body,
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
      // Publish now never does: GitHub reports CLEAN before any check has
      // started, and only auto-merge waits for one (D1).
      if (queued.error) {
        if (now || !(await canMergeNow(id))) throw queued.error;
        const merged = await client
          .mutation(MergePullRequest, { id, ...message })
          .toPromise();
        if (merged.error) throw merged.error;
      }
      // Publish now stays working until the list shows the queued pull
      // request, so its bar never drops back to the preview steps.
      if (now) await reload().catch(() => {});
      setState({ kind: queued.error ? 'done' : 'idle' });
      if (!now) onDone();
    } catch (e) {
      setState({
        kind: 'error',
        message: explain((e as Error).message, now),
      });
    }
  }
  return [state, publish, () => setState({ kind: 'idle' })] as const;
}

function explain(message: string, now = false) {
  const m = message.replace(/^\[GraphQL\] /, '');
  if (/auto-merge is not allowed|not enabled for this repository/i.test(m)) {
    return 'Publishing is switched off for this repository. Ask an admin to allow auto-merge in its GitHub settings.';
  }
  if (now && /is in (clean|unstable) status/i.test(m)) {
    return 'This site has no check for Publish now to wait for. Use Publish… in the bar above.';
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
  if (config.storage.kind === 'local') return undefined;
  const { draftPreviewUrl } = config.storage;
  // The host reported the preview's own address: keep the page's path from
  // the `draftPreviewUrl` pattern and put that address in front.
  if (draft.previewUrl) {
    const origin = draft.previewUrl.replace(/\/+$/, '');
    const page =
      draftPreviewUrl &&
      pageUrl(config, params, t =>
        t.startsWith(draftPreviewUrl)
          ? origin + t.slice(draftPreviewUrl.length)
          : t
      );
    return page?.startsWith(origin) ? page : origin;
  }
  if (!draftPreviewUrl) return undefined;
  const fill = (t: string) =>
    t.replace('{alias}', draft.alias).replace('{branch}', draft.name);
  return pageUrl(config, params, fill) ?? fill(draftPreviewUrl);
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
  // Publishes `branch` without waiting for its preview; checks still apply.
  publishNow: (branch: string) => Promise<void>;
  // Which publish is running on the open draft, if any.
  publishing: 'review' | 'now' | null;
  discard: (draft: Draft) => Promise<void>;
  title: (branch: string) => string;
  // Where "Back to editing" goes from the review page.
  editHref: string;
  reviewHref: string;
  // Reloads the branch heads, then navigates: needed after a commit made here.
  leaveTo: (href: string) => Promise<void>;
  handoff: ReturnType<typeof saveHandoff>;
};

const DraftsContext = createContext<DraftsValue | null>(null);

export function useDraftsContext() {
  return useContext(DraftsContext);
}

export function DraftsProvider(props: { children: ReactNode }) {
  const config = useConfig();
  return hasDrafts(config) ? (
    <DraftsProviderInner>{props.children}</DraftsProviderInner>
  ) : (
    props.children
  );
}

// Refetches the repo, so a page opened after a commit shows it.
export function useReloadShell() {
  const config = useConfig();
  const client = useClient();
  const repoInfo = useRepoInfo();
  return useCallback(async () => {
    if (!repoInfo) return;
    const repo =
      config.storage.kind === 'github'
        ? parseRepoConfig(config.storage.repo)
        : { owner: repoInfo.owner, name: repoInfo.name };
    await client
      .query(GitHubAppShellQuery, repo, { requestPolicy: 'network-only' })
      .toPromise()
      .catch(() => {});
  }, [client, config, repoInfo]);
}

export const branchHref = (branch: string) =>
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
    list.refresh,
    list.reload
  );
  const latest = useRef(list.drafts);
  latest.current = list.drafts;
  const [saving, setSaving] = useState<Saving | null>(null);
  const [handoff] = useState(saveHandoff);
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
  const reload = useReloadShell();
  const leaveTo = useCallback(
    async (href: string) => {
      await reload();
      list.refresh();
      router.push(href);
    },
    [reload, router, list]
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

  // A discarded draft leaves the list at once, and comes back if GitHub
  // refuses. The name is forgotten once the list stops showing it.
  const [discarded, setDiscarded] = useState<string[]>([]);
  const listed = list.drafts.map(d => d.name).join('\n');
  useEffect(() => {
    const names = listed.split('\n');
    setDiscarded(prev =>
      prev.every(n => names.includes(n))
        ? prev
        : prev.filter(n => names.includes(n))
    );
  }, [listed]);

  const discard = async (draft: Draft) => {
    if (!repoInfo) return;
    setDiscarded(prev => [...prev, draft.name]);
    const res = await client
      .mutation(DeleteDraft, { id: draft.refId })
      .toPromise();
    if (res.error) {
      setDiscarded(prev => prev.filter(n => n !== draft.name));
      throw new Error(explain(res.error.message));
    }
    leaving.current = draft.name;
    if (draft.name === branch) {
      await leaveTo(branchHref(repoInfo.defaultBranch));
    } else {
      list.refresh();
    }
  };

  const status = draftStatus(current);
  // A failed check leaves an ordinary draft.
  const publishing = onLive
    ? null
    : publishState.kind === 'working'
    ? publishState.now
      ? 'now'
      : 'review'
    : status === 'publishing'
    ? current?.pr?.now
      ? 'now'
      : 'review'
    : null;

  const value: DraftsValue = {
    drafts: list.drafts.filter(d => !discarded.includes(d.name)),
    current,
    status,
    onLive,
    saving,
    setSaving,
    published: onLive ? published : null,
    dismissPublished: () => setPublished(null),
    publishState,
    publish: () => {
      setPublished(null);
      publish(current);
    },
    publishNow: name => {
      setPublished(null);
      return publish(
        latest.current.find(d => d.name === name) ?? { name },
        true
      );
    },
    publishing,
    discard,
    title,
    editHref,
    reviewHref,
    leaveTo,
    handoff,
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
