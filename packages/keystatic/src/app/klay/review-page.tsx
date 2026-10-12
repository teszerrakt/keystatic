import { ReactNode, useState } from 'react';

import { Badge } from '@keystar/ui/badge';
import { ActionButton, Button } from '@keystar/ui/button';
import { Icon } from '@keystar/ui/icon';
import { alertTriangleIcon } from '@keystar/ui/icon/icons/alertTriangleIcon';
import { arrowLeftIcon } from '@keystar/ui/icon/icons/arrowLeftIcon';
import { checkIcon } from '@keystar/ui/icon/icons/checkIcon';
import { xIcon } from '@keystar/ui/icon/icons/xIcon';
import { Box, Flex } from '@keystar/ui/layout';
import { TextLink } from '@keystar/ui/link';
import { ProgressCircle } from '@keystar/ui/progress';
import { css, tokenSchema } from '@keystar/ui/style';
import { Heading, Text } from '@keystar/ui/typography';

import { useRouter } from '../router';
import { useConfig } from '../shell/context';
import { useCurrentBranch } from '../shell/data';
import { previewHrefFor, useDraftsContext } from './draft-data';
import { Group, GroupKey, Problem, totalChanges } from './review';
import { useDraftReview } from './review-data';

const SHOWN = 5;

const tone: Record<GroupKey, 'accent' | 'caution' | 'critical' | 'neutral'> = {
  new: 'accent',
  edited: 'caution',
  deleted: 'critical',
  pictures: 'neutral',
  other: 'neutral',
};

const card = css({
  background: tokenSchema.color.background.canvas,
  border: `${tokenSchema.size.border.regular} solid ${tokenSchema.color.border.muted}`,
  borderRadius: tokenSchema.size.radius.large,
});

const row = css({
  alignItems: 'center',
  borderTop: `${tokenSchema.size.border.regular} solid ${tokenSchema.color.border.muted}`,
  display: 'grid',
  gap: tokenSchema.size.space.regular,
  gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr) 80px',
  minHeight: 44,
  paddingInline: tokenSchema.size.space.large,
});

function GroupCard(props: { group: Group; branch: string }) {
  const config = useConfig();
  const drafts = useDraftsContext();
  const [all, setAll] = useState(false);
  const { group } = props;
  const rows = all ? group.rows : group.rows.slice(0, SHOWN);
  const more = group.rows.length - SHOWN;
  const base = `/keystatic/branch/${encodeURIComponent(props.branch)}`;
  return (
    <details open className={card}>
      <summary
        className={css({
          alignItems: 'center',
          cursor: 'pointer',
          display: 'flex',
          gap: tokenSchema.size.space.regular,
          minHeight: 48,
          paddingInline: tokenSchema.size.space.large,
        })}
      >
        <Badge tone={tone[group.key]}>{group.label}</Badge>
        <Text color="neutralSecondary">{group.rows.length}</Text>
      </summary>
      {rows.map(r => {
        const preview =
          r.page && drafts?.current
            ? previewHrefFor(config, drafts.current, [
                'branch',
                props.branch,
                'collection',
                r.page.collection,
                'item',
                r.page.slug,
              ])
            : undefined;
        return (
          <div key={r.key} className={row}>
            {r.page ? (
              <TextLink
                href={`${base}/collection/${encodeURIComponent(
                  r.page.collection
                )}/item/${encodeURIComponent(r.page.slug)}`}
              >
                {r.title}
              </TextLink>
            ) : (
              <Text weight="medium">{r.title}</Text>
            )}
            <Text color="neutralSecondary" truncate>
              {r.detail}
            </Text>
            <Box UNSAFE_className={css({ textAlign: 'end' })}>
              {preview && drafts?.status === 'ready' && (
                <TextLink
                  href={preview}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Preview
                </TextLink>
              )}
            </Box>
          </div>
        );
      })}
      {more > 0 && (
        <div className={row}>
          <ActionButton prominence="low" onPress={() => setAll(!all)}>
            {all ? 'Show fewer' : `Show ${more} more`}
          </ActionButton>
        </div>
      )}
    </details>
  );
}

function CheckLine(props: {
  icon: ReactNode;
  color: 'positive' | 'critical' | 'caution' | 'neutralSecondary';
  children: ReactNode;
}) {
  return (
    <Flex alignItems="center" gap="regular">
      {props.icon}
      <Text color={props.color}>{props.children}</Text>
    </Flex>
  );
}

function problemText(p: Problem) {
  if (p.kind === 'deleted-page') {
    return (
      <>
        “{p.from.title}” links to <strong>{p.target}</strong>, which this draft
        deletes.
      </>
    );
  }
  if (p.kind === 'missing-picture') {
    return (
      <>
        “{p.from.title}” uses a picture that isn't there:{' '}
        <strong>{p.target.split('/').pop()}</strong>.
      </>
    );
  }
  return (
    <>
      “{p.from.title}” links to <strong>{p.target}</strong>, which doesn't
      exist.
    </>
  );
}

