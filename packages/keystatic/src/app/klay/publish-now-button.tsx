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

import { Config } from '../../config';
import { getCollectionFormat, getCollectionItemPath } from '../path-utils';
import { useChanged, useTree } from '../shell/data';
import { serializeEntryToFiles } from '../updating';
import { getSlugFromState } from '../utils';
import { usePageForm } from './page-form';
import { pageTitleFrom } from './page-title';
import { publishNowPlan, PublishNowPlan } from './publish-now';
import { draftChanges, useLanguageOf } from './review-data';

type Page = {
  collection: string;
  slug: string;
  state: Record<string, unknown>;
};

// Reads the draft and serializes the page, so it runs when the menu opens.
function usePlanPublishNow(config: Config, page: Page) {
  const trees = useTree();
  const changed = useChanged();
  const extras = usePageForm()?.extras;
  return (): PublishNowPlan => {
    if (trees.merged.kind !== 'loaded') {
      return { allowed: false, page: 'changed', pictures: [] };
    }
    const { current, default: live } = trees.merged.data;
    const collection = config.collections![page.collection];
    const slug = getSlugFromState(collection, page.state);
    const [own, ...others] = serializeEntryToFiles({
      basePath: getCollectionItemPath(config, page.collection, slug),
      format: getCollectionFormat(config, page.collection),
      schema: collection.schema,
      state: page.state,
      slug: { field: collection.slugField, value: slug },
    });
    return publishNowPlan({
      page,
      ...draftChanges(config, changed, current, live),
      saving: [...others, ...(extras?.files() ?? [])].map(f => f.path),
      pageText: new TextDecoder().decode(own.contents),
      isLive: path => live.entries.has(path),
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

// The page editor's save button, with Publish now in its menu.
export function SaveSplitButton(props: {
  formID: string;
  label: string;
  isDisabled: boolean;
  onSave: () => void;
  onPublishNow: () => void;
  config: Config;
  page: Page;
}) {
  const language = useLanguageOf();
  const planNow = usePlanPublishNow(props.config, props.page);
  const [plan, setPlan] = useState<PublishNowPlan | null>(null);
  const [confirming, setConfirming] = useState(false);
  const title = pageTitleFrom(
    props.config.collections![props.page.collection],
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
          if (open) setPlan(planNow());
        }}
        menu={
          <Menu
            disabledKeys={plan?.allowed ? [] : ['now']}
            onAction={key => {
              if (key === 'save') props.onSave();
              else setConfirming(true);
            }}
          >
            <Item key="save" textValue={props.label}>
              <Icon src={gitBranchIcon} />
              <Text>{props.label}</Text>
              <Text slot="description">
                Preview it first, publish when you're happy.
              </Text>
            </Item>
            <Item key="now" textValue="Publish now">
              <Icon src={zapIcon} />
              <Text>Publish now</Text>
              <Text slot="description">
                {plan?.allowed
                  ? 'For small fixes. Skips the preview, live in about 2 minutes.'
                  : 'This draft also changes other pages. Publish now is for one page and its pictures. Use Publish… in the bar above.'}
              </Text>
            </Item>
          </Menu>
        }
      >
        {props.label}
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
