import { useState } from 'react';

import { Badge } from '@keystar/ui/badge';
import { SplitButton } from '@keystar/ui/button';
import { AlertDialog, DialogContainer } from '@keystar/ui/dialog';
import { Icon } from '@keystar/ui/icon';
import { gitBranchIcon } from '@keystar/ui/icon/icons/gitBranchIcon';
import { zapIcon } from '@keystar/ui/icon/icons/zapIcon';
import { Flex } from '@keystar/ui/layout';
import { Item, Menu } from '@keystar/ui/menu';
import { css, tokenSchema } from '@keystar/ui/style';
import { Text } from '@keystar/ui/typography';

import {
  getCollectionFormat,
  getCollectionItemPath,
  getCollectionPath,
} from '../path-utils';
import { useConfig } from '../shell/context';
import { useChanged, useTree } from '../shell/data';
import { blobSha } from '../trees';
import { entryFiles } from '../updating';
import { getSlugFromState } from '../utils';
import { useDraftSaveCopy } from './drafts';
import { usePageForm } from './page-form';
import { pageTitleFrom } from './page-title';
import { publishNowPlan, PublishNowPlan } from './publish-now';
import { draftChanges, FileChange, PICTURE } from './review';
import { useLanguageOf } from './review-data';

type Page = {
  collection: string;
  slug: string;
  state: Record<string, unknown>;
  // The entry's files as loaded, under the content root.
  initialFiles: string[];
};

// Reads the draft and serializes the page, so it runs when the menu opens.
function usePlanPublishNow(page: Page) {
  const config = useConfig();
  const trees = useTree();
  const changed = useChanged();
  const extras = usePageForm()?.extras;
  return async (): Promise<PublishNowPlan> => {
    if (trees.merged.kind !== 'loaded') {
      return { allowed: false, page: 'changed', pictures: [] };
    }
    const { current, default: live } = trees.merged.data;
    const collection = config.collections![page.collection];
    const slug = getSlugFromState(collection, page.state);
    const [own, ...others] = entryFiles({
      basePath: getCollectionItemPath(config, page.collection, slug),
      format: getCollectionFormat(config, page.collection),
      schema: collection.schema,
      state: page.state,
      slug: { field: collection.slugField, value: slug },
      extras,
    });
    const saving: FileChange[] = [];
    for (const f of others) {
      const liveSha = live.entries.get(f.path)?.sha;
      const sha = await blobSha(f.contents);
      if (liveSha !== sha) {
        saving.push({ path: f.path, kind: liveSha ? 'changed' : 'added' });
      }
    }
    // Other files the save drops are this page's own; only pictures show.
    const kept = new Set([own, ...others].map(f => f.path));
    const dropped: string[] = [];
    for (const path of page.initialFiles) {
      if (kept.has(path)) continue;
      if (!live.entries.has(path)) dropped.push(path);
      else if (PICTURE.test(path)) saving.push({ path, kind: 'removed' });
    }
    return publishNowPlan({
      page,
      ...draftChanges({
        collections: changed.collections,
        current: current.entries,
        base: live.entries,
        dirs: Object.keys(config.collections ?? {}).map(c =>
          getCollectionPath(config, c)
        ),
      }),
      saving,
      dropped,
      pageText: new TextDecoder().decode(own.contents),
    });
  };
}

const list = css({
  background: tokenSchema.color.background.canvas,
  border: `${tokenSchema.size.border.regular} solid ${tokenSchema.color.border.muted}`,
  borderRadius: tokenSchema.size.radius.large,
  overflow: 'hidden',
});

const row = css({
  alignItems: 'center',
  display: 'grid',
  gap: tokenSchema.size.space.regular,
  gridTemplateColumns: '96px minmax(0, 1fr) auto',
  minHeight: 44,
  paddingInline: tokenSchema.size.space.large,
  '& + &': {
    borderTop: `${tokenSchema.size.border.regular} solid ${tokenSchema.color.border.muted}`,
  },
});

function Row(props: {
  badge: string;
  tone?: 'accent' | 'caution';
  title: string;
  detail: string;
}) {
  return (
    <div className={row}>
      <Flex>
        <Badge tone={props.tone}>{props.badge}</Badge>
      </Flex>
      <Text weight="medium" truncate>
        {props.title}
      </Text>
      <Text color="neutralSecondary">{props.detail}</Text>
    </div>
  );
}

const pictureBadge = {
  added: 'New picture',
  changed: 'Changed picture',
  removed: 'Deleted picture',
};

export function SaveSplitButton(props: {
  formID: string;
  isDisabled: boolean;
  onSave: () => void;
  onPublishNow: () => void;
  page: Page;
}) {
  const config = useConfig();
  const label = useDraftSaveCopy()?.save ?? '';
  const language = useLanguageOf();
  const planNow = usePlanPublishNow(props.page);
  const [plan, setPlan] = useState<PublishNowPlan | null>(null);
  const [confirming, setConfirming] = useState(false);
  const title = pageTitleFrom(
    config.collections![props.page.collection],
    props.page.state,
    props.page.slug
  );
  return (
    <>
      <SplitButton
        type="submit"
        form={props.formID}
        prominence="high"
        isDisabled={props.isDisabled}
        menuLabel="More save options"
        onOpenChange={open => {
          if (!open) return;
          setPlan(null);
          planNow().then(setPlan);
        }}
        menu={
          <Menu
            disabledKeys={plan?.allowed ? [] : ['now']}
            onAction={key => {
              if (key === 'save') props.onSave();
              else setConfirming(true);
            }}
          >
            <Item key="save" textValue={label}>
              <Icon src={gitBranchIcon} />
              <Text>{label}</Text>
              <Text slot="description">
                Preview it first, publish when you're happy.
              </Text>
            </Item>
            <Item key="now" textValue="Publish now">
              <Icon src={zapIcon} />
              <Text>Publish now</Text>
              <Text slot="description">
                {!plan || plan.allowed
                  ? 'For small fixes. Skips the preview, live in about 2 minutes.'
                  : 'This draft also changes other pages. Publish now is for one page and its pictures. Use Publish… in the bar above.'}
              </Text>
            </Item>
          </Menu>
        }
      >
        {label}
      </SplitButton>
      <DialogContainer onDismiss={() => setConfirming(false)}>
        {confirming && plan && (
          <AlertDialog
            title="Publish now?"
            cancelLabel="Cancel"
            primaryActionLabel="Publish now"
            onPrimaryAction={props.onPublishNow}
          >
            <Flex direction="column" gap="large">
              <Text>
                This save goes live in about 2 minutes, without a preview. Klay
                still checks the site first. If a check fails, nothing goes
                live.
              </Text>
              <div className={list}>
                <Row
                  badge={plan.page === 'added' ? 'New' : 'Edited'}
                  tone={plan.page === 'added' ? 'accent' : 'caution'}
                  title={title}
                  detail={language(props.page.collection)}
                />
                {plan.pictures.map(p => (
                  <Row
                    key={p.path}
                    badge={pictureBadge[p.kind]}
                    title={p.title}
                    detail="On this page"
                  />
                ))}
              </div>
            </Flex>
          </AlertDialog>
        )}
      </DialogContainer>
    </>
  );
}