function Checks(props: { problems: Problem[] | undefined; branch: string }) {
  const drafts = useDraftsContext();
  const status = drafts?.status;
  const base = `/keystatic/branch/${encodeURIComponent(props.branch)}`;
  const build =
    status === 'failed' ? (
      <CheckLine icon={<Icon src={xIcon} color="critical" />} color="critical">
        The preview didn't build, so this draft can't be published yet.{' '}
        {drafts?.current?.failureUrl && (
          <TextLink
            href={drafts.current.failureUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            What went wrong
          </TextLink>
        )}
      </CheckLine>
    ) : status === 'building' ? (
      <CheckLine
        icon={
          <ProgressCircle size="small" isIndeterminate aria-label="Working" />
        }
        color="caution"
      >
        The preview is still building. You can publish once it's ready.
      </CheckLine>
    ) : null;

  if (!props.problems) {
    return (
      <Flex direction="column" gap="regular">
        {build}
        <CheckLine
          icon={
            <ProgressCircle size="small" isIndeterminate aria-label="Working" />
          }
          color="neutralSecondary"
        >
          Checking links…
        </CheckLine>
      </Flex>
    );
  }
  if (!props.problems.length) {
    return (
      build ?? (
        <CheckLine
          icon={<Icon src={checkIcon} color="positive" />}
          color="positive"
        >
          Nothing to check: no broken links, preview built.
        </CheckLine>
      )
    );
  }
  const n = props.problems.length;
  return (
    <Flex direction="column" gap="regular">
      {build}
      <section aria-labelledby="klay-checks">
        <Heading id="klay-checks" size="small" marginBottom="large">
          {n === 1 ? '1 thing to check' : `${n} things to check`}
        </Heading>
        <Flex direction="column" gap="regular">
          {props.problems.map((p, i) => (
            <div
              key={i}
              className={css({
                alignItems: 'center',
                background: tokenSchema.color.background.caution,
                borderRadius: tokenSchema.size.radius.medium,
                display: 'flex',
                flexWrap: 'wrap',
                gap: tokenSchema.size.space.regular,
                padding: tokenSchema.size.space.medium,
              })}
            >
              <Icon src={alertTriangleIcon} color="caution" />
              <Text flex>{problemText(p)}</Text>
              <TextLink
                href={`${base}/collection/${encodeURIComponent(
                  p.from.page.collection
                )}/item/${encodeURIComponent(p.from.page.slug)}`}
              >
                Open “{p.from.title}”
              </TextLink>
            </div>
          ))}
        </Flex>
      </section>
    </Flex>
  );
}

export function ReviewPage() {
  const drafts = useDraftsContext();
  const branch = useCurrentBranch();
  const router = useRouter();
  const review = useDraftReview();
  if (!drafts) return null;

  if (drafts.onLive) {
    return (
      <Flex direction="column" padding="xlarge" gap="regular">
        <Heading>Nothing to publish</Heading>
        <Text>You're on the live site. Open a draft to publish it.</Text>
      </Flex>
    );
  }

  const groups = review.kind === 'loaded' ? review.groups : [];
  const total = totalChanges(groups);
  const publishing =
    drafts.status === 'publishing' || drafts.publishState.kind === 'working';
  const canPublish = drafts.status === 'ready' && total > 0 && !publishing;
  const back = drafts.editHref;

  return (
    <Flex
      elementType="main"
      direction="column"
      height="100%"
      minHeight={0}
      flex
    >
      <Box
        borderBottom="muted"
        backgroundColor="canvas"
        paddingX="xxlarge"
        paddingTop="xlarge"
        paddingBottom="large"
      >
        <Flex direction="column" gap="large" alignItems="start">
          <TextLink href={back}>
            <Flex alignItems="center" gap="small" elementType="span">
              <Icon src={arrowLeftIcon} />
              Back to editing
            </Flex>
          </TextLink>
          <Heading elementType="h1" size="large">
            Review and publish “{drafts.title(branch)}”
          </Heading>
          {review.kind === 'loaded' && (
            <Flex gap="small" wrap>
              <Badge>
                <Text weight="semibold">
                  {total === 1 ? '1 change' : `${total} changes`}
                </Text>
              </Badge>
              {groups.map(g => (
                <Badge key={g.key} tone={tone[g.key]}>
                  {g.short}
                </Badge>
              ))}
            </Flex>
          )}
        </Flex>
      </Box>

      <Box
        flex
        minHeight={0}
        overflow="auto"
        paddingX="xxlarge"
        paddingY="xlarge"
      >
        {review.kind === 'loading' ? (
          <ProgressCircle isIndeterminate aria-label="Loading changes" />
        ) : (
          <Flex direction="column" gap="large" maxWidth="container.large">
            <Box paddingBottom="regular">
              <Checks problems={review.problems} branch={branch} />
            </Box>
            {total === 0 && (
              <Text>
                This draft has no changes yet. Edit a page and save it first.
              </Text>
            )}
            {groups.map(g => (
              <GroupCard key={g.key} group={g} branch={branch} />
            ))}
            {drafts.publishState.kind === 'error' && (
              <Text color="critical">{drafts.publishState.message}</Text>
            )}
          </Flex>
        )}
      </Box>

      <Box
        borderTop="muted"
        backgroundColor="canvas"
        paddingX="xxlarge"
        paddingY="large"
      >
        <Flex alignItems="center" gap="regular" wrap>
          <Text flex>
            Klay checks the site first, then it goes live. About two minutes.
            You can close this tab.
          </Text>
          <Button href={back}>Keep editing</Button>
          <Button
            prominence="high"
            isDisabled={!canPublish}
            onPress={() => {
              drafts.publish();
              router.push(back);
            }}
          >
            {publishing
              ? 'Publishing…'
              : total === 1
              ? 'Publish 1 change'
              : `Publish ${total} changes`}
          </Button>
        </Flex>
      </Box>
    </Flex>
  );
}
