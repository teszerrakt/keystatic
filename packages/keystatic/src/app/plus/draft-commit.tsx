import { gql } from '@ts-gql/tag/no-transform';
import { useClient } from 'urql';

import { getAuth } from '../auth';
import {
  prettyErrorForCreateBranchMutation,
  useCreateBranchMutation,
} from '../branch-selection';
import { getPathPrefix } from '../path-utils';
import { useRouter } from '../router';
import { useConfig } from '../shell/context';
import { useBranches, useCurrentBranch, useRepoInfo } from '../shell/data';
import { useDraftsContext, useReloadShell } from './draft-data';
import { draftTitle } from './draft-status';
import { draftPrefix } from './drafts';
import { commitOnBase, DraftChanges } from './new-draft';

const CommitFiles = gql`
  mutation PlusCommitFiles($input: CreateCommitOnBranchInput!) {
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
` as import('../../../__generated__/ts-gql/PlusCommitFiles').type;

export type DraftFile = { path: string; contents: string };

// With `changes` the branch starts at a commit that holds them: Workers Builds
// builds every push, and a bare branch's build can finish last and replace
// the preview.
export function useCreateDraft() {
  const config = useConfig();
  const repoInfo = useRepoInfo();
  const drafts = useDraftsContext();
  const [, createBranch] = useCreateBranchMutation();
  return async (
    name: string,
    baseOid: string,
    changes: DraftChanges | null
  ) => {
    if (!repoInfo || !drafts) throw new Error('The editor is still loading.');
    const saving = { title: draftTitle(name, draftPrefix(config)), baseOid };
    drafts.setSaving({ ...saving, branch: null });
    try {
      let oid = baseOid;
      if (changes) {
        const auth = await getAuth(config);
        if (!auth) throw new Error('Sign in again to save a draft.');
        oid = await commitOnBase({
          repo: `${repoInfo.owner}/${repoInfo.name}`,
          token: auth.accessToken,
          baseOid,
          changes,
        });
      }
      const created = await createBranch({
        input: { name: `refs/heads/${name}`, oid, repositoryId: repoInfo.id },
      });
      if (!created.data?.createRef?.__typename) {
        throw new Error(
          prettyErrorForCreateBranchMutation(created.error) ??
            'GitHub did not start the draft.'
        );
      }
    } catch (e) {
      drafts.setSaving(null);
      throw e;
    }
    drafts.setSaving({ ...saving, branch: name });
  };
}

// Commits to the open draft, or on the live site starts the draft `newDraft`,
// then reloads the shell and opens `href(branch)`. Without drafts it commits
// to the current branch, so the change goes live at once.
export function useCommitToDraft() {
  const config = useConfig();
  const client = useClient();
  const repoInfo = useRepoInfo();
  const branches = useBranches();
  const branch = useCurrentBranch();
  const drafts = useDraftsContext();
  const createDraft = useCreateDraft();
  const reload = useReloadShell();
  const router = useRouter();
  return async (input: {
    newDraft: string;
    message: DraftChanges['message'];
    // Paths relative to the content root; base64 contents.
    additions?: DraftFile[];
    deletions?: string[];
    href: (branch: string) => string;
  }) => {
    if (!repoInfo) return;
    const prefix = getPathPrefix(config.storage) ?? '';
    const head = branches.get(branch)?.commitSha ?? '';
    const changes: DraftChanges = {
      message: input.message,
      additions: (input.additions ?? []).map(a => ({
        path: prefix + a.path,
        contents: a.contents,
      })),
      deletions: (input.deletions ?? []).map(p => ({ path: prefix + p })),
    };
    let target = branch;
    if (drafts && branch === repoInfo.defaultBranch) {
      target = input.newDraft;
      await createDraft(target, head, changes);
    } else {
      const res = await client
        .mutation(CommitFiles, {
          input: {
            branch: {
              repositoryNameWithOwner: `${repoInfo.owner}/${repoInfo.name}`,
              branchName: target,
            },
            expectedHeadOid: head,
            message: changes.message,
            fileChanges: {
              additions: changes.additions,
              deletions: changes.deletions,
            },
          },
        })
        .toPromise();
      if (res.error) {
        throw new Error(res.error.message.replace(/^\[GraphQL\] /, ''));
      }
    }
    if (drafts) {
      await drafts.leaveTo(input.href(target));
    } else {
      await reload();
      router.push(input.href(target));
    }
  };
}
