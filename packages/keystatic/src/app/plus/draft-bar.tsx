import { ReactNode } from 'react';

import { ActionButton, Button } from '@keystar/ui/button';
import { Icon } from '@keystar/ui/icon';
import { checkIcon } from '@keystar/ui/icon/icons/checkIcon';
import { circleIcon } from '@keystar/ui/icon/icons/circleIcon';
import { externalLinkIcon } from '@keystar/ui/icon/icons/externalLinkIcon';
import { globeIcon } from '@keystar/ui/icon/icons/globeIcon';
import { xIcon } from '@keystar/ui/icon/icons/xIcon';
import { Box, Flex } from '@keystar/ui/layout';
import { ProgressCircle } from '@keystar/ui/progress';
import { breakpointQueries, css, tokenSchema } from '@keystar/ui/style';
import { Text } from '@keystar/ui/typography';

import { useRouter } from '../router';
import { useConfig } from '../shell/context';
import { previewHrefFor, useDraftsContext, useNow } from './draft-data';
import { savedAgo } from './draft-status';

type Tone = 'neutral' | 'accent' | 'positive' | 'critical';

const toneStyle: Record<Tone, { background: string; border: string }> = {
  neutral: {
    background: tokenSchema.color.background.surfaceSecondary,
    border: tokenSchema.color.border.muted,
  },
  accent: {
    background: tokenSchema.color.background.accent,
    border: tokenSchema.color.border.accent,
  },
  positive: {
    background: tokenSchema.color.background.positive,
    border: tokenSchema.color.border.positive,
  },
  critical: {
    background: tokenSchema.color.background.critical,
    border: tokenSchema.color.border.critical,
  },
};

