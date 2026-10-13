import { gql } from '@ts-gql/tag/no-transform';
import { ReactNode, useState } from 'react';
import { useQuery } from 'urql';

import { Badge } from '@keystar/ui/badge';
import { ActionButton, Button } from '@keystar/ui/button';
import { DialogContainer } from '@keystar/ui/dialog';
import { Icon } from '@keystar/ui/icon';
import { filePlusIcon } from '@keystar/ui/icon/icons/filePlusIcon';
import { fileTextIcon } from '@keystar/ui/icon/icons/fileTextIcon';
import { Box, Flex } from '@keystar/ui/layout';
import { css, tokenSchema } from '@keystar/ui/style';
import { Heading, Text } from '@keystar/ui/typography';

import { useRouter } from '../router';
import { useConfig } from '../shell/context';
import { useCurrentBranch, useRepoInfo } from '../shell/data';
import { useViewer } from '../shell/viewer-data';
import { DiscardDialog } from './discard';
import { useDraftsContext, useNow } from './draft-data';
import { draftPrefix } from './drafts';
import { Draft, draftStatus } from './draft-status';
import { ago, pageFromCommit } from './pages';
import { useMenuSetup } from './menu-sections-data';
import { useLanguages } from './pages-data';
import { isPublishNow } from './publish-now';
import { humanize } from './review';

const RecentlyPublished = gql`
  query PlusRecentlyPublished($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      id
      pullRequests(
        states: [MERGED]
        first: 20
        orderBy: { field: UPDATED_AT, direction: DESC }
      ) {
        nodes {
          id
          title
          body
          mergedAt
          headRefName
          author {
            login
            ... on User {
              id
            }
          }
        }
      }
    }
  }
` as import('../../../__generated__/ts-gql/PlusRecentlyPublished').type;

// Without drafts every save on the live site is a publish.
const RecentSaves = gql`
  query PlusRecentSaves($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      id
      defaultBranchRef {
        id
        target {
          __typename
          id
          ... on Commit {
            history(first: 30) {
              nodes {
                id
                messageHeadline
                committedDate
                author {
                  name
                  user {
                    id
                    login
                  }
                }
              }
            }
          }
        }
      }
    }
  }
` as import('../../../__generated__/ts-gql/PlusRecentSaves').type;

const card = css({
  alignItems: 'center',
  background: tokenSchema.color.background.canvas,
  border: `${tokenSchema.size.border.regular} solid ${tokenSchema.color.border.muted}`,
  borderRadius: tokenSchema.size.radius.large,
  display: 'flex',
  flexWrap: 'wrap',
  gap: tokenSchema.size.space.large,
  padding: tokenSchema.size.space.large,
});

const tile = css({
  alignItems: 'center',
  background: tokenSchema.color.background.canvas,
  border: `${tokenSchema.size.border.regular} solid ${tokenSchema.color.border.muted}`,
  borderRadius: tokenSchema.size.radius.large,
  color: tokenSchema.color.foreground.neutralEmphasis,
  display: 'flex',
  flex: '1 1 200px',
  fontFamily: tokenSchema.typography.fontFamily.base,
  fontSize: tokenSchema.typography.text.regular.size,
  fontWeight: tokenSchema.typography.fontWeight.medium,
  gap: tokenSchema.size.space.regular,
  minHeight: 64,
  paddingInline: tokenSchema.size.space.large,
  textDecoration: 'none',
  '&:hover': { borderColor: tokenSchema.color.border.neutral },
});

const statusChip = {
  building: { tone: 'caution', label: 'Building preview' },
  ready: { tone: 'positive', label: 'Preview ready' },
  failed: { tone: 'critical', label: 'Needs a fix' },
  publishing: { tone: 'accent', label: 'Publishing' },
} as const;

function Section(props: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={props.id}>
      <Heading id={props.id} size="small" marginBottom="large">
        {props.title}
      </Heading>
      <Flex direction="column" gap="large">
        {props.children}
      </Flex>
    </section>
  );
}

type Published = {
  id: string;
  title: string;
  by: string | undefined;
  at: string | undefined;
  noPreview: boolean;
};

