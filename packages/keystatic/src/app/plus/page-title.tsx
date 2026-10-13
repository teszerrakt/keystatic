import { Key, useEffect, useState } from 'react';
import { useClient } from 'urql';

import { Badge } from '@keystar/ui/badge';
import { ActionButton } from '@keystar/ui/button';
import { Icon } from '@keystar/ui/icon';
import { chevronDownIcon } from '@keystar/ui/icon/icons/chevronDownIcon';
import { chevronRightIcon } from '@keystar/ui/icon/icons/chevronRightIcon';
import { languagesIcon } from '@keystar/ui/icon/icons/languagesIcon';
import { Flex } from '@keystar/ui/layout';
import { Item, Menu, MenuTrigger, Section } from '@keystar/ui/menu';
import { useSlotProps } from '@keystar/ui/slots';
import { css, tokenSchema } from '@keystar/ui/style';
import { Text, VisuallyHidden } from '@keystar/ui/typography';

import { useRouter } from '../router';
import { useConfig } from '../shell/context';
import {
  useBranches,
  useCurrentBranch,
  useRepoInfo,
  useTree,
} from '../shell/data';
import { useNow } from './draft-data';
import {
  LanguageRow,
  LanguageStatus,
  languageMenuTitle,
  languageRows,
  statusLabel,
} from './page-languages';
import { useLanguages } from './pages-data';
import { pageFile } from './review-data';
import { hasDrafts } from './drafts';
import { translateFrom, translateHref } from './translate';

