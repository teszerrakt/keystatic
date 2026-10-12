import { Key, KeyboardEvent, useMemo, useState } from 'react';
import { base64Encode } from '#base64';

import { ActionGroup, Item as ActionItem } from '@keystar/ui/action-group';
import { Badge } from '@keystar/ui/badge';
import { Button } from '@keystar/ui/button';
import { DialogContainer } from '@keystar/ui/dialog';
import { move, useDragAndDrop } from '@keystar/ui/drag-and-drop';
import type { ItemDropTarget } from '@keystar/ui/drag-and-drop';
import { Icon } from '@keystar/ui/icon';
import { arrowDownIcon } from '@keystar/ui/icon/icons/arrowDownIcon';
import { arrowUpIcon } from '@keystar/ui/icon/icons/arrowUpIcon';
import { plusIcon } from '@keystar/ui/icon/icons/plusIcon';
import { Box, Flex } from '@keystar/ui/layout';
import { Item, ListView } from '@keystar/ui/list-view';
import { Notice } from '@keystar/ui/notice';
import { ProgressCircle } from '@keystar/ui/progress';
import { Heading, Text } from '@keystar/ui/typography';

import { useDraftSaveCopy, useNewDraftName } from './drafts';
import { useCommitToDraft } from './draft-commit';
import {
  MenuSection,
  moveItem,
  sectionLabel,
  serializeSections,
} from './menu-sections';
import { useMenuPages, useMenuSections } from './menu-sections-data';
import { useLanguages } from './pages-data';
import { NewSectionDialog } from './section-dialog';

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