function Strip(props: {
  tone: Tone;
  alert?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const tone = toneStyle[props.tone];
  return (
    <div
      role={props.alert ? 'alert' : 'status'}
      className={css({
        background: tone.background,
        borderBottom: `${tokenSchema.size.border.regular} solid ${tone.border}`,
        flexShrink: 0,
        paddingBlock: tokenSchema.size.space.regular,
        paddingInline: tokenSchema.size.space.xlarge,
      })}
    >
      <div
        className={css({
          alignItems: 'center',
          display: 'flex',
          flexWrap: 'wrap',
          gap: tokenSchema.size.space.large,
          minHeight: tokenSchema.size.element.regular,
          // With the sidebar open the bar stays one line: the name gives way.
          [breakpointQueries.above.tablet]: { flexWrap: 'nowrap' },
        })}
      >
        {props.children}
      </div>
      {props.footer}
    </div>
  );
}

type StepState = 'done' | 'working' | 'next' | 'failed' | 'waiting';

function Step(props: { state: StepState; children: ReactNode }) {
  const icon = {
    done: <Icon src={checkIcon} color="positive" />,
    working: (
      <ProgressCircle size="small" isIndeterminate aria-label="Working" />
    ),
    next: <Icon src={circleIcon} color="neutralTertiary" />,
    waiting: <Icon src={circleIcon} color="neutralTertiary" />,
    failed: <Icon src={xIcon} color="critical" />,
  }[props.state];
  const color = {
    done: 'neutral',
    working: 'caution',
    next: 'neutralEmphasis',
    waiting: 'neutralSecondary',
    failed: 'critical',
  } as const;
  return (
    <li className={css({ display: 'flex', alignItems: 'center', gap: 6 })}>
      {icon}
      <Text
        color={color[props.state]}
        weight={
          props.state === 'done' || props.state === 'waiting'
            ? 'regular'
            : 'medium'
        }
      >
        {props.children}
      </Text>
    </li>
  );
}

function Steps(props: { children: ReactNode[] }) {
  return (
    <ol
      className={css({
        alignItems: 'center',
        display: 'flex',
        flexShrink: 0,
        flexWrap: 'wrap',
        gap: tokenSchema.size.space.regular,
        listStyle: 'none',
        whiteSpace: 'nowrap',
        margin: 0,
        padding: 0,
      })}
    >
      {props.children.flatMap((step, i) =>
        i === 0
          ? [step]
          : [
              <li
                key={`line-${i}`}
                aria-hidden="true"
                className={css({
                  background: tokenSchema.color.border.accent,
                  height: 1,
                  width: 24,
                })}
              />,
              step,
            ]
      )}
    </ol>
  );
}

function DraftName(props: { name: string }) {
  return (
    <span
      title={props.name}
      className={css({
        color: tokenSchema.color.foreground.neutralEmphasis,
        flex: '0 1 auto',
        fontFamily: tokenSchema.typography.fontFamily.base,
        fontSize: tokenSchema.typography.text.regular.size,
        fontWeight: tokenSchema.typography.fontWeight.semibold,
        maxWidth: 260,
        minWidth: 80,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      })}
    >
      Draft: {props.name}
    </span>
  );
}

function Actions(props: { children: ReactNode }) {
  return (
    <Flex gap="regular" marginStart="auto" flexShrink={0}>
      {props.children}
    </Flex>
  );
}

function ExternalLabel(props: { children: ReactNode }) {
  return (
    <>
      <Text>{props.children}</Text>
      <Icon src={externalLinkIcon} />
    </>
  );
}

// params: branch, <name>, then the page's own route.
function liveHint(params: string[]) {
  if (params.length === 2) {
    return 'Continue a draft below, or edit any page to start a new one.';
  }
  if (
    params[2] === 'pages' ||
    (params[2] === 'collection' && params.length === 4)
  ) {
    return 'New pages and deletions also go into a draft first.';
  }
  return 'Edit any page and save it as a draft. Readers see nothing until you publish.';
}

export function DraftBar() {
  const drafts = useDraftsContext();
  const config = useConfig();
  const router = useRouter();
  const now = useNow();
  if (!drafts) return null;
  const branch = router.params[0] === 'branch' ? router.params[1] : '';
  const { current, status, publishState } = drafts;

  if (drafts.saving && (drafts.onLive || drafts.saving.branch === branch)) {
    return (
      <Strip tone="accent">
        <DraftName name={drafts.saving.title} />
        <Steps>
          {[
            <Step key="saving" state="working">
              Saving your draft…
            </Step>,
          ]}
        </Steps>
      </Strip>
    );
  }

  if (drafts.onLive) {
    const done = drafts.published;
    const channel =
      config.storage.kind !== 'local'
        ? config.storage.announceChannel
        : undefined;
    return done ? (
      <Strip tone="positive">
        <Flex alignItems="center" gap="small">
          <Icon src={checkIcon} color="positive" />
          <Text weight="semibold">“{done.title}” is live.</Text>
        </Flex>
        <Text color="neutralSecondary">
          {channel ? `Posted in ${channel}. ` : ''}Edit any page to start your
          next draft.
        </Text>
        <Actions>
          {done.href && (
            <Button href={done.href} target="_blank" rel="noopener noreferrer">
              <ExternalLabel>See it on the site</ExternalLabel>
            </Button>
          )}
          <ActionButton
            prominence="low"
            aria-label="Dismiss"
            onPress={drafts.dismissPublished}
          >
            <Icon src={xIcon} />
          </ActionButton>
        </Actions>
      </Strip>
    ) : (
      <Strip tone="neutral">
        <Flex alignItems="center" gap="small">
          <Icon src={globeIcon} color="neutralSecondary" />
          <Text weight="semibold">You're looking at the live site.</Text>
        </Flex>
        <Text color="neutralSecondary">{liveHint(router.params)}</Text>
      </Strip>
    );
  }

  const title = <DraftName name={drafts.title(branch)} />;
  const saved = (
    <Step key="saved" state="done">
      {savedAgo(current?.savedAt, now)}
    </Step>
  );
  const onPage = router.params[4] === 'item';
  const previewHref = current && previewHrefFor(config, current, router.params);
  const publishing = status === 'publishing' || publishState.kind === 'working';
  const error =
    publishState.kind === 'error' ? (
      <Box paddingTop="regular">
        <Text color="critical">{publishState.message}</Text>
      </Box>
    ) : null;

  if (status === 'failed') {
    const checksFailed = !!current?.pr?.queued;
    return (
      <Strip
        tone="critical"
        alert
        footer={
          <Box paddingTop="regular" maxWidth="container.medium">
            <Text color="neutralSecondary">
              {checksFailed
                ? 'The live site is safe: nothing was published. Ask an engineer to look, and share this draft’s name.'
                : 'The live site is safe: nothing was published. This is usually a broken picture or link in your last save. Fix it and save again, or ask an engineer and share this draft’s name.'}
            </Text>
          </Box>
        }
      >
        {title}
        <Steps>
          {[
            saved,
            <Step key="build" state="failed">
              {checksFailed ? 'A check failed' : "Preview didn't build"}
            </Step>,
            <Step key="publish" state="waiting">
              Publish
            </Step>,
          ]}
        </Steps>
        <Actions>
          {current?.failureUrl && (
            <Button
              href={current.failureUrl}
              target="_blank"
              rel="noopener noreferrer"
              tone="critical"
            >
              What went wrong
            </Button>
          )}
          <Button prominence="high" isDisabled>
            Publish
          </Button>
        </Actions>
      </Strip>
    );
  }

  if (publishing) {
    return (
      <Strip tone="accent">
        {title}
        <Steps>
          {[
            saved,
            <Step key="build" state="done">
              Preview ready
            </Step>,
            <Step key="publish" state="working">
              Publishing · about 2 min · you can close this tab
            </Step>,
          ]}
        </Steps>
        <Actions>
          <Button prominence="high" isDisabled>
            Publishing…
          </Button>
        </Actions>
      </Strip>
    );
  }

  const ready = status === 'ready';
  return (
    <Strip tone="accent" footer={error}>
      {title}
      <Steps>
        {[
          saved,
          ready ? (
            <Step key="build" state="done">
              Preview ready
            </Step>
          ) : (
            <Step key="build" state="working">
              Building preview · ~1 min
            </Step>
          ),
          <Step key="publish" state={ready ? 'next' : 'waiting'}>
            {ready ? "Publish when you're happy" : 'Publish'}
          </Step>,
        ]}
      </Steps>
      <Actions>
        <Button
          href={ready ? previewHref : undefined}
          target="_blank"
          rel="noopener noreferrer"
          isDisabled={!ready || !previewHref}
        >
          {ready ? (
            <ExternalLabel>
              {onPage ? 'Preview this page' : 'Preview'}
            </ExternalLabel>
          ) : (
            'Preview'
          )}
        </Button>
        <Button
          prominence="high"
          isDisabled={!ready}
          href={ready ? drafts.reviewHref : undefined}
        >
          Publish…
        </Button>
      </Actions>
    </Strip>
  );
}

// Puts the bar above whatever page the editor shows.
export function WithDraftBar(props: { children: ReactNode }) {
  const drafts = useDraftsContext();
  const router = useRouter();
  if (!drafts) return props.children;
  // The review page carries its own status and buttons.
  if (router.href.endsWith('/publish')) return props.children;
  return (
    <Flex direction="column" height="100%" minHeight={0}>
      <DraftBar />
      <Flex flex minHeight={0}>
        {props.children}
      </Flex>
    </Flex>
  );
}
