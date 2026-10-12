import { useState } from 'react';

import { ActionButton } from '@keystar/ui/button';
import { DialogContainer } from '@keystar/ui/dialog';
import { Icon } from '@keystar/ui/icon';
import { chevronsUpDownIcon } from '@keystar/ui/icon/icons/chevronsUpDownIcon';
import { globeIcon } from '@keystar/ui/icon/icons/globeIcon';
import { trash2Icon } from '@keystar/ui/icon/icons/trash2Icon';
import { Flex } from '@keystar/ui/layout';
import { Item, Menu, MenuTrigger, Section } from '@keystar/ui/menu';
import { ClearSlots } from '@keystar/ui/slots';
import { css, tokenSchema } from '@keystar/ui/style';
import { Text } from '@keystar/ui/typography';

import { useRouter } from '../router';
import { useConfig } from '../shell/context';
import { useCurrentBranch, useRepoInfo } from '../shell/data';
import { useViewer } from '../shell/viewer-data';
import { DiscardDialog } from './discard';
import { useDraftsContext, useNow } from './draft-data';
import {
  Draft,
  DraftStatus,
  draftStatus,
  savedAgo,
  statusLabel,
} from './draft-status';

const DISCARD = 'plus:discard';
const dotIcon = <circle cx={12} cy={12} r={3} strokeWidth={6} />;

const statusColor = {
  live: 'neutralSecondary',
  building: 'caution',
  ready: 'accent',
  publishing: 'accent',
  failed: 'critical',
} as const;

const mineNote: Record<DraftStatus, string> = {
  building: 'not published',
  ready: 'not published',
  failed: 'needs a fix',
  publishing: 'publishing',
};

// Replaces the branch picker and git menu: writers pick a draft, not a branch.
export function DraftSwitcher() {
  const drafts = useDraftsContext();
  const config = useConfig();
  const repoInfo = useRepoInfo();
  const branch = useCurrentBranch();
  const viewer = useViewer();
  const router = useRouter();
  const now = useNow();
  const [discarding, setDiscarding] = useState<Draft | null>(null);
  if (!drafts || !repoInfo) return null;

  const live = repoInfo.defaultBranch;
  const isMine = (d: Draft | undefined) =>
    !d || !viewer || d.author === viewer.login;
  const mine = drafts.drafts.filter(isMine);
  const others = drafts.drafts.filter(d => !isMine(d));
  const site =
    config.storage.kind !== 'local' && config.storage.siteUrl
      ? config.storage.siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
      : 'What readers see now';

  const { current, status } = drafts;
  const title = drafts.onLive ? 'Live site' : drafts.title(branch);
  const subtitle = drafts.onLive
    ? site
    : isMine(current)
    ? `Your draft · ${mineNote[status]}`
    : `${current?.author}'s draft`;
  const canDiscard = !!current && isMine(current) && status !== 'publishing';

  const draftItem = (d: Draft, showAuthor: boolean) => {
    const s = draftStatus(d);
    return (
      <Item key={d.name} textValue={drafts.title(d.name)}>
        <Icon src={dotIcon} color={statusColor[s]} />
        <Text>{drafts.title(d.name)}</Text>
        <Text slot="description">
          {showAuthor ? `${d.author ?? 'Someone'} · ` : ''}
          {savedAgo(d.savedAt, now)}
        </Text>
        <Text slot="kbd" size="small" color={statusColor[s]}>
          {statusLabel[s]}
        </Text>
      </Item>
    );
  };

  return (
    <Flex paddingY="regular" paddingX="medium">
      <MenuTrigger>
        <ActionButton
          aria-label={`${title}, ${subtitle}. Switch draft`}
          UNSAFE_className={css({
            height: 'auto',
            justifyContent: 'start',
            minHeight: 52,
            paddingBlock: tokenSchema.size.space.regular,
            textAlign: 'start',
            width: '100%',
          })}
        >
          <ClearSlots>
            <Flex alignItems="center" gap="regular" flex minWidth={0}>
              <Icon
                src={dotIcon}
                size="small"
                color={drafts.onLive ? 'neutralSecondary' : statusColor[status]}
              />
              <Flex direction="column" flex minWidth={0} gap="small">
                <Text weight="semibold" truncate>
                  {title}
                </Text>
                <Text size="small" color="neutralSecondary" truncate>
                  {subtitle}
                </Text>
              </Flex>
              <Icon src={chevronsUpDownIcon} color="neutralSecondary" />
            </Flex>
          </ClearSlots>
        </ActionButton>
        <Menu
          selectionMode="single"
          selectedKeys={[branch]}
          onAction={key => {
            if (key === DISCARD) {
              setDiscarding(current ?? null);
              return;
            }
            router.push(
              router.href.replace(
                /\/branch\/[^/]+/,
                '/branch/' + encodeURIComponent(String(key))
              )
            );
          }}
        >
          <Section key="live" aria-label="Live site">
            <Item key={live} textValue="Live site">
              <Icon src={globeIcon} />
              <Text>Live site</Text>
              <Text slot="description">What readers see now</Text>
            </Item>
          </Section>
          {mine.length ? (
            <Section key="mine" title="Your drafts">
              {mine.map(d => draftItem(d, false))}
            </Section>
          ) : null}
          {others.length ? (
            <Section key="others" title="Other writers">
              {others.map(d => draftItem(d, true))}
            </Section>
          ) : null}
          {canDiscard ? (
            <Section key="actions" aria-label="Draft actions">
              <Item key={DISCARD} textValue={`Discard ${title}`}>
                <Icon src={trash2Icon} color="critical" />
                <Text color="critical">Discard “{title}”…</Text>
              </Item>
            </Section>
          ) : null}
        </Menu>
      </MenuTrigger>
      <DialogContainer onDismiss={() => setDiscarding(null)}>
        {discarding && <DiscardDialog draft={discarding} />}
      </DialogContainer>
    </Flex>
  );
}