export function MenuSectionsPage() {
  const data = useMenuSections();
  const pages = useMenuPages();
  const languages = useLanguages().map(l => l.language);
  const [main, ...others] = languages;
  const copy = useDraftSaveCopy();
  const commit = useCommitToDraft();
  const newDraftName = useNewDraftName();
  const [edited, setEdited] = useState<MenuSection[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sections = edited ?? data.sections;
  const dirty =
    !!edited && JSON.stringify(edited) !== JSON.stringify(data.sections);
  const { setup, base } = data;

  const counts = new Map<string, number>();
  for (const p of pages ?? []) {
    counts.set(p.section, (counts.get(p.section) ?? 0) + 1);
  }

  const reorder = (from: number, to: number) => {
    if (!sections || to < 0 || to >= sections.length) return;
    setEdited(moveItem(sections, from, to));
  };

  const dragType = useMemo(
    () => `klay-section-${Math.random().toString(36).slice(2)}`,
    []
  );
  const { dragAndDropHooks } = useDragAndDrop({
    getItems(keys) {
      return [...keys].map(key => ({ [dragType]: String(key) }));
    },
    getAllowedDropOperations() {
      return ['move', 'cancel'];
    },
    async onDrop(e) {
      if (!sections || e.target.type === 'root') return;
      if (e.target.dropPosition === 'on') return;
      const keys: string[] = [];
      for (const item of e.items) {
        if (item.kind === 'text' && item.types.has(dragType)) {
          keys.push(await item.getText(dragType));
        }
      }
      const target = e.target as ItemDropTarget;
      const at = sections.findIndex(s => s.id === target.key);
      if (at === -1 || !keys.length) return;
      const to = target.dropPosition === 'before' ? at : at + 1;
      const indices = keys.map(k => sections.findIndex(s => s.id === k));
      setEdited(move(sections, indices, to));
    },
    getDropOperation(target) {
      return target.type === 'root' || target.dropPosition === 'on'
        ? 'cancel'
        : 'move';
    },
  });

  // Alt+↑/↓ moves the focused row.
  const onKeyDown = (e: KeyboardEvent) => {
    if (!sections || !e.altKey) return;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    const row = (e.target as HTMLElement).closest('[data-key]');
    const i = sections.findIndex(s => s.id === row?.getAttribute('data-key'));
    if (i === -1) return;
    e.preventDefault();
    e.stopPropagation();
    reorder(i, e.key === 'ArrowUp' ? i - 1 : i + 1);
  };

  const save = async () => {
    if (!edited || !setup) return;
    setSaving(true);
    setError(null);
    try {
      await commit({
        newDraft: newDraftName('menu-sections'),
        message: { headline: `Update ${setup.path}` },
        additions: [
          {
            path: setup.path,
            contents: base64Encode(
              new TextEncoder().encode(serializeSections(edited, languages))
            ),
          },
        ],
        href: b => `/keystatic/branch/${encodeURIComponent(b)}/menu-sections`,
      });
      setEdited(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const describe = (s: MenuSection) =>
    [
      ...others.map(l =>
        s.label[l] ? `${l}: ${s.label[l]}` : `${l}: not translated`
      ),
      pages ? plural(counts.get(s.id) ?? 0, 'page') : null,
    ]
      .filter(Boolean)
      .join(' · ');

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
            Menu sections
          </Heading>
          {sections && (
            <Text color="neutralSecondary">
              {plural(sections.length, 'section')}
            </Text>
          )}
          <Flex marginStart="auto" alignItems="center" gap="regular">
            {dirty && <Badge tone="pending">Unsaved changes</Badge>}
            <Button isDisabled={!sections} onPress={() => setAdding(true)}>
              <Icon src={plusIcon} />
              <Text>New section</Text>
            </Button>
            <Button
              prominence="high"
              isDisabled={!dirty || saving}
              onPress={save}
            >
              {saving ? 'Saving…' : copy?.save ?? 'Save'}
            </Button>
          </Flex>
        </Flex>
      </Box>

      <Box
        flex
        minHeight={0}
        overflow="auto"
        paddingX="xxlarge"
        paddingY="xlarge"
      >
        <Flex direction="column" gap="large" maxWidth="container.medium">
          <Text color="neutralSecondary">
            Sections group pages in the docs menu. Drag a section to move it, or
            use the arrows. A section shows on the site once it has a published
            page.
          </Text>
          {error && <Notice tone="critical">{error}</Notice>}
          {!setup ? (
            <Text>This site has no menu sections set up.</Text>
          ) : !sections ? (
            <ProgressCircle isIndeterminate aria-label="Loading sections" />
          ) : (
            <div onKeyDownCapture={onKeyDown}>
              <ListView
                aria-label="Menu sections"
                items={sections.map((s, i) => ({
                  ...s,
                  index: i,
                  name: sectionLabel(s, main, main),
                  detail: describe(s),
                  isNew: !!base && !base.some(b => b.id === s.id),
                }))}
                dragAndDropHooks={dragAndDropHooks}
                selectionMode="none"
                overflowMode="wrap"
                renderEmptyState={() => (
                  <Flex padding="large" justifyContent="center">
                    <Text color="neutralSecondary">
                      No menu sections yet. Add the first one.
                    </Text>
                  </Flex>
                )}
                minHeight="scale.1600"
              >
                {s => {
                  const { index: i, name: label, isNew } = s;
                  return (
                    <Item key={s.id} textValue={label}>
                      <Text>
                        {label}
                        {isNew && (
                          <Badge tone="accent" marginStart="regular">
                            New
                          </Badge>
                        )}
                      </Text>
                      <Text slot="description">{s.detail}</Text>
                      <ActionGroup
                        aria-label={`Move ${label}`}
                        buttonLabelBehavior="hide"
                        disabledKeys={[
                          ...(i === 0 ? ['up'] : []),
                          ...(i === sections.length - 1 ? ['down'] : []),
                        ]}
                        onAction={(key: Key) =>
                          reorder(i, key === 'up' ? i - 1 : i + 1)
                        }
                      >
                        <ActionItem key="up" textValue="Move up">
                          <Icon src={arrowUpIcon} />
                          <Text>Move up</Text>
                        </ActionItem>
                        <ActionItem key="down" textValue="Move down">
                          <Icon src={arrowDownIcon} />
                          <Text>Move down</Text>
                        </ActionItem>
                      </ActionGroup>
                    </Item>
                  );
                }}
              </ListView>
            </div>
          )}
        </Flex>
      </Box>
      <DialogContainer onDismiss={() => setAdding(false)}>
        {adding && sections && (
          <NewSectionDialog
            sections={sections}
            languages={languages}
            footer="Save afterwards to keep it. It shows on the site once a page in it is published."
            onAdd={list => setEdited(list)}
          />
        )}
      </DialogContainer>
    </Flex>
  );
}
