import { Key, useMemo, useState } from 'react';

import { ActionGroup, Item } from '@keystar/ui/action-group';
import { Badge } from '@keystar/ui/badge';
import { ActionButton, Button } from '@keystar/ui/button';
import { Icon } from '@keystar/ui/icon';
import { plusIcon } from '@keystar/ui/icon/icons/plusIcon';
import { Box, Flex } from '@keystar/ui/layout';
import { TextLink } from '@keystar/ui/link';
import { DialogContainer } from '@keystar/ui/dialog';
import { ActionMenu } from '@keystar/ui/menu';
import { Picker } from '@keystar/ui/picker';
import { ProgressCircle } from '@keystar/ui/progress';
import { SearchField } from '@keystar/ui/search-field';
import { css, tokenSchema } from '@keystar/ui/style';
import { toastQueue } from '@keystar/ui/toast';
import { Heading, Text } from '@keystar/ui/typography';

import { useRouter } from '../router';
import { useConfig } from '../shell/context';
import { useCurrentBranch } from '../shell/data';
import { liveHrefFor, useNow } from './draft-data';
import { ago, capitalize, PageRow } from './pages';
import { DeletePageDialog } from './page-delete-dialog';
import { useLanguages, usePages, useRestorePage } from './pages-data';
import { languageList } from './review';

const card = css({
  background: tokenSchema.color.background.canvas,
  border: `${tokenSchema.size.border.regular} solid ${tokenSchema.color.border.muted}`,
  borderRadius: tokenSchema.size.radius.large,
});

const grid = (draft: boolean) =>
  css({
    alignItems: 'center',
    display: 'grid',
    gap: tokenSchema.size.space.regular,
    gridTemplateColumns: draft
      ? 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.2fr)'
      : 'minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) 40px',
    minHeight: 48,
    paddingInline: tokenSchema.size.space.large,
    '& + &': {
      borderTop: `${tokenSchema.size.border.regular} solid ${tokenSchema.color.border.muted}`,
    },
  });

const draftChip = {
  new: { tone: 'accent', label: 'New page' },
  edited: { tone: 'caution', label: 'Edited' },
  deleted: { tone: 'critical', label: 'Will be deleted' },
} as const;

function ColumnHead(props: { children: string }) {
  return (
    <Text
      size="small"
      weight="semibold"
      color="neutralSecondary"
      casing="uppercase"
    >
      {props.children}
    </Text>
  );
}