const crumb = css({
  color: tokenSchema.color.foreground.neutralSecondary,
  fontFamily: tokenSchema.typography.fontFamily.base,
  fontSize: tokenSchema.typography.text.medium.size,
  fontWeight: tokenSchema.typography.fontWeight.medium,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  '&:hover': { color: tokenSchema.color.foreground.neutralEmphasis },
});
const current = css({
  color: tokenSchema.color.foreground.neutralEmphasis,
  fontFamily: tokenSchema.typography.fontFamily.base,
  fontSize: tokenSchema.typography.text.medium.size,
  fontWeight: tokenSchema.typography.fontWeight.semibold,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

const pill = css({
  borderRadius: tokenSchema.size.radius.full,
  '&[aria-expanded=true]': { borderColor: tokenSchema.color.border.accent },
});

const tone: Record<
  LanguageStatus,
  'accent' | 'positive' | 'caution' | 'neutral'
> = {
  editing: 'accent',
  current: 'positive',
  stale: 'caution',
  missing: 'neutral',
};

// Menu items lay out by slot; the chip takes the trailing one.
function StatusChip(props: { status: LanguageStatus }) {
  const { UNSAFE_className } = useSlotProps<{
    id?: string;
    UNSAFE_className?: string;
  }>({}, 'kbd');
  return (
    <span className={UNSAFE_className}>
      <Badge tone={tone[props.status]}>{statusLabel[props.status]}</Badge>
    </span>
  );
}

// Last commit date of each language's copy, in one request.
function useUpdated(paths: Map<string, string>) {
  const client = useClient();
  const repoInfo = useRepoInfo();
  const branch = useCurrentBranch();
  const head = useBranches().get(branch)?.commitSha;
  const [updated, setUpdated] = useState(new Map<string, string>());
  const key = [...paths].map(([c, p]) => `${c}=${p}`).join('|');
  useEffect(() => {
    if (!repoInfo || !key) return;
    let cancelled = false;
    const entries = key.split('|').map(e => e.split('='));
    const fields = entries
      .map(
        ([, path], i) =>
          `f${i}: history(first: 1, path: ${JSON.stringify(
            path
          )}) { nodes { id committedDate } }`
      )
      .join('\n');
    client
      .query(
        `query PlusPageLanguages($owner: String!, $name: String!, $ref: String!) {
          repository(owner: $owner, name: $name) { id object(expression: $ref) { id ... on Commit { ${fields} } } }
        }`,
        { owner: repoInfo.owner, name: repoInfo.name, ref: head || branch },
        { requestPolicy: 'network-only' }
      )
      .toPromise()
      .then(res => {
        const obj = res.data?.repository?.object;
        if (cancelled || !obj) return;
        setUpdated(
          new Map(
            entries.flatMap(([collection], i) => {
              const date = obj[`f${i}`]?.nodes?.[0]?.committedDate;
              return date ? [[collection, date] as const] : [];
            })
          )
        );
      });
    return () => {
      cancelled = true;
    };
  }, [client, repoInfo, key, head, branch]);
  return updated;
}

function LanguageMenu(props: {
  collection: string;
  slug: string;
  basePath: string;
}) {
  const router = useRouter();
  const trees = useTree();
  const languages = useLanguages();
  const now = useNow(60_000);
  const current =
    trees.merged.kind === 'loaded' ? trees.merged.data.current : null;
  const paths = new Map<string, string>();
  for (const l of languages) {
    const path = current && pageFile(current, l.dir, props.slug);
    if (path) paths.set(l.collection, path);
  }
  const updated = useUpdated(paths);
  const rows = languageRows({
    languages,
    collection: props.collection,
    exists: new Set(paths.keys()),
    updated,
    now,
  });
  const here = rows.find(r => r.collection === props.collection);
  if (!here) return null;

  const open = (key: Key) => {
    const row = rows.find(r => r.collection === key);
    if (!row || row.status === 'editing') return;
    router.push(
      row.exists
        ? `${props.basePath}/collection/${encodeURIComponent(
            row.collection
          )}/item/${encodeURIComponent(props.slug)}`
        : translateHref(
            props.basePath,
            row.collection,
            props.collection,
            props.slug
          )
    );
  };

  return (
    <MenuTrigger>
      <ActionButton
        UNSAFE_className={pill}
        aria-label={`Language: ${here.language}`}
      >
        <Icon src={languagesIcon} />
        <Text>{here.language}</Text>
        <Icon src={chevronDownIcon} />
      </ActionButton>
      <Menu onAction={open} UNSAFE_className={css({ minWidth: 360 })}>
        <Section
          key="languages"
          title={languageMenuTitle(paths.size, languages.length)}
        >
          {rows.map((row: LanguageRow) => (
            <Item
              key={row.collection}
              textValue={row.exists ? row.language : `Add ${row.language}`}
            >
              <Text>
                {!row.exists && <VisuallyHidden>Add </VisuallyHidden>}
                {row.language}
              </Text>
              <Text slot="description">{row.note}</Text>
              <StatusChip status={row.status} />
            </Item>
          ))}
        </Section>
      </Menu>
    </MenuTrigger>
  );
}

export function pageTitleFrom(
  collection: { slugField: string },
  state: Record<string, unknown> | undefined,
  slug: string
) {
  const value = state?.[collection.slugField] as { name?: unknown } | undefined;
  return typeof value?.name === 'string' && value.name ? value.name : slug;
}

// "Pages › <title> [language]" on a page in drafts mode.
export function PageTitle(props: {
  collection: string;
  slug: string;
  basePath: string;
  title: string;
}) {
  const languages = useLanguages();
  return (
    <Flex flex minWidth={0} alignItems="center" gap="regular">
      <Flex
        elementType="nav"
        aria-label="Breadcrumbs"
        alignItems="center"
        gap="small"
        minWidth={0}
      >
        <a href={`${props.basePath}/pages`} className={crumb}>
          Pages
        </a>
        <Icon src={chevronRightIcon} color="neutralSecondary" />
        <span className={current} aria-current="page">
          {props.title}
        </span>
      </Flex>
      {languages.length > 1 && (
        <LanguageMenu
          collection={props.collection}
          slug={props.slug}
          basePath={props.basePath}
        />
      )}
    </Flex>
  );
}

// The create page's crumbs: "Pages › New page", or "Pages › Add <language>".
export function useCreateBreadcrumbs(collection: string, basePath: string) {
  const config = useConfig();
  const router = useRouter();
  const languages = useLanguages();
  if (!hasDrafts(config)) return null;
  const language = languages.find(l => l.collection === collection)?.language;
  return [
    { key: 'collection', label: 'Pages', href: `${basePath}/pages` },
    {
      key: 'current',
      label: translateFrom(router.href) ? `Add ${language}` : 'New page',
    },
  ];
}