export function HomePage() {
  const drafts = useDraftsContext();
  const config = useConfig();
  const viewer = useViewer();
  const repoInfo = useRepoInfo();
  const branch = useCurrentBranch();
  const languages = useLanguages();
  const menu = useMenuSetup();
  const now = useNow(60_000);
  const router = useRouter();
  const [discarding, setDiscarding] = useState<Draft | null>(null);
  const repo = { owner: repoInfo?.owner ?? '', name: repoInfo?.name ?? '' };
  const [recent] = useQuery({
    query: RecentlyPublished,
    pause: !repoInfo || !drafts,
    variables: repo,
  });
  const [saves] = useQuery({
    query: RecentSaves,
    pause: !repoInfo || !!drafts,
    variables: repo,
  });

  const first = viewer?.name?.split(' ')[0] || viewer?.login;
  const mine = (drafts?.drafts ?? []).filter(
    d => !viewer || d.author === viewer.login
  );
  const prefix = draftPrefix(config);
  const target = saves.data?.repository?.defaultBranchRef?.target;
  const published: Published[] = drafts
    ? (recent.data?.repository?.pullRequests?.nodes ?? [])
        .flatMap(pr => (pr && pr.headRefName.startsWith(prefix) ? [pr] : []))
        .sort((a, b) => (b.mergedAt ?? '').localeCompare(a.mergedAt ?? ''))
        .map(pr => ({
          id: pr.id,
          title: pr.title,
          by: pr.author?.login,
          at: pr.mergedAt ?? undefined,
          noPreview: isPublishNow(pr.body),
        }))
    : (target?.__typename === 'Commit'
        ? target.history.nodes ?? []
        : []
      ).flatMap(c => {
        const page = c && pageFromCommit(c.messageHeadline, languages);
        if (!c || (!page && c.messageHeadline !== `Update ${menu?.path}`)) {
          return [];
        }
        const title = page ? humanize(page.slug) : 'Menu sections';
        return [
          {
            id: c.id,
            title: page?.deleted ? `${title} (deleted)` : title,
            by: c.author?.user?.login ?? c.author?.name ?? undefined,
            at: c.committedDate,
            noPreview: false,
          },
        ];
      });
  const base = `/keystatic/branch/${encodeURIComponent(branch)}`;
  const primary = languages[0]?.collection;

  return (
    <Flex
      elementType="main"
      direction="column"
      height="100%"
      minHeight={0}
      flex
    >
      <Box
        flex
        minHeight={0}
        overflow="auto"
        paddingX="xxlarge"
        paddingY="xxlarge"
      >
        <Flex direction="column" gap="xxlarge" maxWidth="container.medium">
          <Heading elementType="h1" size="large">
            {first ? `Welcome back, ${first}` : 'Welcome back'}
          </Heading>

          {drafts && (
            <Section id="plus-drafts" title="Your unfinished drafts">
              {mine.length === 0 && (
                <Text color="neutralSecondary">
                  You have no drafts. Edit any page to start one.
                </Text>
              )}
              {mine.map(d => {
                const status = draftStatus(d);
                const page = pageFromCommit(d.lastSave, languages);
                const draftBase = `/keystatic/branch/${encodeURIComponent(
                  d.name
                )}`;
                const href =
                  page && !page.deleted
                    ? `${draftBase}/collection/${encodeURIComponent(
                        page.collection
                      )}/item/${encodeURIComponent(page.slug)}`
                    : menu && d.lastSave === `Update ${menu.path}`
                    ? `${draftBase}/menu-sections`
                    : `${draftBase}/pages`;
                return (
                  <article key={d.name} className={card}>
                    <Flex direction="column" gap="regular" flex minWidth={0}>
                      <Text weight="semibold">{drafts.title(d.name)}</Text>
                      <Text size="small" color="neutralSecondary">
                        {[
                          page && humanize(page.slug),
                          `saved ${ago(d.savedAt, now)}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </Flex>
                    <Badge tone={statusChip[status].tone}>
                      {statusChip[status].label}
                    </Badge>
                    {status !== 'publishing' && (
                      <ActionButton
                        prominence="low"
                        onPress={() => setDiscarding(d)}
                      >
                        Discard…
                      </ActionButton>
                    )}
                    <Button href={href}>Continue</Button>
                  </article>
                );
              })}
              {mine.length > 0 && (
                <Text size="small" color="neutralSecondary">
                  A draft keeps everything you saved, for as long as you need.
                  Nobody sees it until you publish.
                </Text>
              )}
            </Section>
          )}

          <Section id="plus-start" title="Start something new">
            <Flex gap="regular" wrap>
              {primary && (
                <a
                  className={tile}
                  href={`${base}/collection/${encodeURIComponent(
                    primary
                  )}/create`}
                  onClick={e => {
                    e.preventDefault();
                    router.push(e.currentTarget.getAttribute('href')!);
                  }}
                >
                  <Icon src={filePlusIcon} />
                  New page
                </a>
              )}
              <a
                className={tile}
                href={`${base}/pages`}
                onClick={e => {
                  e.preventDefault();
                  router.push(e.currentTarget.getAttribute('href')!);
                }}
              >
                <Icon src={fileTextIcon} />
                Edit a page
              </a>
            </Flex>
          </Section>

          <Section id="plus-recent" title="Recently published">
            {published.length === 0 ? (
              <Text color="neutralSecondary">
                Nothing published from the editor yet.
              </Text>
            ) : (
              published.slice(0, 5).map(p => (
                <Flex key={p.id} alignItems="center" gap="regular">
                  <Flex direction="column" gap="small" flex minWidth={0}>
                    <Text weight="medium">{p.title}</Text>
                    <Text size="small" color="neutralSecondary">
                      {[p.by, ago(p.at, now)].filter(Boolean).join(' · ')}
                    </Text>
                  </Flex>
                  {p.noPreview && <Badge>No preview</Badge>}
                </Flex>
              ))
            )}
          </Section>
        </Flex>
      </Box>
      {drafts && (
        <DialogContainer onDismiss={() => setDiscarding(null)}>
          {discarding && <DiscardDialog draft={discarding} />}
        </DialogContainer>
      )}
    </Flex>
  );
}