export function PagesPage() {
  const config = useConfig();
  const router = useRouter();
  const branch = useCurrentBranch();
  const languages = useLanguages();
  const pages = usePages();
  const restore = useRestorePage();
  const now = useNow(60_000);
  const [search, setSearch] = useState('');
  const [missingOnly, setMissingOnly] = useState(false);
  const [view, setView] = useState<'all' | 'changed' | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<PageRow | null>(null);

  const base = `/keystatic/branch/${encodeURIComponent(branch)}`;
  const editHref = (collection: string, slug: string) =>
    `${base}/collection/${encodeURIComponent(
      collection
    )}/item/${encodeURIComponent(slug)}`;
  const rows = useMemo(
    () => (pages.kind === 'loaded' ? pages.rows : []),
    [pages]
  );
  const onLive = pages.kind === 'loaded' && pages.onLive;
  const changedCount = rows.filter(r => r.draft).length;
  const shown = view ?? (!onLive && changedCount ? 'changed' : 'all');
  const draftView = !onLive && shown === 'changed';

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      r =>
        (!q || r.title.toLowerCase().includes(q) || r.slug.includes(q)) &&
        (!missingOnly || r.missing.length > 0) &&
        (shown === 'all' || r.draft)
    );
  }, [rows, search, missingOnly, shown]);

  const onAction = (row: PageRow, key: Key) => {
    const k = String(key);
    if (k === 'edit') router.push(editHref(row.collection, row.slug));
    if (k === 'delete') setDeleting(row);
    if (k === 'duplicate') {
      router.push(
        `${base}/collection/${encodeURIComponent(
          row.collection
        )}/create?duplicate=${encodeURIComponent(row.slug)}`
      );
    }
    if (k === 'live') {
      const href = liveHrefFor(config, [
        'branch',
        branch,
        'collection',
        row.collection,
        'item',
        row.slug,
      ]);
      if (href) window.open(href, '_blank', 'noopener,noreferrer');
    }
  };

  const undo = async (row: PageRow) => {
    setRestoring(row.slug);
    try {
      await restore(row);
      toastQueue.positive(`“${row.title}” is back in this draft.`, {
        timeout: 5000,
      });
    } catch (e) {
      toastQueue.critical((e as Error).message, { timeout: 8000 });
    } finally {
      setRestoring(null);
    }
  };

  const hasLive = config.storage.kind !== 'local' && !!config.storage.siteUrl;
  const menuItems = (row: PageRow) => [
    { key: 'edit', label: 'Edit' },
    { key: 'duplicate', label: 'Duplicate as new page' },
    ...(hasLive && row.draft !== 'new'
      ? [{ key: 'live', label: 'Open on the live site' }]
      : []),
    { key: 'delete', label: 'Delete page…' },
  ];

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
        paddingY="large"
      >
        <Flex alignItems="center" gap="large" wrap>
          <Heading elementType="h1" size="large">
            Pages
          </Heading>
          {onLive ? (
            <Text color="neutralSecondary">
              {rows.length === 1 ? '1 page' : `${rows.length} pages`}
            </Text>
          ) : (
            <ActionGroup
              aria-label="Which pages"
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={[shown]}
              onSelectionChange={keys =>
                setView([...keys][0] as 'all' | 'changed')
              }
              density="compact"
            >
              <Item key="all">{`All ${rows.length}`}</Item>
              <Item key="changed">{`Changed in this draft ${changedCount}`}</Item>
            </ActionGroup>
          )}
          <Box marginStart="auto">
            <Button
              prominence="high"
              href={
                languages[0]
                  ? `${base}/collection/${encodeURIComponent(
                      languages[0].collection
                    )}/create`
                  : undefined
              }
            >
              <Icon src={plusIcon} />
              <Text>New page</Text>
            </Button>
          </Box>
        </Flex>
      </Box>

      <Box
        flex
        minHeight={0}
        overflow="auto"
        paddingX="xxlarge"
        paddingY="xlarge"
      >
        <Flex direction="column" gap="large" maxWidth="container.large">
          {!draftView && (
            <Flex gap="regular" wrap alignItems="end">
              <SearchField
                aria-label="Search pages"
                placeholder="Search pages"
                value={search}
                onChange={setSearch}
                width="scale.3600"
              />
              {languages.length > 1 && (
                <Picker
                  label="Language"
                  selectedKey={missingOnly ? 'missing' : 'all'}
                  onSelectionChange={k => setMissingOnly(k === 'missing')}
                  width="scale.3000"
                >
                  <Item key="all">All</Item>
                  <Item key="missing">Missing a translation</Item>
                </Picker>
              )}
            </Flex>
          )}

          {pages.kind === 'loading' ? (
            <ProgressCircle isIndeterminate aria-label="Loading pages" />
          ) : (
            <div className={card} role="table" aria-label="Pages">
              <div className={grid(draftView)} role="row">
                <ColumnHead>Page</ColumnHead>
                <ColumnHead>Menu section</ColumnHead>
                <ColumnHead>
                  {draftView ? 'Languages changed' : 'Languages'}
                </ColumnHead>
                <ColumnHead>
                  {draftView ? 'In this draft' : 'Updated'}
                </ColumnHead>
                {!draftView && <span />}
              </div>
              {visible.map(row => (
                <div key={row.slug} className={grid(draftView)} role="row">
                  {row.draft === 'deleted' ? (
                    <Text weight="medium">{row.title}</Text>
                  ) : (
                    <TextLink href={editHref(row.collection, row.slug)}>
                      {row.title}
                    </TextLink>
                  )}
                  <Text color="neutralSecondary" truncate>
                    {row.section ?? '—'}
                  </Text>
                  {draftView ? (
                    <Text color="neutralSecondary">
                      {languageList(row.changedLanguages)}
                    </Text>
                  ) : row.draft === 'deleted' ? (
                    <Text color="neutralSecondary">—</Text>
                  ) : row.missing.length ? (
                    <Text
                      color="caution"
                      title={`Missing: ${row.missing.join(', ')}`}
                    >
                      {`${row.missing.length} missing`}
                    </Text>
                  ) : (
                    <Text color="neutralSecondary">
                      {languages.length > 1
                        ? 'All languages'
                        : row.languages[0]}
                    </Text>
                  )}
                  {draftView ? (
                    <Flex alignItems="center" gap="regular">
                      {row.draft && (
                        <Badge tone={draftChip[row.draft].tone}>
                          {draftChip[row.draft].label}
                        </Badge>
                      )}
                      {row.deletedIn.length > 0 && (
                        <ActionButton
                          prominence="low"
                          isDisabled={restoring === row.slug}
                          onPress={() => undo(row)}
                        >
                          {row.draft === 'deleted' ? 'Undo' : 'Undo delete'}
                        </ActionButton>
                      )}
                    </Flex>
                  ) : (
                    <Text color="neutralSecondary">
                      {row.draft ? (
                        <Badge tone={draftChip[row.draft].tone}>
                          {draftChip[row.draft].label}
                        </Badge>
                      ) : (
                        capitalize(ago(row.updated, now)) || '—'
                      )}
                    </Text>
                  )}
                  {!draftView &&
                    (row.draft === 'deleted' ? (
                      <span />
                    ) : (
                      <ActionMenu
                        aria-label={`More for ${row.title}`}
                        prominence="low"
                        items={menuItems(row)}
                        onAction={key => onAction(row, key)}
                      >
                        {item => <Item key={item.key}>{item.label}</Item>}
                      </ActionMenu>
                    ))}
                </div>
              ))}
              {visible.length === 0 && (
                <Box padding="large">
                  <Text color="neutralSecondary">
                    {draftView
                      ? 'No pages changed in this draft yet.'
                      : 'No pages match.'}
                  </Text>
                </Box>
              )}
            </div>
          )}
          {!onLive && (
            <Text color="neutralSecondary">
              Readers see none of this until you publish.
            </Text>
          )}
          <DialogContainer onDismiss={() => setDeleting(null)}>
            {deleting && (
              <DeletePageDialog
                slug={deleting.slug}
                title={deleting.title}
                collection={deleting.collection}
              />
            )}
          </DialogContainer>
        </Flex>
      </Box>
    </Flex>
  );
}
