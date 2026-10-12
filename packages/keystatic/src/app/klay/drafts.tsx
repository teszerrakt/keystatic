import { ComponentProps, useEffect, useRef, useState } from 'react';

import { Button, ButtonGroup } from '@keystar/ui/button';
import { Dialog, DialogContainer } from '@keystar/ui/dialog';
import { Notice } from '@keystar/ui/notice';
import { Content } from '@keystar/ui/slots';
import { Heading } from '@keystar/ui/typography';

import { Config } from '../../config';
import { useConfig } from '../shell/context';
import { useBranches, useCurrentBranch, useRepoInfo } from '../shell/data';
import { getBranchPrefix } from '../utils';
import { useCreateDraft } from './draft-commit';
import { useDraftsContext } from './draft-data';

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

export function useNewDraftName() {
  const config = useConfig();
  const branches = useBranches();
  return (page: string | undefined) =>
    uniqueDraftName(draftPrefix(config), page, branches);
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
  const createDraft = useCreateDraft();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !repoInfo || !drafts) return;
    started.current = true;
    const name = uniqueDraftName(
      draftPrefix(config),
      props.suggestedName,
      branches
    );
    // Without handed-off changes the editor commits once the branch exists.
    const changes = drafts.handoff.changesOn(props.branchOid);
    createDraft(name, props.branchOid, changes).then(
      () => {
        if (changes) drafts.handoff.committed(name);
        props.onCreate(name);
      },
      (e: Error) => setError(e.message)
    );
  });

  return (
    <DialogContainer onDismiss={props.onDismiss}>
      {error && (
        <Dialog size="small">
          <Heading>Your draft was not saved</Heading>
          <Content>
            <Notice tone="critical">{error}</Notice>
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
