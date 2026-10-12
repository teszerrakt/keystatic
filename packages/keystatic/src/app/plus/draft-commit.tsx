import { gql } from '@ts-gql/tag/no-transform';
import { useClient } from 'urql';

import {
  prettyErrorForCreateBranchMutation,
  useCreateBranchMutation,
} from '../branch-selection';
import { getPathPrefix } from '../path-utils';
import { useConfig } from '../shell/context';
import { useBranches, useCurrentBranch, useRepoInfo } from '../shell/data';
import { useDraftsContext } from './draft-data';
import { draftTitle } from './draft-status';
import { draftPrefix, uniqueDraftName } from './drafts';

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

// Commits to the open draft, or on the live site to a new draft from its head,
// then reloads the shell and opens `href(branch)`.
export function useCommitToDraft() {
  const config = useConfig();
  const client = useClient();
  const repoInfo = useRepoInfo();
  const branches = useBranches();
  const branch = useCurrentBranch();
  const drafts = useDraftsContext();
  const [, createBranch] = useCreateBranchMutation();
  return async (input: {
    draftName: string;
    headline: string;
    // Base64 contents, paths relative to the content root.
    additions: DraftFile[];
    href: (branch: string) => string;
  }) => {
    if (!repoInfo || !drafts) return;
    const prefix = getPathPrefix(config.storage) ?? '';
    const onLive = branch === repoInfo.defaultBranch;
    const head = branches.get(branch)?.commitSha ?? '';
    let target = branch;
    if (onLive) {
      target = uniqueDraftName(draftPrefix(config), input.draftName, branches);
      const saving = {
        title: draftTitle(target, draftPrefix(config)),
        baseOid: head,
      };
      drafts.setSaving({ ...saving, branch: null });
      const created = await createBranch({
        input: {
          name: `refs/heads/${target}`,
          oid: head,
          repositoryId: repoInfo.id,
        },
      });
      if (!created.data?.createRef?.__typename) {
        drafts.setSaving(null);
        throw new Error(
          prettyErrorForCreateBranchMutation(created.error) ??
            'GitHub did not start the draft.'
        );
      }
      drafts.setSaving({ ...saving, branch: target });
    }
    const res = await client
      .mutation(CommitFiles, {
        input: {
          branch: {
            repositoryNameWithOwner: `${repoInfo.owner}/${repoInfo.name}`,
            branchName: target,
          },
          expectedHeadOid: head,
          message: { headline: input.headline },
          fileChanges: {
            additions: input.additions.map(a => ({
              path: prefix + a.path,
              contents: a.contents,
            })),
          },
        },
      })
      .toPromise();
    if (res.error) {
      if (onLive) drafts.setSaving(null);
      throw new Error(res.error.message.replace(/^\[GraphQL\] /, ''));
    }
    await drafts.leaveTo(input.href(target));
  };
}
