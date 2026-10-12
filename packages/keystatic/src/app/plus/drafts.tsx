import { ComponentProps, useEffect, useRef } from 'react';

import { Button, ButtonGroup } from '@keystar/ui/button';
import { Dialog, DialogContainer } from '@keystar/ui/dialog';
import { Notice } from '@keystar/ui/notice';
import { Content } from '@keystar/ui/slots';
import { Heading } from '@keystar/ui/typography';

import { Config } from '../../config';
import {
  prettyErrorForCreateBranchMutation,
  useCreateBranchMutation,
} from '../branch-selection';
import { useConfig } from '../shell/context';
import { useBranches, useCurrentBranch, useRepoInfo } from '../shell/data';
import { getBranchPrefix } from '../utils';
import { useDraftsContext } from './draft-data';
import { draftTitle } from './draft-status';

export function isDraftsOnly(config: Config) {
  return config.storage.kind !== 'local' && !!config.storage.draftsOnly;
}

export function draftPrefix(config: Config) {
  return getBranchPrefix(config) ?? 'draft/';
}

export function uniqueDraftName(
  prefix: string,
  page: string | undefined,
  taken: { has(name: string): boolean }
) {
  const base =
    (page ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'page';
  let name = prefix + base;
  for (let n = 2; taken.has(name); n++) name = `${prefix}${base}-${n}`;
  return name;
}

// Writers never name branches: the draft bar shows the save, and a dialog
// opens only if GitHub refuses the new branch.
export function BranchDialogContainer(
  props: ComponentProps<typeof DialogContainer>
) {
  return isDraftsOnly(useConfig()) ? (
    <>{props.children}</>
  ) : (
    <DialogContainer {...props} />
  );
}

export function AutoDraftBranchDialog(props: {
  branchOid: string;
  onCreate: (branchName: string) => void;
  onDismiss: () => void;
  suggestedName?: string;
}) {
  const config = useConfig();
  const repoInfo = useRepoInfo();
  const branches = useBranches();
  const drafts = useDraftsContext();
  const [{ error }, createBranch] = useCreateBranchMutation();
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !repoInfo) return;
    started.current = true;
    const prefix = draftPrefix(config);
    const name = uniqueDraftName(prefix, props.suggestedName, branches);
    const saving = {
      title: draftTitle(name, prefix),
      baseOid: props.branchOid,
    };
    drafts?.setSaving({ ...saving, branch: null });
    createBranch({
      input: {
        name: `refs/heads/${name}`,
        oid: props.branchOid,
        repositoryId: repoInfo.id,
      },
    }).then(result => {
      if (result.data?.createRef?.__typename) {
        drafts?.setSaving({ ...saving, branch: name });
        props.onCreate(name);
      } else {
        drafts?.setSaving(null);
      }
    });
  });

  return (
    <DialogContainer onDismiss={props.onDismiss}>
      {error && (
        <Dialog size="small">
          <Heading>Your draft was not saved</Heading>
          <Content>
            <Notice tone="critical">
              {prettyErrorForCreateBranchMutation(error)}
            </Notice>
          </Content>
          <ButtonGroup>
            <Button onPress={props.onDismiss}>Close</Button>
          </ButtonGroup>
        </Dialog>
      )}
    </DialogContainer>
  );
}

export function useDraftSaveCopy() {
  const config = useConfig();
  const branch = useCurrentBranch();
  const repoInfo = useRepoInfo();
  if (!isDraftsOnly(config)) return null;
  const live = branch === repoInfo?.defaultBranch;
  return {
    save: live ? 'Save as draft' : 'Save draft',
    unsaved: 'Unsaved changes',
    saved: live ? null : 'All changes saved',
  };
}
